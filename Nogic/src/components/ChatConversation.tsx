import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import type { ChatModes } from "@/chatModes.ts";
import { lawSourceLabel } from "@/lawSources.ts";
import { toPlantCard } from "@/plants.ts";
import { openGeneratedFilePath } from "@/generatedFile.ts";
import { requestSidecar } from "@/sidecarRequest.ts";
import {
  GeneratedFileCard,
  type GeneratedFileType,
} from "@/components/GeneratedFileCard.tsx";
import { AssistantMessage, UserMessage } from "@/components/Message.tsx";
import { Markdown } from "@/components/Markdown.tsx";
import { SourceFooter } from "@/components/SourceFooter.tsx";
import { LawUploadCard } from "@/components/LawUploadCard.tsx";
import { PlantUploadCard } from "@/components/PlantUploadCard.tsx";
import { PlantCard } from "@/components/PlantCard.tsx";
import { SiteCard } from "@/components/SiteCard.tsx";
import { WebSources } from "@/components/WebSources.tsx";
import { FilePill } from "@/components/FilePill.tsx";
import type { ChatMessage } from "@/WorkspaceContent.tsx";
import type { SkillTag } from "@/components/Composer.tsx";

function generatedFileType(
  filePath: string,
  storedType?: GeneratedFileType,
): GeneratedFileType {
  if (storedType) return storedType;
  const extension = filePath.split(".").pop()?.toLowerCase();
  if (extension === "docx") return "DOCX";
  if (extension === "xlsx") return "XLSX";
  return "PDF";
}

function fileSkill(fileType: GeneratedFileType): SkillTag | null {
  if (fileType === "DOCX") return "word";
  if (fileType === "XLSX") return "excel";
  return "pdf";
}

function typeForSkill(skill: SkillTag): GeneratedFileType {
  if (skill === "word") return "DOCX";
  if (skill === "excel") return "XLSX";
  return "PDF";
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

async function saveGeneratedFile(filePath: string, fileName: string): Promise<void> {
  const fileType = generatedFileType(filePath);
  const extension = fileName.split(".").pop()?.toLowerCase() || fileType.toLowerCase();
  const destinationPath = await save({
    defaultPath: fileName,
    filters: [{ name: fileType, extensions: [extension] }],
  });
  if (!destinationPath) return;
  await requestSidecar<string>(
    "save_generated_file",
    { file_path: filePath, destination_path: destinationPath },
    (value): value is string => typeof value === "string",
  );
}

interface ChatConversationProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  elapsedSeconds: number;
  isThinkMode: boolean;
  modes: ChatModes;
  isExtractive: boolean;
  onRetry: (prompt: string, skill: SkillTag) => void;
}

export function ChatConversation({
  messages,
  isStreaming,
  elapsedSeconds,
  isThinkMode,
  modes,
  isExtractive,
  onRetry,
}: ChatConversationProps) {
  const { showSources } = useSettings();

  return messages.map((message, index) => {
    const key = message.id ?? `${message.role}-${index}`;
    if (message.type === "law_upload") {
      return <LawUploadCard key={key} />;
    }
    if (message.type === "plant_upload") {
      return <PlantUploadCard key={key} />;
    }
    if (message.role === "user") {
      return (
        <UserMessage key={key}>
          <Markdown>{message.content}</Markdown>
          {message.skill && (
            <span className="mt-2 inline-flex items-center rounded-md bg-[var(--accent-subtle)] px-2 py-1 text-meta font-medium text-[var(--accent)]">
              {message.skill === "pdf"
                ? "📄 PDF Report"
                : message.skill === "word"
                  ? "📝 Word Document"
                  : "📊 Excel Document"}
            </span>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 grid gap-2">
              {message.attachments.map((file) => (
                <FilePill key={`${file.path}-${file.name}`} file={file} />
              ))}
            </div>
          )}
        </UserMessage>
      );
    }
    const previousMessage = messages[index - 1];
    const previousUser =
      previousMessage?.role === "user" ? previousMessage : undefined;
    const fileType = message.file_type ?? (
      message.file_path
        ? generatedFileType(message.file_path)
        : typeForSkill(previousUser?.skill ?? "pdf")
    );
    const retrySkill =
      previousUser?.skill
        ? previousUser.skill
        : fileSkill(fileType);
    const fileCard = message.file_path ? (
      <GeneratedFileCard
        fileName={fileNameFromPath(message.file_path)}
        fileType={fileType}
        filePath={message.file_path}
        fileSize={message.file_size ?? Number.NaN}
        status="success"
        onRetry={
          retrySkill && previousUser
            ? () => onRetry(previousUser.content, retrySkill)
            : undefined
        }
        onOpen={() => openGeneratedFilePath(message.file_path ?? "")}
        onSaveAs={() =>
          saveGeneratedFile(
            message.file_path ?? "",
            fileNameFromPath(message.file_path ?? ""),
          )
        }
      />
    ) : previousUser?.skill && !(isStreaming && index === messages.length - 1) ? (
      <GeneratedFileCard
        fileName={`Nogic ${fileType} document.${fileType.toLowerCase()}`}
        fileType={fileType}
        filePath=""
        fileSize={Number.NaN}
        status="error"
        errorMessage={message.content}
        onRetry={
          retrySkill
            ? () => onRetry(previousUser.content, retrySkill)
            : undefined
        }
        onOpen={() => undefined}
        onSaveAs={() => undefined}
      />
    ) : null;

    return (
      <div key={key}>
        <AssistantMessage
          isStreaming={isStreaming && index === messages.length - 1}
          elapsedSeconds={elapsedSeconds}
          thinkingText={message.thinking}
          stepText={message.step}
          showThinking={isThinkMode}
          modes={modes}
          isExtractive={isExtractive}
        >
          {message.content ? <Markdown>{message.content}</Markdown> : null}
          {fileCard}
        </AssistantMessage>
        {message.site_data && <SiteCard data={message.site_data} />}
        {message.plant_data && message.plant_data.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Plant results">
            {message.plant_data.map((plant) => (
              <PlantCard key={plant.id} plant={toPlantCard(plant)} />
            ))}
          </ul>
        )}
        {message.web_sources && message.web_sources.length > 0 && (
          <WebSources sources={message.web_sources} />
        )}
        {showSources && message.sources && message.sources.length > 0 && (
          <SourceFooter
            label="Sources"
            items={message.sources.map((source) => ({
              label: lawSourceLabel(source),
              onClick: () =>
                invoke<void>("open_law_pdf", {
                  lawName: source.law_name,
                  country: source.country ?? "MA",
                  pageNum: source.page_num,
                }),
            }))}
          />
        )}
      </div>
    );
  });
}
