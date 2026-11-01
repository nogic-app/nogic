import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HardwareInfo } from "@/types/hardware";
import {
  normalizeErrorPayload,
  type ErrorPayload,
} from "@/types/errors.ts";

export function useHardwareInfo() {
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorPayload | null>(null);

  const fetchHardware = useCallback(async () => {
    setLoading(true);
    setError(null);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        invoke<HardwareInfo>("get_hardware_info"),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Hardware detection timed out.")),
            5000,
          );
        }),
      ]);
      console.debug("[hardware] detection result:", data);
      setInfo(data);
    } catch (reason) {
      console.error("[hardware] detection failed:", reason);
      setError(normalizeErrorPayload(reason));
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchHardware();
  }, [fetchHardware]);

  useEffect(() => {
    void fetchHardware();
  }, [fetchHardware]);

  return { info, loading, error, refresh };
}