export interface ModelOption {
  name: string;
  sizeLabel: string;
  requiredVramGb: number;
  cpuOnly: boolean;
  capabilities: string[];
}

export const MODEL_CATALOG: ModelOption[] = [
  // --- CPU / <4GB VRAM (Text Only) ---
  { name: "qwen2.5:1.5b", sizeLabel: "~1.0 GB", requiredVramGb: 0, cpuOnly: true, capabilities: ["tools"] },
  { name: "llama3.2:1b", sizeLabel: "~1.3 GB", requiredVramGb: 0, cpuOnly: true, capabilities: ["tools"] },
  { name: "deepseek-r1:1.5b", sizeLabel: "~1.1 GB", requiredVramGb: 0, cpuOnly: true, capabilities: ["thinking"] },
  { name: "granite4:1b", sizeLabel: "~1.0 GB", requiredVramGb: 0, cpuOnly: true, capabilities: ["tools"] },

  // --- 4GB VRAM ---
  { name: "qwen3-vl:2b", sizeLabel: "~1.9 GB", requiredVramGb: 3.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "minicpm-v4.6", sizeLabel: "~1.6 GB", requiredVramGb: 3.0, cpuOnly: false, capabilities: ["vision"] },
  { name: "gemma4:e2b", sizeLabel: "~2.0 GB", requiredVramGb: 3.5, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "llama3.2:3b", sizeLabel: "~2.0 GB", requiredVramGb: 3.5, cpuOnly: false, capabilities: ["tools"] },

  // --- 6GB VRAM ---
  { name: "qwen3-vl:4b", sizeLabel: "~3.3 GB", requiredVramGb: 4.5, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "qwen2.5vl:3b", sizeLabel: "~3.5 GB", requiredVramGb: 4.5, cpuOnly: false, capabilities: ["vision"] },
  { name: "gemma3:4b", sizeLabel: "~2.6 GB", requiredVramGb: 4.5, cpuOnly: false, capabilities: ["vision"] },
  { name: "phi4-mini", sizeLabel: "~2.5 GB", requiredVramGb: 4.5, cpuOnly: false, capabilities: ["tools"] },

  // --- 8GB VRAM ---
  { name: "gemma4:e4b", sizeLabel: "~4.5 GB", requiredVramGb: 6.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "llama3.2-vision:11b", sizeLabel: "~7.8 GB", requiredVramGb: 8.0, cpuOnly: false, capabilities: ["vision"] },
  { name: "llama3.1:8b", sizeLabel: "~4.7 GB", requiredVramGb: 6.0, cpuOnly: false, capabilities: ["tools"] },
  { name: "deepseek-r1:8b", sizeLabel: "~5.2 GB", requiredVramGb: 6.5, cpuOnly: false, capabilities: ["thinking"] },

  // --- 12GB VRAM ---
  { name: "qwen3-vl:8b", sizeLabel: "~6.1 GB", requiredVramGb: 8.5, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "llava:7b", sizeLabel: "~4.7 GB", requiredVramGb: 7.0, cpuOnly: false, capabilities: ["vision"] },
  { name: "qwen2.5:14b", sizeLabel: "~9.0 GB", requiredVramGb: 11.0, cpuOnly: false, capabilities: ["tools"] },
  { name: "deepseek-r1:14b", sizeLabel: "~9.0 GB", requiredVramGb: 11.0, cpuOnly: false, capabilities: ["thinking"] },

  // --- 16GB VRAM ---
  { name: "gemma4:12b", sizeLabel: "~7.6 GB", requiredVramGb: 11.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "qwen3.5:9b", sizeLabel: "~6.6 GB", requiredVramGb: 9.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "mistral-small3.2", sizeLabel: "~14 GB", requiredVramGb: 16.0, cpuOnly: false, capabilities: ["vision", "tools"] },
  { name: "qwen2.5:14b-instruct", sizeLabel: "~9.0 GB", requiredVramGb: 12.0, cpuOnly: false, capabilities: ["tools"] },

  // --- 20GB VRAM ---
  { name: "gemma4:26b", sizeLabel: "~18 GB", requiredVramGb: 20.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "qwen3.8:27b", sizeLabel: "~18 GB", requiredVramGb: 20.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "qwen2.5:32b", sizeLabel: "~20 GB", requiredVramGb: 22.0, cpuOnly: false, capabilities: ["tools"] },
  { name: "deepseek-r1:32b", sizeLabel: "~20 GB", requiredVramGb: 22.0, cpuOnly: false, capabilities: ["thinking"] },

  // --- 24GB+ VRAM ---
  { name: "gemma4:31b", sizeLabel: "~20 GB", requiredVramGb: 22.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "qwen3-vl:30b", sizeLabel: "~19 GB", requiredVramGb: 22.0, cpuOnly: false, capabilities: ["vision", "tools", "thinking"] },
  { name: "llama3.1:70b", sizeLabel: "~40 GB", requiredVramGb: 45.0, cpuOnly: false, capabilities: ["tools"] },
  { name: "deepseek-r1:70b", sizeLabel: "~42 GB", requiredVramGb: 46.0, cpuOnly: false, capabilities: ["thinking"] },
];
