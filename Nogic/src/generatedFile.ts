import { documentDir, join, normalize } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";

const DOCUMENTS_SEGMENT = "documents";

/** Normalize the sidecar's absolute path with the native path API. */
async function normalizeNativePath(filePath: string): Promise<string> {
  try {
    return await normalize(filePath);
  } catch (error) {
    console.error("Could not normalize the generated file path.", error);
    return filePath;
  }
}

/**
 * Rebuild a Documents path from Tauri's `documentDir()`. The Python sidecar
 * writes to `%USERPROFILE%\Documents`, while the OS may redirect the known
 * Documents folder to OneDrive. Retrying with the native Documents directory
 * covers that case; paths outside Documents have no native alternative.
 */
async function remapToDocumentDir(filePath: string): Promise<string | null> {
  const segments = filePath
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);

  let documentsIndex = -1;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].toLowerCase() === DOCUMENTS_SEGMENT) {
      documentsIndex = index;
      break;
    }
  }
  if (documentsIndex < 0 || documentsIndex >= segments.length - 1) return null;

  try {
    return await join(await documentDir(), ...segments.slice(documentsIndex + 1));
  } catch (error) {
    console.error("Could not resolve the Documents folder natively.", error);
    return null;
  }
}

/**
 * Open a generated document with the system's default application. The raw
 * Python path is tried first because it is where the sidecar actually wrote;
 * the native Documents directory is the fallback for redirected folders.
 */
export async function openGeneratedFilePath(filePath: string): Promise<void> {
  const nativePath = await normalizeNativePath(filePath);
  try {
    await openPath(nativePath);
    return;
  } catch (error) {
    const remappedPath = await remapToDocumentDir(filePath);
    if (!remappedPath || remappedPath === nativePath) throw error;
    await openPath(remappedPath);
  }
}
