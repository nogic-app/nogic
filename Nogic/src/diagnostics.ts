import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { requestSidecar } from "@/sidecarRequest.ts";
import type { HardwareInfo } from "@/types/hardware";

/**
 * Collect the same diagnostics the About page uses for "Report a problem".
 * Shared by Settings → About and the startup error screen so both report the
 * version, detected hardware, active model, and recent sidecar log lines.
 */
export async function collectDiagnostics(): Promise<string> {
  const [version, hardware] = await Promise.all([
    getVersion(),
    invoke<HardwareInfo>("get_hardware_info"),
  ]);

  return requestSidecar(
    "get_diagnostics",
    {
      app_version: version,
      hardware: {
        vram_gb: hardware.vram_gb,
        total_ram_gb: hardware.total_ram_gb,
      },
    },
    (value): value is string => typeof value === "string",
    15000,
  );
}
