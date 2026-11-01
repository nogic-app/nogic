export interface LawSource {
  law_name: string;
  /** Contained document title when the PDF is a recueil. */
  sub_law?: string;
  article_num: string;
  page_num: number;
  country?: string;
}

export function lawSourceLabel(source: LawSource): string {
  const name = source.sub_law?.trim() || source.law_name;
  return `${name}, art. ${source.article_num} (p. ${source.page_num})`;
}

export function isLawSourceArray(data: unknown): data is LawSource[] {
  return (
    Array.isArray(data) &&
    data.every(
      (source) =>
        typeof source === "object" &&
        source !== null &&
        "law_name" in source &&
        typeof source.law_name === "string" &&
        (!("sub_law" in source) ||
          source.sub_law === null ||
          typeof source.sub_law === "string") &&
        "article_num" in source &&
        typeof source.article_num === "string" &&
        "page_num" in source &&
        typeof source.page_num === "number" &&
        (!("country" in source) ||
          typeof source.country === "string"),
    )
  );
}
