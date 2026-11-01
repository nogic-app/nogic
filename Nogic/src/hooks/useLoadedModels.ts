import { useEffect, useState } from "react";
import { requestSidecar } from "@/sidecarRequest.ts";

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Models Ollama currently holds in memory. `null` means the question could not
 * be answered (Ollama offline), which is different from an empty list.
 */
export function useLoadedModels(intervalMs = 5000) {
  const [loadedModels, setLoadedModels] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const models = await requestSidecar(
          "get_loaded_models",
          {},
          isStringList,
          8000,
        );
        if (!cancelled) setLoadedModels(models);
      } catch (error) {
        if (cancelled) return;
        console.error("Could not read the loaded Ollama models.", error);
        setLoadedModels(null);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), intervalMs);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [intervalMs]);

  return loadedModels;
}

/** Exact name match, ignoring case and an optional `:latest` suffix. */
export function isModelLoaded(
  loadedModels: string[] | null,
  model: string | null | undefined,
): boolean {
  if (loadedModels === null || !model || !model.trim()) return false;
  const normalize = (name: string) =>
    name.trim().toLowerCase().replace(/:latest$/, "");
  const wanted = normalize(model);
  return loadedModels.some((name) => normalize(name) === wanted);
}
