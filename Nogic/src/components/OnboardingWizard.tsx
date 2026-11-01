import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button.tsx";
import { OnboardingModelList, StepHeading } from "./OnboardingParts.tsx";
import { MODEL_CATALOG, type ModelOption } from "@/modelCatalog.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { useHardwareInfo } from "@/hooks/useHardwareInfo";
import { recommendModels } from "@/modelRecommendations.ts";
import { cn } from "@/lib/utils";
import { isCapabilityArray, parseCapabilities } from "@/modelCapabilities.ts";
import { isRecord, requestSidecar } from "@/sidecarRequest.ts";
import { useInstalledModels } from "@/hooks/useInstalledModels";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";
const STEP_COUNT = 4;

/** get_settings answers with a flat key/value map of strings. */
function isSettingsRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

/**
 * The first-run flag lives in SQLite, not the WebView's localStorage: a
 * reinstall wipes the database but can keep the WebView profile, so a stored
 * flag would silently skip the wizard on a fresh install.
 *
 * The name saved by the wizard is the marker. A missing or blank `userName`
 * means this is a first run.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  // The bundled sidecar is a one-file PyInstaller executable; its first launch
  // can take several seconds to unpack, so allow more than the default timeout.
  const stored = await requestSidecar("get_settings", {}, isSettingsRecord, 30000);
  const userName = stored.userName;
  return typeof userName === "string" && userName.trim().length > 0;
}

type OllamaState = "checking" | "running" | "offline";

function isOllamaStatus(value: unknown): value is { status: string } {
  return isRecord(value) && typeof value.status === "string";
}

interface OnboardingWizardProps {
  onFinish: () => void;
}

/**
 * Four calm steps on first launch: name, Ollama health, model choice, and the
 * empty law library disclaimer. No close button — the wizard ends on Finish.
 */
