import { invoke } from "@tauri-apps/api/core";

interface PendingChatDeletion {
  current: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function handleChatDeletionResponse(
  payload: unknown,
  pendingChatId: PendingChatDeletion,
  onChatDeleted: (chatId: string) => void,
): boolean {
  if (!isRecord(payload) || payload.id !== "del_1") return false;

  const requestedChatId = pendingChatId.current;
  pendingChatId.current = null;
  if (payload.type === "error") {
    console.error("The Python sidecar failed to delete the chat.", payload.error);
    return true;
  }
  if (
    payload.type !== "response" ||
    !isRecord(payload.data) ||
    payload.data.success !== true ||
    typeof payload.data.chat_id !== "string" ||
    payload.data.chat_id !== requestedChatId
  ) {
    console.error("Received an invalid chat deletion response from the Python sidecar.", payload);
    return true;
  }

  onChatDeleted(payload.data.chat_id);
  void invoke("send_to_sidecar", {
    message: JSON.stringify({
      action: "get_chats",
      id: `refresh_chats:${crypto.randomUUID()}`,
    }),
  }).catch((error: unknown) => {
    console.error("Failed to refresh chats after deleting a chat.", error);
  });
  return true;
}
