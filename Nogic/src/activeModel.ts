import { requestSidecar } from "./sidecarRequest.ts";

function isModelList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((model) => typeof model === "string" && model.trim().length > 0)
  );
}

/**
 * Resolve the model for a chat request. A saved selection wins; otherwise the
 * first model installed in Ollama is used so the app works on a fresh install.
 * Returns null when no model can be found, which lets the UI ask the user.
 */
export async function resolveActiveModel(
  current: string | null,
): Promise<string | null> {
  const saved = current?.trim();
  if (saved) return saved;

  try {
    const models = await requestSidecar(
      "get_installed_models",
      {},
      isModelList,
      12000,
    );
    return models[0]?.trim() ?? null;
  } catch (error) {
    console.error("Could not read the installed models.", error);
    return null;
  }
}
