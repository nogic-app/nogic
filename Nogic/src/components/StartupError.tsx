import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "./ui/button.tsx";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/** Calm full-screen fallback when the sidecar never answers the boot ping. */
export function StartupError() {
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCopyDiagnostics = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const version = await getVersion();
      const diagString = `Nogic Diagnostics\nVersion: ${version}\nEngine: Failed to Start\nOS: ${navigator.userAgent}`;
      await writeText(diagString);
      setNotice("Diagnostics copied");
    } catch (error) {
      console.error("Could not copy startup diagnostics.", error);
      setNotice("Could not copy diagnostics. Open the logs folder instead.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenLogs = async () => {
    setNotice(null);
    try {
      await openPath(await join(await appDataDir(), "logs"));
    } catch (error) {
      console.error("Could not open the Nogic logs folder.", error);
      setNotice("Could not open folder");
    }
  };

  return (
    <section
      aria-label="Startup error"
      className="flex h-full w-full flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 text-center"
    >
      <img src="/logo.png" alt="" aria-hidden="true" className="h-12 w-auto opacity-90" />
      <div className="max-w-[48ch] space-y-2">
        <h1 className="text-title font-medium text-[var(--text-primary)]">
          The Nogic engine failed to start.
        </h1>
        <p className="text-sec text-[var(--text-secondary)]">
          Please check your antivirus or restart the app.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void handleCopyDiagnostics()}>
          Copy diagnostics
        </Button>
        <Button variant="ghost" onClick={() => void handleOpenLogs()}>
          Open logs
        </Button>
      </div>
      {notice && (
        <p role="status" aria-live="polite" className="text-meta text-[var(--text-secondary)]">
          {notice}
        </p>
      )}
    </section>
  );
}
