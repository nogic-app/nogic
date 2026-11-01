import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isSystemUsage, type SystemUsage } from "@/types/systemUsage.ts";

/**
 * Poll the Rust shell for real CPU/RAM/VRAM/GPU usage. A failed read clears the
 * value so the UI shows "—" rather than a stale or invented number.
 */
export function useSystemUsage(intervalMs: number) {
  const [usage, setUsage] = useState<SystemUsage | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const data = await invoke<unknown>("get_system_usage");
        if (cancelled) return;
        if (!isSystemUsage(data)) {
          console.error("Received invalid system usage from the Tauri shell.", data);
          setUsage(null);
          return;
        }
        setUsage(data);
      } catch (error) {
        if (cancelled) return;
        console.error("Could not read system usage.", error);
        setUsage(null);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), intervalMs);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [intervalMs]);

  return usage;
}
