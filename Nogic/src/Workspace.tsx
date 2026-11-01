import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { WorkspaceView } from "@/components/WorkspaceView.tsx";
import type { ChatItem } from "@/components/Sidebar.tsx";
import { isChatItem } from "@/sidebarData.ts";
import {
  WelcomeScreen,
  type ChatMessage,
} from "@/WorkspaceContent.tsx";
import { ChatConversation } from "@/components/ChatConversation.tsx";
import { usePythonMessages } from "@/usePythonMessages.ts";
import { useMemoryDeleted } from "@/useMemoryDeleted.ts";
import { useHardwareInfo } from "@/hooks/useHardwareInfo";
import { isExtractiveHardware } from "@/hardwareTier";
import { DEFAULT_CHAT_MODES, type ChatModes } from "@/chatModes.ts";
import { resolveActiveModel } from "@/activeModel.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { SettingsModal } from "@/components/SettingsModal.tsx";
import type { SettingsTab } from "@/components/SettingsModal.tsx";
import {
  OnboardingWizard,
  hasCompletedOnboarding,
} from "@/components/OnboardingWizard.tsx";
import { StartupSplash } from "@/components/StartupSplash.tsx";
import { StartupError } from "@/components/StartupError.tsx";
import { useStartupHealthCheck } from "@/hooks/useStartupHealthCheck.ts";
import { useTranslation } from "react-i18next";
import type { FileAttachment } from "@/components/FilePill.tsx";
import type { SkillTag } from "@/components/Composer.tsx";
import { useModelCapabilities } from "@/modelCapabilities.ts";
import {
  EMPTY_LAW_LIBRARY_MESSAGE,
  fetchLawStatus,
  isLawQuestion,
} from "@/lawLibrary.ts";
import {
  normalizeErrorPayload,
  type ErrorPayload,
} from "@/types/errors.ts";

/**
 * `/plant "name"` and `/plant name` both resolve to the bare name.
 * Returns null when the message is not a plant lookup command.
 */
function parsePlantCommand(content: string): string | null {
  const match = /^\/plant(?:\s+([\s\S]*))?$/.exec(content);
  if (!match) return null;
  let name = (match[1] ?? "").trim();
  if (name.length >= 2) {
    const first = name.charAt(0);
    const last = name.charAt(name.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      name = name.slice(1, -1).trim();
    }
  }
  return name;
}

