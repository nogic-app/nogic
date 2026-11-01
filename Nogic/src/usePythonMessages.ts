import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import {
  handleChatStreamEvent,
  updateAssistantMessage,
} from "@/chatStreamEvents.ts";
import type { ChatItem } from "@/components/Sidebar.tsx";
import {
  isChatMessageArray,
  isRecord,
  toHistoryMessages,
  type ChatMessage,
} from "@/WorkspaceContent.tsx";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";
import { isPlantDataArray } from "@/plants.ts";
import type { ErrorPayload } from "@/types/errors.ts";

export interface PythonMessageRefs {
  activeRequestId: RefObject<string | null>;
  historyRequestId: RefObject<string | null>;
  plantLookupRequestId: RefObject<string | null>;
  remappedChatId: RefObject<string | null>;
  activeChatId: RefObject<string | null>;
  chatCache: RefObject<Record<string, ChatMessage[]>>;
}

interface PythonMessageSetters {
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setActiveChat: Dispatch<SetStateAction<ChatItem | null>>;
  setErrorPayload: Dispatch<SetStateAction<ErrorPayload | null>>;
}

export function usePythonMessages(
  refs: PythonMessageRefs,
  setters: PythonMessageSetters,
): void {
  const {
    activeRequestId,
    historyRequestId,
    plantLookupRequestId,
    remappedChatId,
    activeChatId,
    chatCache,
  } = refs;
  const { setMessages, setIsStreaming, setActiveChat, setErrorPayload } = setters;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const startListening = async () => {
      try {
        const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch (error) {
            console.error("Received invalid JSON from the Python sidecar.", error);
            return;
          }

          if (!isRecord(payload) || typeof payload.type !== "string") {
            console.error("Received an invalid message from the Python sidecar.", payload);
            return;
          }

          if (payload.type === "chat_id_synced") {
            if (
              typeof payload.old_id !== "string" ||
              typeof payload.new_id !== "string"
            ) {
              console.error("Received an invalid chat ID update from the Python sidecar.", payload);
              return;
            }
            const temporaryChatId = payload.old_id;
            const updatedChatId = payload.new_id;
            if (activeChatId.current === temporaryChatId) {
              remappedChatId.current = updatedChatId;
              historyRequestId.current = null;
              activeChatId.current = updatedChatId;
              setActiveChat((current) =>
                current?.id === temporaryChatId
                  ? { ...current, id: updatedChatId }
                  : current,
              );
            }
            return;
          }

          if (payload.type === "chat_title_updated") {
            if (
              !isRecord(payload.data) ||
              typeof payload.data.chat_id !== "string" ||
              typeof payload.data.new_title !== "string"
            ) {
              console.error("Received an invalid chat title update from the Python sidecar.", payload);
              return;
            }
            const updatedChatId = payload.data.chat_id;
            const updatedTitle = payload.data.new_title;
            setActiveChat((current) =>
              current?.id === updatedChatId
                ? { ...current, title: updatedTitle }
                : current,
            );
            return;
          }

          const requestId = typeof payload.id === "string" ? payload.id : null;
          if (
            payload.type === "error" &&
            requestId !== null &&
            requestId === historyRequestId.current
          ) {
            console.error("The Python sidecar failed to load chat history.", payload.error);
            historyRequestId.current = null;
            return;
          }

          if (
            payload.type === "response" &&
            requestId !== null &&
            requestId === historyRequestId.current
          ) {
            if (!isChatMessageArray(payload.data)) {
              console.error("Received invalid chat history from the Python sidecar.", payload);
              return;
            }
            const messages = toHistoryMessages(payload.data);
            const chatId = activeChatId.current;
            if (chatId) chatCache.current[chatId] = messages;
            setMessages(messages);
            return;
          }

          if (
            requestId !== null &&
            requestId === plantLookupRequestId.current
          ) {
            plantLookupRequestId.current = null;

            if (payload.type === "error") {
              const detail =
                typeof payload.error === "string" && payload.error.trim().length > 0
                  ? payload.error.trim().split("\n")[0]
                  : "Unknown sidecar error.";
              console.error("The Python sidecar failed to look up a plant.", payload.error);
              setMessages((current) =>
                updateAssistantMessage(current, requestId, (message) => ({
                  ...message,
                  content: `Could not read the plant table: ${detail}`,
                })),
              );
              return;
            }
            if (payload.type !== "response") return;

            if (!isPlantDataArray(payload.data)) {
              console.error("Received invalid plant lookup data from the Python sidecar.", payload);
              setMessages((current) =>
                updateAssistantMessage(current, requestId, (message) => ({
                  ...message,
                  content: "The sidecar returned an unreadable plant table.",
                })),
              );
              return;
            }

            const rows = payload.data;
            setMessages((current) =>
              updateAssistantMessage(current, requestId, (message) => ({
                ...message,
                content: rows.length > 0 ? "" : "Not in the table.",
                plant_data: rows,
              })),
            );
            return;
          }

          if (requestId === null || requestId !== activeRequestId.current) return;

          handleChatStreamEvent(
            payload,
            activeRequestId,
            setIsStreaming,
            setMessages,
            setErrorPayload,
          );
        });

        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      } catch (error) {
        if (cancelled && isTauriCallbackIdError(error)) return;
        console.error("Failed to listen for Python sidecar messages.", error);
      }
    };

    const startTimer = window.setTimeout(() => {
      void startListening();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      unlisten?.();
    };
  }, [
    activeChatId,
    activeRequestId,
    historyRequestId,
    plantLookupRequestId,
    remappedChatId,
    setActiveChat,
    setErrorPayload,
    chatCache,
    setMessages,
    setIsStreaming,
  ]);
}
