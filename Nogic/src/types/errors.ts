export type ErrorBucket = "network" | "model" | "gpu" | "db" | "file";

export type ErrorActionKind = "retry" | "open_logs" | "open_settings";

export interface ErrorAction {
  kind: ErrorActionKind;
  label: string;
}

export interface ErrorPayload {
  bucket: ErrorBucket;
  message: string;
  action?: ErrorAction | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isErrorPayload(value: unknown): value is ErrorPayload {
  if (!isRecord(value)) return false;
  const payload = value;
  const action = payload.action;
  const validAction =
    action === undefined ||
    action === null ||
    (isRecord(action) &&
      ["retry", "open_logs", "open_settings"].includes(String(action.kind)) &&
      typeof action.label === "string");
  return (
    ["network", "model", "gpu", "db", "file"].includes(String(payload.bucket)) &&
    typeof payload.message === "string" &&
    validAction
  );
}

export function normalizeErrorPayload(value: unknown): ErrorPayload {
  if (isErrorPayload(value)) return value;
  if (isRecord(value)) {
    const record = value;
    if (isErrorPayload(record.payload)) return record.payload;
    value = record.message ?? record.error;
  }
  const detail = value instanceof Error ? value.message : String(value ?? "");
  const lower = detail.toLowerCase();
  if (
    lower.includes("os error 232") ||
    lower.includes("connection refused") ||
    lower.includes("connection error") ||
    lower.includes("connecterror") ||
    lower.includes("failed to connect") ||
    lower.includes("the nogic engine isn't running")
  ) {
    return {
      bucket: "network",
      message: "The Nogic engine isn't running. Click Retry.",
      action: { kind: "retry", label: "Retry" },
    };
  }
  if (["0xc0000409", "cuda", "vram", "out of memory", "oom"].some((part) => lower.includes(part))) {
    return {
      bucket: "gpu",
      message: "The model ran out of memory.",
      action: { kind: "open_settings", label: "Open Settings" },
    };
  }
  if (["model not found", "no model selected", "model does not exist"].some((part) => lower.includes(part))) {
    return {
      bucket: "model",
      message: "The selected model isn't available.",
      action: { kind: "open_settings", label: "Open Settings" },
    };
  }
  if (lower.includes("modulenotfounderror")) {
    return {
      bucket: "file",
      message: "The engine is missing a file.",
      action: { kind: "open_logs", label: "Open Logs" },
    };
  }
  if (lower.includes("no such table") || lower.includes("sqlite")) {
    return {
      bucket: "db",
      message: "Couldn't read local data.",
      action: { kind: "retry", label: "Retry" },
    };
  }
  return {
    bucket: "file",
    message: "Nogic couldn't complete this action. Check the logs.",
    action: { kind: "open_logs", label: "Open Logs" },
  };
}