export function OnboardingWizard({ onFinish }: OnboardingWizardProps) {
  const { t } = useTranslation();
  const { activeModel, setActiveModel, userName, setUserName } = useSettings();
  const { info: hardwareInfo } = useHardwareInfo();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(userName);
  const [ollama, setOllama] = useState<OllamaState>("checking");
  const [selectedModel, setSelectedModel] = useState(activeModel ?? "");
  const [capabilities, setCapabilities] = useState<string[] | null>(null);
  const capabilityRequest = useRef(0);
  const installedModels = useInstalledModels(step === 3);
  const recommendations = recommendModels(
    MODEL_CATALOG,
    hardwareInfo,
    installedModels,
  );

  // Model settings load from SQLite after the first paint; adopt the stored
  // selection once it arrives instead of leaving the list unselected.
  useEffect(() => {
    if (activeModel && !selectedModel) setSelectedModel(activeModel);
  }, [activeModel, selectedModel]);

  // Settings load from SQLite after the first paint, so adopt the stored name
  // once it arrives instead of showing an empty field.
  useEffect(() => {
    if (userName && !name) setName(userName);
  }, [name, userName]);

  const checkOllama = useCallback(async () => {
    setOllama("checking");
    try {
      const value = await requestSidecar(
        "get_ollama_status",
        {},
        isOllamaStatus,
        12000,
      );
      setOllama(value.status === "running" ? "running" : "offline");
    } catch (error) {
      console.error("Could not read the Ollama status.", error);
      setOllama("offline");
    }
  }, []);

  useEffect(() => {
    if (step === 2) void checkOllama();
  }, [step, checkOllama]);

  const handleSelectModel = useCallback(
    (model: ModelOption) => {
      const requestId = capabilityRequest.current + 1;
      capabilityRequest.current = requestId;
      setSelectedModel(model.name);
      setCapabilities(null);
      setActiveModel(model.name);

      void requestSidecar(
        "get_model_capabilities",
        { model_name: model.name },
        isCapabilityArray,
        12000,
      )
        .then((value) => {
          if (capabilityRequest.current === requestId) {
            setCapabilities(parseCapabilities(value));
          }
        })
        .catch((error: unknown) => {
          if (capabilityRequest.current !== requestId) return;
          console.error("Could not read the model capabilities.", error);
          setCapabilities([]);
        });
    },
    [setActiveModel],
  );

  const trimmedName = name.trim();

  const handleContinue = () => {
    if (step === 1) {
      if (!trimmedName) return;
      setUserName(trimmedName);
    }
    if (step < STEP_COUNT) {
      setStep(step + 1);
      return;
    }
    // Saving the name through SettingsContext writes it to the SQLite settings
    // table, which is what suppresses this wizard on the next launch.
    setUserName(trimmedName);
    onFinish();
  };

  const lacksVision =
    capabilities !== null && !capabilities.includes("vision");

  let content: ReactNode = null;

  if (step === 1) {
    content = (
      <div>
        <StepHeading
          title={t("onboarding.welcomeTitle")}
          body={t("onboarding.welcomeBody")}
        />
        <label
          htmlFor="onboarding-name"
          className="mt-8 block text-sec text-[var(--text-secondary)]"
        >
          {t("onboarding.nameLabel")}
        </label>
        <input
          id="onboarding-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("onboarding.namePlaceholder")}
          autoFocus
          className="mt-2 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-body text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-strong)]"
        />
      </div>
    );
  } else if (step === 2) {
    content = (
      <div>
        <StepHeading
          title={t("onboarding.ollamaTitle")}
          body={t("onboarding.ollamaBody")}
        />
        <div className="mt-6 flex items-center gap-2 text-sec">
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full",
              ollama === "running"
                ? "bg-[var(--accent)]"
                : ollama === "offline"
                  ? "bg-[var(--warning)]"
                  : "bg-[var(--text-tertiary)]",
            )}
          />
          <span className="text-[var(--text-secondary)]">
            {ollama === "checking"
              ? t("onboarding.checkingOllama")
              : ollama === "running"
                ? t("onboarding.ollamaRunning")
                : t("onboarding.ollamaOffline")}
          </span>
        </div>
        {ollama === "offline" ? (
          <div className="mt-5">
            <p className="max-w-[46ch] text-sec text-[var(--text-secondary)]">
              {t("onboarding.ollamaOfflineBody")}
            </p>
            <a
              href={OLLAMA_DOWNLOAD_URL}
              onClick={(event) => {
                event.preventDefault();
                void openUrl(OLLAMA_DOWNLOAD_URL).catch((error: unknown) => {
                  console.error("Could not open the Ollama download page.", error);
                  window.open(OLLAMA_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
                });
              }}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-md bg-[var(--accent)] px-6 text-body font-medium text-white transition-opacity hover:opacity-90"
            >
              {t("onboarding.downloadOllama")}
            </a>
            <div className="mt-2">
              <Button variant="ghost" onClick={() => void checkOllama()}>
                {t("onboarding.retry")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  } else if (step === 3) {
    content = (
      <div>
        <StepHeading
          title={t("onboarding.modelTitle")}
          body={t("onboarding.modelBody")}
        />
        <OnboardingModelList
          hardware={hardwareInfo}
          onSelect={handleSelectModel}
          recommendations={recommendations}
          selectedModel={selectedModel}
        />
        {lacksVision ? (
          <p
            role="status"
            className="mt-4 border-s-2 border-[var(--warning)] ps-3 text-sec text-[var(--warning)]"
          >
            {t("onboarding.visionWarning")}
          </p>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div>
        <StepHeading
          title={t("onboarding.lawsTitle")}
          body={t("onboarding.lawsBody")}
        />
        <p className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-3 py-2 font-mono text-meta text-[var(--text-secondary)]">
          /add-law
        </p>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.welcomeTitle")}
      className="fixed inset-x-0 bottom-0 top-8 z-[70] flex items-center justify-center bg-[var(--bg)] p-6"
    >
      <div className="flex w-full max-w-[560px] flex-col">
        <p className="text-meta text-[var(--text-tertiary)]">
          {t("onboarding.step", { current: step, total: STEP_COUNT })}
        </p>
        <div className="mt-6 min-h-[268px]">{content}</div>
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 1}>
            {t("onboarding.back")}
          </Button>
          <Button
            variant="accent"
            onClick={handleContinue}
            disabled={step === 1 && !trimmedName}
          >
            {step === STEP_COUNT
              ? t("onboarding.finish")
              : t("onboarding.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
