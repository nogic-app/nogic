"""DuckDuckGo web search used only when the user enables Web mode.

Primary path: the `duckduckgo_search` package. Some networks return an empty
or irrelevant payload from its backend, so a small HTML fallback keeps Web
mode useful without adding another dependency. Every failure is reported on
stderr and becomes an empty result list; stdout stays valid JSON-RPC.
"""

import re
import sys
import urllib.parse
import urllib.request
import warnings
from html.parser import HTMLParser
from typing import Any

MAX_RESULTS = 3
REQUEST_TIMEOUT_SECONDS = 12
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)
STOP_WORDS = frozenset({
    "the", "and", "for", "with", "what", "which", "who", "how", "why",
    "does", "from", "into", "about", "that", "this", "are", "can", "you",
})


def _log(message: str) -> None:
    print(f"Web search: {message}", file=sys.stderr, flush=True)


def _clean_url(href: str) -> str:
    """Unwrap DuckDuckGo redirect links into the destination URL."""
    if href.startswith("//"):
        href = f"https:{href}"
    parsed = urllib.parse.urlparse(href)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        target = urllib.parse.parse_qs(parsed.query).get("uddg", [""])[0]
        return urllib.parse.unquote(target)
    return href


def _relevant(results: list[dict[str, str]], query: str) -> list[dict[str, str]]:
    """Drop results that share no meaningful token with the query."""
    tokens = {
        token
        for token in re.findall(r"[a-z0-9]{3,}", query.casefold())
        if token not in STOP_WORDS
    }
    if not tokens:
        return results
    kept = []
    for result in results:
        haystack = " ".join(
            (result["title"], result["snippet"], result["url"])
        ).casefold()
        if any(token in haystack for token in tokens):
            kept.append(result)
    return kept


def _search_library(query: str, max_results: int) -> list[dict[str, str]]:
    try:
        with warnings.catch_warnings():
            # The package warns on import and on every call that it was
            # renamed to `ddgs`; that warning is noise in the Tauri terminal.
            warnings.simplefilter("ignore")
            from duckduckgo_search import DDGS
            raw_results = DDGS().text(query, max_results=max_results)
    except ImportError:
        _log("duckduckgo-search is not installed.")
        return []
    except Exception as error:
        _log(f"library search failed: {error}")
        return []

    results: list[dict[str, str]] = []
    for item in raw_results or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("href") or item.get("url") or "").strip()
        snippet = str(item.get("body") or item.get("snippet") or "").strip()
        if title and url.startswith(("http://", "https://")):
            results.append({"title": title, "url": url, "snippet": snippet})
    return _relevant(results, query)[:max_results]


class _ResultParser(HTMLParser):
    """Collect result__a titles/links and result__snippet text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.results: list[dict[str, str]] = []
        self._current: dict[str, str] | None = None
        self._capture: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = (dict(attrs).get("class") or "").split()
        if tag == "a" and "result__a" in classes:
            self._finish()
            self._current = {
                "title": "",
                "url": _clean_url(dict(attrs).get("href") or ""),
                "snippet": "",
            }
            self._capture = "title"
            self._buffer = []
        elif self._current is not None and "result__snippet" in classes:
            self._capture = "snippet"
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._current is None or self._capture is None:
            return
        if self._capture == "title" and tag == "a":
            self._current["title"] = " ".join("".join(self._buffer).split())
            self._capture = None
        elif self._capture == "snippet" and tag in ("a", "div", "span"):
            self._current["snippet"] = " ".join("".join(self._buffer).split())
            self._capture = None

    def _finish(self) -> None:
        if self._current and self._current["url"].startswith(("http://", "https://")):
            self.results.append(self._current)
        self._current = None

    def close(self) -> None:
        super().close()
        self._finish()


def _search_html(query: str, max_results: int) -> list[dict[str, str]]:
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote_plus(query)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            page = response.read().decode("utf-8", errors="replace")
    except Exception as error:
        _log(f"HTML fallback failed: {error}")
        return []

    parser = _ResultParser()
    parser.feed(page)
    parser.close()
    return _relevant(parser.results, query)[:max_results]


def search_web(query: str, max_results: int = MAX_RESULTS) -> list[dict[str, Any]]:
    """Return up to `max_results` web results for a query.

    The list is empty when the network is unavailable, the package is
    missing, or DuckDuckGo returns nothing usable.
    """
    limit = max(1, min(max_results, MAX_RESULTS))
    results = _search_library(query, limit)
    if not results:
        results = _search_html(query, limit)
    if not results:
        _log("no usable results.")
    return results


def format_web_results(results: list[dict[str, Any]]) -> str:
    """Render results as compact prompt context."""
    blocks = []
    for index, result in enumerate(results, start=1):
        blocks.append(
            f"[{index}] {result['title']}\n"
            f"URL: {result['url']}\n"
            f"{result['snippet']}"
        )
    return "\n\n".join(blocks)


def web_sources_from_results(
    results: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Reduce search results to the title/URL pairs the UI renders as favicons."""
    sources: list[dict[str, str]] = []
    for result in results:
        title = str(result.get("title") or "").strip()
        url = str(result.get("url") or "").strip()
        if title and url.startswith(("http://", "https://")):
            sources.append({"title": title, "url": url})
    return sources


def build_web_system_prompt(results: list[dict[str, Any]]) -> str:
    """Web-mode prompt: answer from the provided search results."""
    return (
        "You are Nogic, a local AI colleague for landscape architecture. "
        "Be concise and helpful. Answer the user's question using the web "
        "search results below. When you use a fact from a result, name its "
        "source title in parentheses. Do not paste bare URLs or Markdown "
        "links; the app lists the sources beneath the answer. If the results "
        "do not answer the question, say so plainly.\n\n"
        "Web search results:\n"
        f"{format_web_results(results)}"
    )
