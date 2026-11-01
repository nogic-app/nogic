import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

export function TitleBar() {
  const [appWindow, setAppWindow] = useState<ReturnType<typeof getCurrentWindow> | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (isTauri()) setAppWindow(getCurrentWindow());
  }, []);

  useEffect(() => {
    if (!appWindow) return;
    let unlisten: (() => void) | undefined;
    let mounted = true;

    const updateMaximized = () => {
      void appWindow
        .isMaximized()
        .then((maximized) => {
          if (mounted) setIsMaximized(maximized);
        })
        .catch((error: unknown) => {
          console.error("Failed to read the window's maximized state.", error);
        });
    };

    updateMaximized();
    void appWindow
      .onResized(updateMaximized)
      .then((stopListening) => {
        if (mounted) unlisten = stopListening;
        else stopListening();
      })
      .catch((error: unknown) => {
        console.error("Failed to listen for window resize events.", error);
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [appWindow]);

  const minimize = async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("Failed to minimize the window.", error);
    }
  };

  const toggleMaximize = async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().toggleMaximize();
      setIsMaximized(await getCurrentWindow().isMaximized());
    } catch (error) {
      console.error("Failed to maximize or restore the window.", error);
    }
  };

  const close = async () => {
    if (!isTauri()) return;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to close the window.", error);
    }
  };

  return (
    <header
      className="relative z-[60] flex h-8 shrink-0 items-center justify-between bg-bg px-2"
    >
      <div
        data-tauri-drag-region
        className="absolute inset-0 h-full w-full"
      />
      <img
        src="/app-icon.png"
        alt="Nogic"
        className="pointer-events-none h-4 w-4 object-contain"
      />
      <div className="relative z-10 flex h-full items-center">
        <button
          type="button"
          aria-label="Minimize"
          title="Minimize"
          disabled={!appWindow}
          className="flex h-full w-11 items-center justify-center text-secondary transition-colors hover:bg-[var(--bg-muted)] hover:text-primary"
          onClick={() => void minimize()}
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
          disabled={!appWindow}
          className="flex h-full w-11 items-center justify-center text-secondary transition-colors hover:bg-[var(--bg-muted)] hover:text-primary"
          onClick={() => void toggleMaximize()}
        >
          {isMaximized ? (
            <Copy size={12} aria-hidden="true" />
          ) : (
            <Square size={12} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          title="Close"
          disabled={!appWindow}
          className="flex h-full w-11 items-center justify-center text-secondary transition-colors hover:bg-[var(--danger)] hover:text-[var(--bg-elevated)]"
          onClick={() => void close()}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
