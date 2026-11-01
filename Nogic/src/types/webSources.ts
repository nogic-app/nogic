export interface WebSource {
  title: string;
  url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWebSourceArray(value: unknown): value is WebSource[] {
  return (
    Array.isArray(value) &&
    value.every(
      (source) =>
        isRecord(source) &&
        typeof source.title === "string" &&
        typeof source.url === "string",
    )
  );
}
