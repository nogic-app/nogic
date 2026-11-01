import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FileType,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Share,
  Trash2,
} from "lucide-react";
import { Num } from "./Citation.tsx";
import type { ChatExportFormat } from "./sidebarChatExport.ts";
import type { ChatItem, ProjectItem } from "../sidebarData.ts";
import { useTranslation } from "react-i18next";
import { RenameModal } from "./RenameModal.tsx";

interface SidebarSectionsProps {
  projects: ProjectItem[];
  projectsLoaded: boolean;
  chats: ChatItem[];
  activeChatId: string | null;
  onSelectChat: (chat: ChatItem) => void;
  onCreateChat: () => void;
  onCreateProject: () => void;
  onAddChatToProject: (project: ProjectItem) => void;
  onDeleteChat: (chatId: string) => void;
  onPinChat: (chat: ChatItem) => void;
  onPinProject: (project: ProjectItem) => void;
  onDeleteProject: (project: ProjectItem) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  onRenameProject: (projectId: string, newName: string) => void;
  onExportChat: (chatId: string, format: ChatExportFormat) => void;
  hidden: boolean;
}

export function SidebarSections({
  projects,
  projectsLoaded,
  chats,
  activeChatId,
  onSelectChat,
  onCreateChat,
  onCreateProject,
  onAddChatToProject,
  onDeleteChat,
  onPinChat,
  onPinProject,
  onDeleteProject,
  onRenameChat,
  onRenameProject,
  onExportChat,
  hidden,
}: SidebarSectionsProps) {
  const [areChatsExpanded, setAreChatsExpanded] = useState(true);
  const [areProjectsExpanded, setAreProjectsExpanded] = useState(true);
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [openMenuChatId, setOpenMenuChatId] = useState<string | null>(null);
  const [openShareChatId, setOpenShareChatId] = useState<string | null>(null);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<
    { kind: "chat"; id: string; name: string } | { kind: "project"; id: string; name: string } | null
  >(null);
  const { t } = useTranslation();

  const closeChatMenu = () => {
    setOpenMenuChatId(null);
    setOpenShareChatId(null);
  };

  const toggleChatMenu = (chatId: string) => {
    setOpenMenuChatId((current) => (current === chatId ? null : chatId));
    setOpenShareChatId(null);
  };

  const openShareMenu = (chatId: string) => {
    setOpenShareChatId(chatId);
  };

  const closeShareMenu = (chatId: string) => {
    setOpenShareChatId((current) => (current === chatId ? null : current));
  };
  const visibleChats = chats.filter((chat) =>
    chat.title.toLocaleLowerCase().includes(chatSearch.trim().toLocaleLowerCase()),
  );

  return (
    <div hidden={hidden} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2">
      <section aria-labelledby="sidebar-chats-heading">
        <div className="flex items-center justify-between px-3 pb-2">
          <h2 id="sidebar-chats-heading" className="sidebar-section-title text-meta font-medium uppercase tracking-wide">
            <button
              type="button"
              aria-expanded={areChatsExpanded}
              aria-controls="sidebar-chats-list"
              className="flex items-center gap-1"
              onClick={() => setAreChatsExpanded((expanded) => !expanded)}
            >
              {areChatsExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {t("sidebar.chats")}
            </button>
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Search chats"
              title="Search chats"
              className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
              onClick={() => setIsChatSearchOpen((open) => !open)}
            >
              <Search size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              id="new-chat-button"
              aria-label="New chat"
              className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
              onClick={onCreateChat}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {isChatSearchOpen && (
          <div className="px-3 pb-2">
            <input
              type="search"
              aria-label="Search chats"
              placeholder="Search chats"
              value={chatSearch}
              onChange={(event) => setChatSearch(event.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-meta text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--focus)]"
            />
          </div>
        )}
        <ul id="sidebar-chats-list" hidden={!areChatsExpanded} className="space-y-0.5">
          {visibleChats.length === 0 ? (
            <li className="px-3 py-2 text-meta text-tertiary">
              {chats.length === 0 ? t("sidebar.noChats") : "No matching chats"}
            </li>
          ) : visibleChats.map((chat) => (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                aria-current={chat.id === activeChatId ? "page" : undefined}
                className={`sidebar-list-item w-full truncate rounded-md py-2 ps-3 pe-9 text-start text-sec ${
                  chat.id === activeChatId ? "bg-muted text-primary" : ""
                }`}
                onClick={() => onSelectChat(chat)}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {chat.is_pinned && <Pin size={12} aria-label="Pinned" />}
                  <span className="truncate">{chat.title}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`More actions for ${chat.title}`}
                aria-haspopup="menu"
                aria-expanded={openMenuChatId === chat.id}
                className={`absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-secondary hover:bg-[var(--bg-muted)] ${
                  openMenuChatId === chat.id
                    ? "block"
                    : "hidden group-hover:block group-focus-within:block"
                }`}
                onClick={() => toggleChatMenu(chat.id)}
              >
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
              {openMenuChatId === chat.id && (
                <div
                  role="menu"
                  className="absolute end-1 top-full z-20 mt-1 w-40 rounded-md border border-border bg-[var(--bg-elevated)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => {
                      closeChatMenu();
                      onPinChat(chat);
                    }}
                  >
                    <Pin size={14} aria-hidden="true" />
                    {chat.is_pinned ? "Unpin Chat" : "Pin Chat"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                    onClick={() => {
                      closeChatMenu();
                      setRenameTarget({ kind: "chat", id: chat.id, name: chat.title });
                    }}
                  >
                    {t("sidebar.rename")}
                  </button>
                  <div
                    onMouseEnter={() => openShareMenu(chat.id)}
                    onMouseLeave={() => closeShareMenu(chat.id)}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      aria-expanded={openShareChatId === chat.id}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                      onClick={() => openShareMenu(chat.id)}
                    >
                      <Share size={14} aria-hidden="true" />
                      Share
                      <ChevronRight
                        size={12}
                        aria-hidden="true"
                        className={`ms-auto text-tertiary transition-transform ${
                          openShareChatId === chat.id ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    {openShareChatId === chat.id && (
                      <div
                        role="menu"
                        aria-label={`Share ${chat.title}`}
                        className="ms-3 space-y-0.5 border-s border-border ps-1.5 pt-0.5"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                          onClick={() => {
                            closeChatMenu();
                            onExportChat(chat.id, "pdf");
                          }}
                        >
                          <FileText size={14} aria-hidden="true" />
                          Export as PDF
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                          onClick={() => {
                            closeChatMenu();
                            onExportChat(chat.id, "word");
                          }}
                        >
                          <FileType size={14} aria-hidden="true" />
                          Export as Word
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[var(--danger)] hover:bg-[var(--bg-muted)]"
                    onClick={() => {
                      closeChatMenu();
                      onDeleteChat(chat.id);
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sidebar-projects-heading">
        <div className="flex items-center justify-between px-3 pb-2">
          <h2 id="sidebar-projects-heading" className="sidebar-section-title text-meta font-medium uppercase tracking-wide">
            <button
              type="button"
              aria-expanded={areProjectsExpanded}
              aria-controls="sidebar-projects-list"
              className="flex items-center gap-1"
              onClick={() => setAreProjectsExpanded((expanded) => !expanded)}
            >
              {areProjectsExpanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {t("sidebar.projects")}
            </button>
          </h2>
          <button
            type="button"
            id="new-project-button"
            aria-label="New project"
            title="New project"
            className="sidebar-icon-button hover:bg-[var(--bg-muted)] transition-colors rounded-md p-1"
            onClick={onCreateProject}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <ul id="sidebar-projects-list" hidden={!areProjectsExpanded} className="space-y-0.5">
          {!projectsLoaded ? (
            <li className="px-3 py-2 text-meta text-tertiary">
              {t("sidebar.loadingProjects")}
            </li>
          ) : projects.length === 0 ? (
            <li className="px-3 py-2 text-meta text-tertiary">
              {t("sidebar.noProjects")}
            </li>
          ) : (
            projects.map((project) => (
              <li key={project.id} className="group relative">
                <div className="sidebar-list-item rounded-md px-3 py-2 pe-9">
                  <span className="block truncate text-sec">{project.name}</span>
                  <span className="block text-meta text-tertiary">
                    {project.is_pinned && <Pin size={12} className="me-1 inline" aria-label="Pinned" />}
                    <Num>{project.date}</Num>
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`More actions for ${project.name}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuProjectId === project.id}
                  className={`absolute end-1 top-1/2 -translate-y-1/2 rounded p-1 text-secondary hover:bg-[var(--bg-muted)] ${
                    openMenuProjectId === project.id
                      ? "block"
                      : "hidden group-hover:block group-focus-within:block"
                  }`}
                  onClick={() =>
                    setOpenMenuProjectId((current) =>
                      current === project.id ? null : project.id,
                    )
                  }
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
                {openMenuProjectId === project.id && (
                  <div
                    role="menu"
                    className="absolute end-1 top-full z-20 mt-1 w-40 rounded-md border border-border bg-[var(--bg-elevated)] p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                      onClick={() => {
                        setOpenMenuProjectId(null);
                        onPinProject(project);
                      }}
                    >
                      <Pin size={14} aria-hidden="true" />
                      {project.is_pinned ? "Unpin Project" : "Pin Project"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                      onClick={() => {
                        setOpenMenuProjectId(null);
                        onAddChatToProject(project);
                      }}
                    >
                      <Plus size={14} aria-hidden="true" />
                      Add Chat to Project
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sec hover:bg-[var(--bg-muted)] hover:text-primary"
                      onClick={() => {
                        setOpenMenuProjectId(null);
                        setRenameTarget({ kind: "project", id: project.id, name: project.name });
                      }}
                    >
                      {t("sidebar.rename")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[var(--danger)] hover:bg-[var(--bg-muted)]"
                      onClick={() => {
                        if (!window.confirm(`Delete project "${project.name}" and all its chats?`)) {
                          return;
                        }
                        setOpenMenuProjectId(null);
                        onDeleteProject(project);
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Delete Project
                    </button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
      {renameTarget ? (
        <RenameModal
          open
          kind={renameTarget.kind}
          currentName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          onSave={(name) => {
            if (renameTarget.kind === "chat") {
              onRenameChat(renameTarget.id, name);
            } else {
              onRenameProject(renameTarget.id, name);
            }
            setRenameTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
