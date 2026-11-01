import type { SiteData } from "@/components/SiteCard.tsx";
import {
  isLawSourceArray,
  lawSourceLabel,
  type LawSource,
} from "@/lawSources.ts";
import { isPlantDataArray, toPlantCard, type PlantData } from "@/plants.ts";
import { isWebSourceArray, type WebSource } from "@/types/webSources.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import type { FileAttachment } from "@/components/FilePill.tsx";
import type { SkillTag } from "@/components/Composer.tsx";
import type { GeneratedFileType } from "@/components/GeneratedFileCard.tsx";

export { isLawSourceArray };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Request ID while streaming, or the SQLite row ID once loaded. */
  id?: string;
  sources?: LawSource[];
  plant_data?: PlantData[];
  /** Web-mode search results, rendered as favicons and a dropdown. */
  web_sources?: WebSource[];
  site_data?: SiteData;
  file_path?: string;
  file_size?: number;
  file_type?: GeneratedFileType;
  /** Streamed and persisted reasoning text (Think/DeepThink). */
  thinking?: string;
  /** Current DeepThink pass label, e.g. "Drafting...". */
  step?: string;
  type?: "law_upload" | "plant_upload";
  attachments?: FileAttachment[];
  skill?: SkillTag;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSiteData(value: unknown): value is SiteData {
  return (
    isRecord(value) &&
    typeof value.display_name === "string" &&
    typeof value.lat === "number" &&
    typeof value.lon === "number" &&
    typeof value.type === "string" &&
    typeof value.plants === "string" &&
    typeof value.water === "string" &&
    typeof value.notes === "string"
  );
}

function isGeneratedFileType(value: unknown): value is GeneratedFileType {
  return value === "PDF" || value === "DOCX" || value === "XLSX";
}

/**
 * Map SQLite history rows onto the display shape. The persisted `thinking`
 * column restores the Reasoning panel for messages loaded from disk.
 */
export function toHistoryMessages(rows: ChatMessage[]): ChatMessage[] {
  return rows.map((row) => {
    const message: ChatMessage = { role: row.role, content: row.content };
    if (typeof row.id === "string") message.id = row.id;
    if (row.sources && row.sources.length > 0) message.sources = row.sources;
    if (row.plant_data && row.plant_data.length > 0) {
      message.plant_data = row.plant_data;
    }
    if (row.web_sources && row.web_sources.length > 0) {
      message.web_sources = row.web_sources;
    }
    if (isSiteData(row.site_data)) {
      message.site_data = row.site_data;
    }
    if (typeof row.file_path === "string" && row.file_path.trim().length > 0) {
      message.file_path = row.file_path;
    }
    if (typeof row.file_size === "number" && row.file_size >= 0) {
      message.file_size = row.file_size;
    }
    if (isGeneratedFileType(row.file_type)) {
      message.file_type = row.file_type;
    }
    if (
      row.skill === "pdf" ||
      row.skill === "word" ||
      row.skill === "excel"
    ) {
      message.skill = row.skill;
    }
    if (typeof row.thinking === "string" && row.thinking.trim().length > 0) {
      message.thinking = row.thinking;
    }
    if (row.attachments && row.attachments.length > 0) {
      message.attachments = row.attachments;
    }
    return message;
  });
}

export function isChatMessageArray(data: unknown): data is ChatMessage[] {
  return (
    Array.isArray(data) &&
    data.every(
      (message) =>
        isRecord(message) &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        (message.id === undefined || typeof message.id === "string") &&
        (message.sources === undefined ||
          message.sources === null ||
          isLawSourceArray(message.sources)) &&
        (message.plant_data === undefined ||
          message.plant_data === null ||
          isPlantDataArray(message.plant_data)) &&
        (message.web_sources === undefined ||
          message.web_sources === null ||
          isWebSourceArray(message.web_sources)) &&
        (message.site_data === undefined ||
          message.site_data === null ||
          isSiteData(message.site_data)) &&
        (message.file_path === undefined || typeof message.file_path === "string") &&
        (message.file_size === undefined ||
          message.file_size === null ||
          (typeof message.file_size === "number" &&
            Number.isInteger(message.file_size) &&
            message.file_size >= 0)) &&
        (message.file_type === undefined ||
          message.file_type === null ||
          isGeneratedFileType(message.file_type)) &&
        (message.thinking === undefined || typeof message.thinking === "string") &&
        (message.step === undefined || typeof message.step === "string") &&
        (message.type === undefined ||
          message.type === "law_upload" ||
          message.type === "plant_upload") &&
        (message.skill === undefined ||
          message.skill === null ||
          message.skill === "pdf" ||
          message.skill === "word" ||
          message.skill === "excel") &&
        (message.attachments === undefined ||
          message.attachments === null ||
          (Array.isArray(message.attachments) &&
            message.attachments.every((file) =>
              isRecord(file) &&
              typeof file.name === "string" &&
              typeof file.path === "string" &&
              typeof file.type === "string" &&
              typeof file.size === "number",
            ))),
    )
  );
}

interface WelcomeScreenProps {
  onPromptSelect: (prompt: string) => void;
  t: (key: string) => string;
}

export function WelcomeScreen({ onPromptSelect, t }: WelcomeScreenProps) {
  const { userName } = useSettings();
  const examplePrompts = [
    "What setback applies in Rabat?",
    "Find native plants for a dry slope.",
    "Which plants need little water?",
  ];

  return (
    <section className="welcome-screen" aria-label="Welcome">
      <h1 className="welcome-screen-title">
        {t("welcome.greeting")},{" "}
        {userName.trim() || t("welcome.fallbackName")}.
      </h1>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
        {examplePrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="welcome-prompt mx-auto w-full max-w-xs p-4"
            onClick={() => onPromptSelect(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
