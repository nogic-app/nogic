#!/usr/bin/env python3
"""
scrape_plants.py - build a provenance-tracked plant CSV from Plants For A Future (PFAF).

Usage:
    pip install requests beautifulsoup4

    # 1) names in a text file, one Latin name per line (blank lines and # comments ignored)
    python scrape_plants.py plant_names.txt

    # 2) names on the command line, comma-separated
    python scrape_plants.py --names "Olea europaea, Lavandula angustifolia"

    # 3) edit the NAMES list below and run with no arguments
    python scrape_plants.py

Options:
    --out plants_global.csv   output file (default: plants_global.csv)
    --delay 1.5               seconds to wait between requests (default: 1.5)

Rules this script follows:
  * Nothing is guessed. A field that cannot be parsed from the page is left blank.
  * source_url is the exact PFAF URL requested.
  * source_quote is copied verbatim from the page (the sentence(s) about light/moisture).
  * All mappings (moisture -> water_need, shade -> sun_exposure) are in the two
    tables below, so you can change them if you disagree with a judgement call.

PFAF text is licensed CC BY 4.0, so keep the attribution (source_url) in your data.
"""

import argparse
import csv
import re
import sys
import time
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

# --------------------------------------------------------------------------
# Put your 100 Latin names here if you prefer not to use a file.
# --------------------------------------------------------------------------
NAMES = [
    # "Olea europaea",
    # "Lavandula angustifolia",
]

BASE_URL = "https://pfaf.org/user/Plant.aspx?LatinName={}"
USER_AGENT = (
    "Mozilla/5.0 (compatible; plant-data-research/1.0; "
    "personal non-commercial use; polite 1.5s delay)"
)
CSV_HEADERS = [
    "latin_name",
    "common_name_en",
    "water_need",
    "sun_exposure",
    "height_m",
    "flower_color",
    "native_region",
    "source_url",
    "source_quote",
]

# --------------------------------------------------------------------------
# Mapping tables. PFAF moisture words: dry / moist / wet.
# Any combination not listed here is left BLANK rather than guessed.
# --------------------------------------------------------------------------
MOISTURE_MAP = {
    frozenset({"dry"}): "low",
    frozenset({"moist"}): "medium",
    frozenset({"wet"}): "high",
    frozenset({"dry", "moist"}): "low",          # tolerates dry soil -> low need
    frozenset({"moist", "wet"}): "high",
    frozenset({"dry", "moist", "wet"}): "medium",
}

# PFAF shade words: "no shade" (= full sun), "semi-shade", "full shade".
SHADE_MAP = {
    frozenset({"none"}): "full",
    frozenset({"semi"}): "partial",
    frozenset({"full"}): "shade",
    frozenset({"none", "semi"}): "full",
    frozenset({"semi", "full"}): "shade",
    frozenset({"none", "semi", "full"}): "partial",
}

COLOURS = (
    "white|cream|ivory|yellow|golden|orange|red|crimson|scarlet|pink|rose|"
    "magenta|purple|violet|mauve|lilac|lavender|blue|green|greenish|brown|"
    "maroon|silver"
)


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------
def fetch(session, url, retries=3):
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=30)
            if resp.status_code == 200:
                return resp.text
            print(f"  HTTP {resp.status_code} for {url}", file=sys.stderr)
            if resp.status_code in (404, 410):
                return None
        except requests.RequestException as exc:
            print(f"  request error ({exc}) for {url}", file=sys.stderr)
        time.sleep(3 * attempt)  # back off before retrying
    return None


# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------
def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def split_sentences(text):
    # Split on sentence-ending punctuation followed by whitespace + capital/quote/digit.
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(])", clean(text))
    return [p.strip() for p in parts if p.strip()]


def text_of_id(soup, id_fragment):
    el = soup.find(id=re.compile(id_fragment, re.I))
    return clean(el.get_text(" ")) if el else ""


def parse_height_m(page_text):
    """Reads 'growing to 10 m (32ft 9in)' style text. Returns metres as str or ''."""
    m = re.search(r"growing to\s+([\d]+(?:\.\d+)?)\s*(cm|m|ft)\b", page_text, re.I)
    if not m:
        return ""
    value, unit = float(m.group(1)), m.group(2).lower()
    if unit == "cm":
        value /= 100.0
    elif unit == "ft":
        value *= 0.3048
    return f"{value:.2f}".rstrip("0").rstrip(".")


def parse_moisture(sentences):
    """Returns (water_need, quote_sentence)."""
    for s in sentences:
        m = re.search(r"prefers?\s+(.*?)\s+soil", s, re.I)
        if not m:
            continue
        words = set(re.findall(r"\b(dry|moist|wet)\b", m.group(1).lower()))
        if words:
            return MOISTURE_MAP.get(frozenset(words), ""), s
    return "", ""


