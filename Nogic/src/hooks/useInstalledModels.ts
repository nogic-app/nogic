import { useEffect, useState } from "react";
import { requestSidecar } from "@/sidecarRequest.ts";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function useInstalledModels(enabled: boolean): string[] {
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void requestSidecar("get_installed_models", {}, isStringArray, 12000)
      .then((result) => {
        if (!cancelled) setModels(result);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Could not read installed models for onboarding.", error);
        setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return models;
}