export default function Workspace() {
  const { t } = useTranslation();
  const { activeModel, setActiveModel } = useSettings();
  const startupHealth = useStartupHealthCheck();
  const { info: hardwareInfo } = useHardwareInfo();
  const isExtractive = isExtractiveHardware(hardwareInfo);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorPayload, setErrorPayload] = useState<ErrorPayload | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [activeModes, setActiveModes] = useState<ChatModes>(DEFAULT_CHAT_MODES);
  const modelCapabilities = useModelCapabilities(activeModel ?? "");
  const supportsVision =
    modelCapabilities === null || modelCapabilities.includes("vision");
  const supportsThinking =
    modelCapabilities === null || modelCapabilities.includes("thinking");
  const [activeChat, setActiveChat] = useState<ChatItem | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  // null until the sidecar answers; the wizard only renders for a confirmed
  // fresh install so an existing user never sees it flash.
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [sidebarRefreshToken, setSidebarRefreshToken] = useState(0);
  const activeRequestId = useRef<string | null>(null);
  const historyRequestId = useRef<string | null>(null);
  const plantLookupRequestId = useRef<string | null>(null);
  const remappedChatId = useRef<string | null>(null);
  const activeChatId = useRef<string | null>(null);
  const skipHistoryFetch = useRef(false);
  const chatCache = useRef<Record<string, ChatMessage[]>>({});
  const skipCacheWrite = useRef(false);
  const retryRequest = useRef<{
    content: string;
    modes: ChatModes;
    attachments: FileAttachment[];
    skill: SkillTag | null;
  } | null>(null);

  useEffect(() => {
    if (!isStreaming) return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isStreaming]);

  usePythonMessages(
    {
      activeRequestId,
      historyRequestId,
      plantLookupRequestId,
      remappedChatId,
      activeChatId,
      chatCache,
    },
    { setMessages, setIsStreaming, setActiveChat, setErrorPayload },
  );

  // Settings -> Memory deletes chats inside the sidecar. Reset the visible
  // workspace and bump the sidebar refresh token so the deleted chats vanish
  // immediately instead of only after the next interaction.
  const handleMemoryDeleted = useCallback(() => {
    activeChatId.current = null;
    activeRequestId.current = null;
    historyRequestId.current = null;
    plantLookupRequestId.current = null;
    remappedChatId.current = null;
    skipHistoryFetch.current = false;
    chatCache.current = {};
    setActiveChat(null);
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setSidebarRefreshToken((token) => token + 1);
  }, []);

  useMemoryDeleted(handleMemoryDeleted);

  // The first-run decision comes from SQLite (`get_settings`), not the WebView's
  // localStorage, so a reinstall that keeps the WebView profile still shows the
  // wizard. A sidecar failure must never gate the app, so it counts as onboarded.
  useEffect(() => {
    let cancelled = false;
    void hasCompletedOnboarding()
      .then((completed) => {
        if (!cancelled) setIsOnboarded(completed);
      })
      .catch((error: unknown) => {
        console.error("Could not read the onboarding state from SQLite.", error);
        if (!cancelled) setIsOnboarded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const chatId = activeChat?.id;
    if (skipHistoryFetch.current) {
      skipHistoryFetch.current = false;
      return;
    }
    if (chatId && remappedChatId.current === chatId) {
      remappedChatId.current = null;
      return;
    }
    if (chatId?.startsWith("temp_")) return;
    activeRequestId.current = null;
    historyRequestId.current = null;
    plantLookupRequestId.current = null;
    setIsStreaming(false);
    setInput("");

    if (!chatId) {
      setMessages([]);
      return;
    }

    const cachedMessages = chatCache.current[chatId];
    if (cachedMessages) {
      skipCacheWrite.current = true;
      setMessages(cachedMessages);
      return;
    }
    skipCacheWrite.current = true;
    setMessages([]);

    const requestId = `history:${crypto.randomUUID()}`;
    historyRequestId.current = requestId;
    void invoke("send_to_sidecar", {
      message: JSON.stringify({ action: "get_history", id: requestId, chat_id: chatId }),
    }).catch((error: unknown) => {
      console.error("Failed to request chat history from the Python sidecar.", error);
    });

    return () => {
      if (historyRequestId.current === requestId) historyRequestId.current = null;
    };
  }, [activeChat?.id]);

  useEffect(() => {
    const chatId = activeChat?.id;
    if (!chatId || chatId.startsWith("temp_")) return;
    if (skipCacheWrite.current) {
      skipCacheWrite.current = false;
      return;
    }
    if (chatCache.current[chatId]) chatCache.current[chatId] = messages;
  }, [activeChat?.id, messages]);

  const handleSelectChat = useCallback((chat: ChatItem) => {
    setErrorPayload(null);
    const currentChatId = activeChatId.current;
    if (currentChatId && !currentChatId.startsWith("temp_")) {
      chatCache.current[currentChatId] = messages;
    }
    activeChatId.current = chat.id;
    setActiveProjectId(chat.project_id);
    if (chat.id.startsWith("temp_")) {
      activeRequestId.current = null;
      historyRequestId.current = null;
      plantLookupRequestId.current = null;
      setIsStreaming(false);
      setMessages([]);
      setInput("");
    }
    setActiveChat(chat);
  }, [messages]);

  const handleChatDeleted = useCallback((chatId: string) => {
    delete chatCache.current[chatId];
    if (activeChatId.current !== chatId) return;
    activeChatId.current = null;
    activeRequestId.current = null;
    historyRequestId.current = null;
    plantLookupRequestId.current = null;
    setActiveChat(null);
    setMessages([]);
    setInput("");
    setIsStreaming(false);
  }, []);

  const handleProjectDeleted = useCallback((_projectId: string) => {
    activeChatId.current = null;
    activeRequestId.current = null;
    historyRequestId.current = null;
    plantLookupRequestId.current = null;
    remappedChatId.current = null;
    skipHistoryFetch.current = false;
    chatCache.current = {};
    setActiveProjectId(null);
    setActiveChat(null);
    setMessages([]);
    setInput("");
    setIsStreaming(false);
  }, []);

  const handleCreateChat = useCallback((projectId: string | null) => {
    setErrorPayload(null);
    const selectedProjectId = projectId ?? activeProjectId;
    setActiveProjectId(selectedProjectId);
    activeChatId.current = null;
    activeRequestId.current = null;
    historyRequestId.current = null;
    plantLookupRequestId.current = null;
    setActiveChat(null);
    setMessages([]);
    setInput("");
    setIsStreaming(false);
  }, [activeProjectId]);

  const handleProjectCreated = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    activeChatId.current = null;
    setActiveChat(null);
    setMessages([]);
    setInput("");
  }, []);

  const handleSend = async (
    modes: ChatModes = DEFAULT_CHAT_MODES,
    attachments: FileAttachment[] = [],
    skill: SkillTag | null = null,
    retryContent?: string,
  ) => {
    const content = (retryContent ?? input).trim();
    if ((!content && attachments.length === 0 && skill === null) || isStreaming) return;
    setErrorPayload(null);
    retryRequest.current = { content, modes, attachments, skill };
    setIsStreaming(true);

    if (
      !content.startsWith("/") &&
      attachments.length === 0 &&
      skill === null &&
      isLawQuestion(content)
    ) {
      const status = await fetchLawStatus();
      if (status?.article_count === 0) {
        setIsStreaming(false);
        setMessages((current) => [
          ...current,
          { role: "user", content },
          { role: "assistant", content: EMPTY_LAW_LIBRARY_MESSAGE },
        ]);
        setInput("");
        return;
      }
    }

    if (content === "/add-law" || content === "/add-plant") {
      setIsStreaming(false);
      setMessages((current) => [
        ...current,
        { role: "user", content },
        {
          role: "assistant",
          content: "",
          type: content === "/add-law" ? "law_upload" : "plant_upload",
        },
      ]);
      setInput("");
      return;
    }

    if (content === "/help") {
      setIsStreaming(false);
      setMessages((current) => [
        ...current,
        { role: "user", content },
        {
          role: "assistant",
          content: `Here are the commands you can use:

**Library Management**
- \`/add-law\` : Add a custom law PDF to your library.
- \`/add-plant\` : Add a plant with its source to the verified table.

**Lookups**
- \`/plant "name"\` : Instantly look up a plant card (e.g., \`/plant romarin\`).
- \`/site "location"\` : Fetch site data and a map.

**Chat Modes**
- Toggle **DeepThink** or **Web** using the buttons below the composer.
- Switch between **Fast** and **Think** using the dropdown.`,
        },
      ]);
      setInput("");
      return;
    }

    let chatId = activeChatId.current;
    if (!chatId) {
      const requestId = `create_chat:${crypto.randomUUID()}`;
      let resolveCreate: (chat: ChatItem) => void = () => undefined;
      let rejectCreate: (error: Error) => void = () => undefined;
      const responsePromise = new Promise<ChatItem>((resolve, reject) => {
        resolveCreate = resolve;
        rejectCreate = reject;
      });
      const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch (error) {
            console.error("Received invalid JSON while creating a chat.", error);
            return;
          }
          if (!payload || typeof payload !== "object") return;
          const message = payload as { type?: unknown; id?: unknown; data?: unknown; error?: unknown };
          if (message.id !== requestId) return;
          if (message.type === "response" && isChatItem(message.data)) {
            resolveCreate(message.data);
          } else {
            rejectCreate(new Error(typeof message.error === "string" ? message.error : "Unable to create chat."));
          }
      });
      try {
        await invoke("send_to_sidecar", {
          message: JSON.stringify({
            action: "create_chat",
            id: requestId,
            project_id: activeProjectId,
          }),
        });
        const newChat = await responsePromise;
        chatId = newChat.id;
        chatCache.current[chatId] = messages;
        skipHistoryFetch.current = true;
        activeChatId.current = chatId;
        setActiveChat(newChat);
      } finally {
        stopListening();
      }
    }

    const plantName = parsePlantCommand(content);
    if (plantName !== null) {
      if (!plantName) {
        setIsStreaming(false);
        setMessages((current) => [
          ...current,
          { role: "user", content },
          {
            role: "assistant",
            content: 'Use /plant "name" to look up a plant.',
          },
        ]);
        setInput("");
        return;
      }

      const requestId = `plant_lookup:${crypto.randomUUID()}`;
      setIsStreaming(false);
      plantLookupRequestId.current = requestId;
      setMessages((current) => [
        ...current,
        { role: "user", content },
        { role: "assistant", content: "", id: requestId },
      ]);
      setInput("");
      try {
        await invoke("send_to_sidecar", {
          message: JSON.stringify({
            action: "search_plants",
            id: requestId,
            query: plantName,
          }),
        });
      } catch (error) {
        if (plantLookupRequestId.current !== requestId) return;
        plantLookupRequestId.current = null;
        console.error("Failed to look up a plant in the Python sidecar.", error);
        setErrorPayload(normalizeErrorPayload(error));
        const detail = normalizeErrorPayload(error).message;
        setMessages((current) => {
          const last = current.at(-1);
          if (!last || last.role !== "assistant") return current;
          return [
            ...current.slice(0, -1),
            { ...last, content: `Unable to look up that plant: ${detail}` },
          ];
        });
      }
      return;
    }

    const model = await resolveActiveModel(activeModel);
    if (!model) {
      setIsStreaming(false);
      setMessages((current) => [
        ...current,
        { role: "user", content, attachments, skill: skill ?? undefined },
        {
          role: "assistant",
          content:
            "Select a model in Settings → Models before sending a message.",
        },
      ]);
      setInput("");
      return;
    }
    if (model !== activeModel) setActiveModel(model);

    const userMessage: ChatMessage = { role: "user", content, attachments, skill: skill ?? undefined };
    const isSlashCommand = /^\/(?:site|help|plant)(?:\s|$)/.test(content);
    const conversation = [...messages, userMessage];
    const requestId = `chat:${crypto.randomUUID()}`;
    activeRequestId.current = requestId;
    setActiveModes(modes);
    setMessages((current) => [
      ...current,
      userMessage,
      {
        role: "assistant",
        content: "",
        // Stream events are addressed by request ID, so chunks cannot land on
        // a different message if the array changes mid-stream.
        id: requestId,
        thinking: "",
        // Keep the ticker stable while the request crosses the stdio boundary.
        step:
          modes.web && !isSlashCommand
            ? "searching web"
            : "thinking",
      },
    ]);
    setElapsedSeconds(0);
    setInput("");

    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "chat",
          id: requestId,
          chat_id: chatId,
          model,
          messages: conversation,
          attachments,
          skill,
          modes,
          hardware: hardwareInfo,
        }),
      });
    } catch (error) {
      console.error("Failed to send a message to the Python sidecar.", error);
      setErrorPayload(normalizeErrorPayload(error));
      if (activeRequestId.current !== requestId) {
        setIsStreaming(false);
        return;
      }
      const detail = normalizeErrorPayload(error).message;
      setMessages((current) => {
        const last = current.at(-1);
        if (!last || last.role !== "assistant") return current;
        return [...current.slice(0, -1), { ...last, content: `Unable to send message: ${detail}` }];
      });
      activeRequestId.current = null;
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    activeRequestId.current = null;
    setIsStreaming(false);
    setMessages((current) => {
      const last = current.at(-1);
      if (!last || last.role !== "assistant" || last.content.length > 0) return current;
      return current.slice(0, -1);
    });
  };

  // A failed boot ping replaces the whole workspace: the sidecar is the app.
  if (startupHealth === "failed") return <StartupError />;

  // While the first-run flag is unknown (the packaged sidecar can take 10-15s
  // to unpack on a clean install) the workspace stays unmounted, so the
  // Welcome screen can never flash before the onboarding wizard.
  if (isOnboarded === null) return <StartupSplash />;

  if (!isOnboarded) {
    return <OnboardingWizard onFinish={() => setIsOnboarded(true)} />;
  }

  return (
    <>
      <WorkspaceView
        chatTitle={activeChat?.title ?? "New Chat"}
        input={input}
        onInputChange={setInput}
        isStreaming={isStreaming}
        onSend={handleSend}
        onStop={handleStop}
        activeChatId={activeChat?.id ?? null}
        onSelectChat={handleSelectChat}
        onChatDeleted={handleChatDeleted}
        onProjectDeleted={handleProjectDeleted}
        onCreateChat={handleCreateChat}
        onProjectCreated={handleProjectCreated}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((isOpen) => !isOpen)}
        sidebarRefreshToken={sidebarRefreshToken}
        onOpenSettings={() => {
          setSettingsTab("general");
          setIsSettingsOpen(true);
        }}
        onOpenUsage={() => {
          setSettingsTab("usage");
          setIsSettingsOpen(true);
        }}
        errorPayload={errorPayload}
        onRetryError={() => {
          const previous = retryRequest.current;
          if (previous) {
            void handleSend(
              previous.modes,
              previous.attachments,
              previous.skill,
              previous.content,
            );
          }
        }}
        supportsVision={supportsVision}
        supportsThinking={supportsThinking}
        isWelcome={messages.length === 0 && !isStreaming}
        welcome={<WelcomeScreen onPromptSelect={setInput} t={t} />}
        conversation={
          <ChatConversation
            messages={messages}
            isStreaming={isStreaming}
            elapsedSeconds={elapsedSeconds}
            isThinkMode={activeModes.think}
            modes={activeModes}
            isExtractive={isExtractive}
            onRetry={(prompt, skill) => {
              void handleSend(activeModes, [], skill, prompt);
            }}
          />
        }
      />
      <SettingsModal
        open={isSettingsOpen}
        initialTab={settingsTab}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