def parse_shade(sentences):
    """Returns (sun_exposure, quote_sentence)."""
    for s in sentences:
        low = s.lower()
        if "shade" not in low:
            continue
        found = set()
        if re.search(r"cannot grow in (the )?shade", low):
            found = {"none"}
        else:
            if re.search(r"\bno shade\b", low):
                found.add("none")
            if re.search(r"semi-?\s?shade", low):
                found.add("semi")
            if re.search(r"\bfull shade\b", low):
                found.add("full")
        if found:
            return SHADE_MAP.get(frozenset(found), ""), s
    return "", ""


def parse_flower_colour(sentences):
    """Only returns a colour if a colour word sits right next to 'flower(s)'."""
    pat_a = re.compile(rf"\b({COLOURS})\b(?:\s+\w+){{0,2}}\s+flowers?\b", re.I)
    pat_b = re.compile(
        rf"\bflowers?\b(?:\s+\w+){{0,3}}\s+\b({COLOURS})\b", re.I
    )
    for s in sentences:
        m = pat_a.search(s) or pat_b.search(s)
        if m:
            return m.group(1).lower()
    return ""


def parse_range(soup, page_text):
    val = text_of_id(soup, r"lblRange")
    if not val:
        m = re.search(
            r"\bRange\s*:?\s*(.+?)\s+(?:Habitats?|Edibility|Edible Uses|Medicinal|"
            r"Other Uses|Cultivation|Known Hazards)\b",
            page_text,
        )
        val = clean(m.group(1)) if m else ""
    return val.rstrip(". ").strip()


def parse_plant(html, requested_name, url):
    soup = BeautifulSoup(html, "html.parser")
    page_text = clean(soup.get_text(" "))
    sentences = split_sentences(page_text)

    latin = text_of_id(soup, r"lbldisplatinname") or requested_name
    common = text_of_id(soup, r"lbldisplaycommonname")

    water, water_q = parse_moisture(sentences)
    sun, sun_q = parse_shade(sentences)

    quotes = []
    for q in (sun_q, water_q):
        if q and q not in quotes:
            quotes.append(q)

    return {
        "latin_name": latin,
        "common_name_en": common,
        "water_need": water,
        "sun_exposure": sun,
        "height_m": parse_height_m(page_text),
        "flower_color": parse_flower_colour(sentences),
        "native_region": parse_range(soup, page_text),
        "source_url": url,
        "source_quote": " ".join(quotes),
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def load_names(args):
    names = []
    if args.names:
        names += [n.strip() for n in args.names.split(",")]
    if args.names_file:
        with open(args.names_file, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#"):
                    names.append(line)
    if not names:
        names = [n for n in NAMES if n.strip()]
    # de-duplicate, keep order
    seen, unique = set(), []
    for n in names:
        if n.lower() not in seen:
            seen.add(n.lower())
            unique.append(n)
    return unique


def main():
    ap = argparse.ArgumentParser(description="Scrape PFAF into a plant CSV.")
    ap.add_argument("names_file", nargs="?", help="text file, one Latin name per line")
    ap.add_argument("--names", help="comma-separated Latin names")
    ap.add_argument("--out", default="plants_global.csv")
    ap.add_argument("--delay", type=float, default=1.5)
    args = ap.parse_args()

    names = load_names(args)
    if not names:
        ap.error("no plant names given (file, --names, or the NAMES list in the script)")

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    failed = []
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_HEADERS)
        writer.writeheader()

        for i, name in enumerate(names, 1):
            url = BASE_URL.format(quote_plus(name))
            print(f"[{i}/{len(names)}] {name}")
            html = fetch(session, url)

            if html is None:
                failed.append(name)
                writer.writerow({"latin_name": name, "source_url": url,
                                 **{h: "" for h in CSV_HEADERS[1:-2]},
                                 "source_quote": ""})
            else:
                row = parse_plant(html, name, url)
                if not any(row[k] for k in ("common_name_en", "water_need",
                                            "sun_exposure", "height_m",
                                            "native_region")):
                    print("  nothing parsed - name may not exist on PFAF "
                          "(check spelling / synonym)", file=sys.stderr)
                    failed.append(name)
                writer.writerow(row)
            fh.flush()  # keep partial results if you stop the script

            if i < len(names):
                time.sleep(args.delay)

    print(f"\nDone. Wrote {args.out}")
    if failed:
        print("Check these names (fetch failed or nothing parsed):")
        for n in failed:
            print(f"  - {n}")


if __name__ == "__main__":
    main()
