import { useEffect, useState } from "react";
import { requestSidecar } from "@/sidecarRequest.ts";

export function isCapabilityArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((capability) => typeof capability === "string")
  );
}

/** Normalize Ollama's capability list for display and comparisons. */
export function parseCapabilities(value: unknown): string[] {
  if (!isCapabilityArray(value)) return [];
  return value
    .map((capability) => capability.trim().toLowerCase())
    .filter((capability) => capability.length > 0);
}

/**
 * Ask the sidecar which capabilities the active model reports. `null` means
 * the answer has not arrived (or Ollama could not be reached), so callers can
 * avoid claiming that a feature is unavailable before they know.
 */
export function useModelCapabilities(model: string): string[] | null {
  const [capabilities, setCapabilities] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCapabilities(null);
    if (!model.trim()) return;

    void requestSidecar(
      "get_model_capabilities",
      { model_name: model },
      isCapabilityArray,
      6000,
    )
      .then((value) => {
        if (!cancelled) setCapabilities(parseCapabilities(value));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Could not read the model capabilities.", error);
        setCapabilities(null);
      });

    return () => {
      cancelled = true;
    };
  }, [model]);

  return capabilities;
}
