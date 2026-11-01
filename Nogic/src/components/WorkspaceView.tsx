import type { ReactNode } from "react";
import type { ChatModes } from "@/chatModes.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { Composer } from "./Composer.tsx";
import type { SkillTag } from "./Composer.tsx";
import type { FileAttachment } from "./FilePill.tsx";
import { Sidebar, type ChatItem } from "./Sidebar.tsx";
import { useKeyboardShortcuts } from "@/useKeyboardShortcuts.ts";
import { ErrorSurface } from "@/components/ErrorSurface.tsx";
import type { ErrorPayload } from "@/types/errors.ts";

interface WorkspaceViewProps {
  chatTitle: string;
  input: string;
  onInputChange: (value: string) => void;
  isStreaming: boolean;
  onSend: (modes: ChatModes, attachments: FileAttachment[], skill: SkillTag | null) => void;
  onStop: () => void;
  activeChatId: string | null;
  onSelectChat: (chat: ChatItem) => void;
  onChatDeleted: (chatId: string) => void;
  onProjectDeleted: (projectId: string) => void;
  onCreateChat: (projectId: string | null) => void;
  onProjectCreated: (projectId: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidebarRefreshToken: number;
  onOpenSettings: () => void;
  onOpenUsage: () => void;
  supportsVision: boolean;
  supportsThinking: boolean;
  isWelcome: boolean;
  welcome: ReactNode;
  conversation: ReactNode;
  errorPayload: ErrorPayload | null;
  onRetryError: () => void;
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const { enableShortcuts } = useSettings();
  useKeyboardShortcuts(enableShortcuts, props.onOpenSettings);

  return (
    <div className="flex h-full bg-bg">
      {props.errorPayload ? (
        <ErrorSurface
          payload={props.errorPayload}
          onRetry={props.onRetryError}
          onOpenSettings={props.onOpenSettings}
        />
      ) : null}
      <Sidebar
        activeChatId={props.activeChatId}
        onSelectChat={props.onSelectChat}
        onChatDeleted={props.onChatDeleted}
        onProjectDeleted={props.onProjectDeleted}
        onCreateChat={props.onCreateChat}
        onProjectCreated={props.onProjectCreated}
        isOpen={props.isSidebarOpen}
        onToggle={props.onToggleSidebar}
        refreshToken={props.sidebarRefreshToken}
        onOpenSettings={props.onOpenSettings}
        onOpenUsage={props.onOpenUsage}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-column items-center justify-between px-6 py-3">
            <span className="text-sec text-secondary">{props.chatTitle}</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div
            className={`mx-auto max-w-column px-6 py-8 ${
              props.isWelcome ? "flex min-h-full flex-col justify-center" : ""
            }`}
          >
            {props.isWelcome ? props.welcome : <div className="flex flex-col space-y-8">{props.conversation}</div>}
          </div>
        </div>

        <div className="mx-auto w-full max-w-column px-6 pb-6 pt-2">
          <Composer
            value={props.input}
            onChange={props.onInputChange}
            isStreaming={props.isStreaming}
            onSend={props.onSend}
            onStop={props.onStop}
            supportsVision={props.supportsVision}
            supportsThinking={props.supportsThinking}
          />
        </div>
      </main>
    </div>
  );
}
