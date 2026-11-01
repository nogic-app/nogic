export interface HardwareInfo {
  cpu_name: string;
  cpu_cores: number;
  total_ram_gb: number | null;
  available_ram_gb: number | null;
  os_name: string;
  os_version: string;
  gpu_name: string | null;
  gpu_vendor: "nvidia" | "amd" | "intel" | "unknown" | null;
  vram_gb: number | null;
  has_nvidia: boolean;
  has_amd: boolean;
  has_intel: boolean;
  detection_warnings: string[];
}