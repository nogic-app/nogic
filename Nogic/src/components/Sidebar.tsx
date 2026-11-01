import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { SidebarSections } from "./SidebarSections.tsx";
import { SidebarUsageWidget } from "./SidebarUsageWidget.tsx";
import { CreateProjectModal } from "./CreateProjectModal.tsx";
import { handleChatDeletionResponse } from "./sidebarChatDeletion.ts";
import { exportChat, type ChatExportFormat } from "./sidebarChatExport.ts";
import { isChatItem, isProjectItem, isRecord, type ChatItem, type ProjectItem } from "../sidebarData.ts";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";

export type { ChatItem } from "../sidebarData.ts";

interface SidebarProps {
  activeChatId: string | null;
  onSelectChat: (chat: ChatItem) => void;
  onChatDeleted: (chatId: string) => void;
  onProjectDeleted: (projectId: string) => void;
  onCreateChat: (projectId: string | null) => void;
  onProjectCreated: (projectId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  /** Opens Settings directly on the Usage tab. */
  onOpenUsage: () => void;
  /** Bumped by Workspace after chats are deleted outside the sidebar. */
  refreshToken: number;
}

export function Sidebar({
  activeChatId,
  onSelectChat,
  onChatDeleted,
  onProjectDeleted,
  onCreateChat,
  onProjectCreated,
  isOpen,
  onToggle,
  onOpenSettings,
  onOpenUsage,
  refreshToken,
}: SidebarProps) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [projectToast, setProjectToast] = useState<string | null>(null);
  const pendingDeleteChatId = useRef<string | null>(null);
  const pendingDeleteProjectId = useRef<string | null>(null);
  const projectToastTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (projectToastTimeout.current !== null) {
        window.clearTimeout(projectToastTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const loadSidebar = async () => {
      try {
        const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch (error) {
            console.error("Received invalid JSON while loading sidebar data.", error);
            return;
          }

          if (!isRecord(payload)) return;
          if (payload.type === "chat_id_synced") {
            if (
              typeof payload.old_id !== "string" ||
              typeof payload.new_id !== "string"
            ) {
              console.error("Received an invalid chat ID update from the Python sidecar.", payload);
              return;
            }
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_chats",
                id: `refresh_chats:${crypto.randomUUID()}`,
              }),
            }).catch((error: unknown) => {
              console.error("Failed to refresh chats after persisting a chat.", error);
            });
            return;
          }
          if (handleChatDeletionResponse(payload, pendingDeleteChatId, onChatDeleted)) return;
          if (
            payload.type === "response" &&
            typeof payload.id === "string" &&
            payload.id.startsWith("delete_project:")
          ) {
            if (
              !isRecord(payload.data) ||
              payload.data.success !== true ||
              typeof payload.data.project_id !== "string"
            ) {
              console.error("Received an invalid project deletion response.", payload);
              pendingDeleteProjectId.current = null;
              return;
            }
            const projectId = payload.data.project_id;
            if (projectId !== pendingDeleteProjectId.current) {
              console.error("Received a project deletion response for an unexpected project.", payload);
              pendingDeleteProjectId.current = null;
              return;
            }
            pendingDeleteProjectId.current = null;
            onProjectDeleted(projectId);
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_projects",
                id: `refresh_projects:${crypto.randomUUID()}`,
              }),
            });
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_chats",
                id: `refresh_chats:${crypto.randomUUID()}`,
              }),
            });
            return;
          }
          if (
            payload.type === "response" &&
            typeof payload.id === "string" &&
            payload.id.startsWith("create_project:")
          ) {
            if (!isProjectItem(payload.data)) {
              console.error("Received invalid project data from the project creation response.", payload);
              return;
            }
            onProjectCreated(payload.data.id);
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_projects",
                id: `refresh_projects:${crypto.randomUUID()}`,
              }),
            }).catch((error: unknown) => {
              console.error("Failed to refresh projects after creating a project.", error);
            });
            return;
          }
          if (
            payload.type === "response" &&
            typeof payload.id === "string" &&
            (payload.id.startsWith("pin_chat:") || payload.id.startsWith("pin_project:"))
          ) {
            const action = payload.id.startsWith("pin_chat:") ? "get_chats" : "get_projects";
            const refreshId =
              action === "get_chats"
                ? `refresh_chats:${crypto.randomUUID()}`
                : `refresh_projects:${crypto.randomUUID()}`;
            void invoke("send_to_sidecar", {
              message: JSON.stringify({ action, id: refreshId }),
            });
            return;
          }
          if (
            payload.type === "response" &&
            typeof payload.id === "string" &&
            (payload.id.startsWith("rename_chat:") || payload.id.startsWith("rename_project:"))
          ) {
            const action = payload.id.startsWith("rename_chat:") ? "get_chats" : "get_projects";
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action,
                id: `${action === "get_chats" ? "refresh_chats" : "refresh_projects"}:${crypto.randomUUID()}`,
              }),
            }).catch((error: unknown) => {
              console.error("Failed to refresh the sidebar after renaming.", error);
            });
            return;
          }
          if (typeof payload.id !== "string") return;
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
            setChats((current) =>
              current.map((chat) =>
                chat.id === updatedChatId
                  ? { ...chat, title: updatedTitle }
                  : chat,
              ),
            );
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_chats",
                id: `refresh_chats:${crypto.randomUUID()}`,
              }),
            }).catch((error: unknown) => {
              console.error("Failed to refresh chats after a title update.", error);
            });
            return;
          }

          const isSidebarRequest =
            payload.id === "init_sidebar" ||
            payload.id.startsWith("refresh_chats:") ||
            payload.id.startsWith("refresh_projects:");
          const isCreateChatRequest = payload.id.startsWith("create_chat:");

          if (payload.type === "response" && isCreateChatRequest) {
            if (!isChatItem(payload.data)) {
              console.error("Received invalid chat data from the chat creation response.", payload);
              return;
            }
            onSelectChat(payload.data);
            void invoke("send_to_sidecar", {
              message: JSON.stringify({
                action: "get_chats",
                id: `refresh_chats:${crypto.randomUUID()}`,
              }),
            }).catch((error: unknown) => {
              console.error("Failed to refresh chats after creating a chat.", error);
            });
            return;
          }

          if (payload.type === "error") {
            if (isSidebarRequest || isCreateChatRequest) {
              console.error("The Python sidecar reported a sidebar action error.", payload.error);
            }
            return;
          }

          if (!isSidebarRequest) return;

          if (
            (payload.id === "init_sidebar" || payload.id.startsWith("refresh_projects:")) &&
            payload.type === "projects" &&
            Array.isArray(payload.data)
          ) {
            const loadedProjects: ProjectItem[] = [];
            for (const project of payload.data) {
              if (!isProjectItem(project)) {
                console.error("Received invalid project data from the Python sidecar.", payload.data);
                return;
              }
              loadedProjects.push(project);
            }
            setProjects(
              loadedProjects.map((project) => ({
                id: project.id,
                name: project.name,
                date: project.date.slice(0, 10),
                is_pinned: project.is_pinned,
              })),
            );
            setProjectsLoaded(true);
            return;
          }

          if (
            isSidebarRequest &&
            payload.type === "chats" &&
            Array.isArray(payload.data)
          ) {
            const loadedChats: ChatItem[] = [];
            for (const chat of payload.data) {
              if (!isChatItem(chat)) {
                console.error("Received invalid chat data from the Python sidecar.", payload.data);
                return;
              }
              loadedChats.push(chat);
            }
            setChats(loadedChats);
            return;
          }

          console.error("Received an invalid sidebar response from the Python sidecar.", payload);
        });

        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;

        await Promise.all([
          invoke("send_to_sidecar", {
            message: JSON.stringify({ action: "get_projects", id: "init_sidebar" }),
          }),
          invoke("send_to_sidecar", {
            message: JSON.stringify({ action: "get_chats", id: "init_sidebar" }),
          }),
        ]);
      } catch (error) {
        if (cancelled && isTauriCallbackIdError(error)) return;
        console.error("Failed to load sidebar data from the Python sidecar.", error);
      }
    };

    const startTimer = window.setTimeout(() => {
      void loadSidebar();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      unlisten?.();
    };
  }, [onChatDeleted, onProjectCreated, onSelectChat, refreshToken]);

  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);

  const openCreateProject = () => {
    if (!chats.some((chat) => chat.project_id === null)) {
      setProjectToast("You need to create a chat before creating a project.");
      if (projectToastTimeout.current !== null) {
        window.clearTimeout(projectToastTimeout.current);
      }
      projectToastTimeout.current = window.setTimeout(() => {
        setProjectToast(null);
        projectToastTimeout.current = null;
      }, 3200);
      return;
    }
    setIsCreateProjectOpen(true);
  };

  const createProject = async (name: string, chatIds: string[]) => {
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "create_project",
          id: `create_project:${crypto.randomUUID()}`,
          name,
          chat_ids: chatIds,
        }),
      });
    } catch (error) {
      console.error("Failed to create a project through the Python sidecar.", error);
      throw error;
    }
  };

  const deleteChat = async (chatId: string) => {
    if (pendingDeleteChatId.current !== null) return;
    pendingDeleteChatId.current = chatId;
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "delete_chat",
          id: "del_1",
          chat_id: chatId,
        }),
      });
    } catch (error) {
      pendingDeleteChatId.current = null;
      console.error("Failed to delete a chat through the Python sidecar.", error);
    }
  };

  const exportChatFile = (chatId: string, format: ChatExportFormat) => {
    void exportChat(chatId, format);
  };

  const pinChat = async (chat: ChatItem) => {
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "pin_chat",
          id: `pin_chat:${crypto.randomUUID()}`,
          chat_id: chat.id,
          is_pinned: !chat.is_pinned,
        }),
      });
    } catch (error) {
      console.error("Failed to pin chat through the Python sidecar.", error);
    }
  };

  const pinProject = async (project: ProjectItem) => {
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "pin_project",
          id: `pin_project:${crypto.randomUUID()}`,
          project_id: project.id,
          is_pinned: !project.is_pinned,
        }),
      });
    } catch (error) {
      console.error("Failed to pin project through the Python sidecar.", error);
    }
  };

  const renameChat = async (chatId: string, newTitle: string) => {
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "rename_chat",
          id: `rename_chat:${crypto.randomUUID()}`,
          chat_id: chatId,
          new_title: newTitle,
        }),
      });
    } catch (error) {
      console.error("Failed to rename chat through the Python sidecar.", error);
    }
  };

  const renameProject = async (projectId: string, newName: string) => {
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "rename_project",
          id: `rename_project:${crypto.randomUUID()}`,
          project_id: projectId,
          new_name: newName,
        }),
      });
    } catch (error) {
      console.error("Failed to rename project through the Python sidecar.", error);
    }
  };

  const deleteProject = async (project: ProjectItem) => {
    if (pendingDeleteProjectId.current !== null) return;
    pendingDeleteProjectId.current = project.id;
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "delete_project",
          id: `delete_project:${crypto.randomUUID()}`,
          project_id: project.id,
        }),
      });
    } catch (error) {
      pendingDeleteProjectId.current = null;
      console.error("Failed to delete project through the Python sidecar.", error);
    }
  };

  return (
    <aside
      className={`workspace-sidebar flex h-full shrink-0 flex-col bg-bg transition-[width] duration-200 ${
        isOpen ? "w-64" : "w-16"
      }`}
    >
      {isOpen ? (
        <div className="flex items-center justify-between px-3 pb-4 pt-5">
          <img src="/logo.png" alt="Nogic" className="h-10 w-auto object-contain" />
          <button
            type="button"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
            onClick={onToggle}
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-2 pb-4 pt-3">
          <button
            type="button"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
            onClick={onToggle}
          >
            <PanelLeftOpen size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            id="new-chat-button"
            aria-label="New chat"
            title="New chat"
            className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
            onClick={() => onCreateChat(null)}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <SidebarSections
        projects={projects}
        projectsLoaded={projectsLoaded}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onDeleteChat={(chatId) => void deleteChat(chatId)}
        onPinChat={(chat) => void pinChat(chat)}
        onPinProject={(project) => void pinProject(project)}
        onDeleteProject={(project) => void deleteProject(project)}
        onRenameChat={(chatId, newTitle) => void renameChat(chatId, newTitle)}
        onRenameProject={(projectId, newName) => void renameProject(projectId, newName)}
        onExportChat={exportChatFile}
        onCreateChat={() => onCreateChat(null)}
        onCreateProject={openCreateProject}
        onAddChatToProject={(project) => onCreateChat(project.id)}
        hidden={!isOpen}
      />

      <div
        className={`mt-auto flex items-end gap-2 border-t border-border p-3 ${
          isOpen ? "justify-between" : "justify-center"
        }`}
      >
        {isOpen ? <SidebarUsageWidget onOpenUsage={onOpenUsage} /> : null}
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
          onClick={onOpenSettings}
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>
      <CreateProjectModal
        chats={chats}
        open={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onSave={createProject}
      />
      {projectToast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-[var(--bg-elevated)] px-4 py-2 text-sec text-primary shadow-xl"
        >
          {projectToast}
        </div>
      )}
    </aside>
  );
}
