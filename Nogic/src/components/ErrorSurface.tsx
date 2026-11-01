import { useState } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import type { ErrorAction, ErrorPayload } from "@/types/errors";

interface ErrorSurfaceProps {
  payload: ErrorPayload;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

export function ErrorSurface({
  payload,
  onRetry,
  onOpenSettings,
}: ErrorSurfaceProps) {
  const [actionError, setActionError] = useState<string | null>(null);
  const action = payload.action;
  const canDispatchAction =
    action?.kind === "open_logs" ||
    (action?.kind === "retry" && onRetry !== undefined) ||
    (action?.kind === "open_settings" && onOpenSettings !== undefined);

  const dispatch = async (action: ErrorAction) => {
    if (action.kind === "retry") {
      onRetry?.();
      return;
    }
    if (action.kind === "open_settings") {
      onOpenSettings?.();
      return;
    }
    try {
      await openPath(await join(await appDataDir(), "logs"));
      setActionError(null);
    } catch (error) {
      console.error("Could not open Nogic logs.", error);
      setActionError("Could not open the logs folder.");
    }
  };

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 left-1/2 z-[70] w-[min(90vw,520px)] -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-meta uppercase tracking-wide text-[var(--text-secondary)]">
            {payload.bucket.charAt(0).toUpperCase() + payload.bucket.slice(1)}
          </p>
          <p className="mt-1 text-sec text-[var(--text-primary)]">
            {payload.message}
          </p>
          {actionError ? (
            <p className="mt-1 text-meta text-[var(--danger)]">{actionError}</p>
          ) : null}
        </div>
        {action && canDispatchAction ? (
          <button
            type="button"
            onClick={() => void dispatch(action)}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-meta text-[var(--text-primary)] hover:bg-[var(--bg-muted)]"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </aside>
  );
}
