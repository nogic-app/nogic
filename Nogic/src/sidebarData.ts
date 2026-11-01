export interface ProjectItem {
  id: string;
  name: string;
  date: string;
  is_pinned: boolean;
}

export interface ChatItem {
  id: string;
  title: string;
  project_id: string | null;
  created_at: string;
  is_pinned: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isProjectItem(value: unknown): value is ProjectItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.date === "string"
    && typeof value.is_pinned === "boolean"
  );
}

export function isChatItem(value: unknown): value is ChatItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (typeof value.project_id === "string" || value.project_id === null) &&
    typeof value.created_at === "string"
    && typeof value.is_pinned === "boolean"
  );
}
