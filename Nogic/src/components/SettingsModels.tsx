import { useCallback, useEffect, useRef, useState } from "react";
import {
  SettingsModelList,
} from "./SettingsModelList.tsx";
import type { ModelOption } from "@/modelCatalog.ts";
import { SettingsModelOverview } from "./SettingsModelOverview.tsx";
import { parseCapabilities } from "@/modelCapabilities.ts";
import { useSettings } from "@/contexts/SettingsContext.tsx";
import { useHardwareInfo } from "@/hooks/useHardwareInfo";
import { useModelRequests } from "@/hooks/useModelRequests";
import { useTranslation } from "react-i18next";
import { normalizeErrorPayload } from "@/types/errors.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function SettingsModels() {
  const { t } = useTranslation();
  const { activeModel, fallbackModel, setActiveModel, setFallbackModel } =
    useSettings();
  const selectedModel = activeModel?.trim() ?? "";
  const pullRequestId = useRef<string | null>(null);
  const [status, setStatus] = useState<"checking" | "running" | "offline">("checking");
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullStatus, setPullStatus] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const { info: hardwareInfo, loading: hardwareLoading, error: hardwareError, refresh: refreshHardware } = useHardwareInfo();
  const modelError = error ? normalizeErrorPayload(error) : null;
  const onConnectionError = useCallback((message: string) => {
    setStatus("offline");
    setInstalledModels([]);
    setError(message);
  }, []);
  const { listenerReady, request } = useModelRequests(onConnectionError);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    // The pill starts neutral until the sidecar explicitly reports a state.
    // It must never inherit a stale "running" value from a previous check.
    setStatus("checking");
    setError(null);
    let statusResult = await Promise.allSettled([
      request("get_ollama_status"),
    ]).then(([result]) => result);
    for (let retry = 0; retry < 3; retry += 1) {
      if (
        statusResult.status !== "fulfilled" ||
        !isRecord(statusResult.value) ||
        statusResult.value.status !== "offline"
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      statusResult = await Promise.allSettled([
        request("get_ollama_status"),
      ]).then(([result]) => result);
    }

    const errors: string[] = [];
    let isOffline = false;

    if (statusResult.status === "fulfilled" && isRecord(statusResult.value)) {
      const receivedStatus = statusResult.value.status;
      if (receivedStatus === "running" || receivedStatus === "offline") {
        setStatus(receivedStatus);
        isOffline = receivedStatus === "offline";
      } else {
        isOffline = true;
        setStatus("offline");
        errors.push("The sidecar returned an invalid Ollama status.");
      }
    } else {
      isOffline = true;
      setStatus("offline");
      errors.push(
        statusResult.status === "rejected"
          ? statusResult.reason.message
          : "The sidecar returned an invalid Ollama status.",
      );
    }

    if (isOffline) {
      setInstalledModels([]);
    } else {
      const modelsResult = await Promise.allSettled([
        request("get_installed_models"),
      ]).then(([result]) => result);
      if (
        modelsResult.status === "fulfilled" &&
        Array.isArray(modelsResult.value) &&
        modelsResult.value.every((model: unknown) => typeof model === "string")
      ) {
        setInstalledModels(modelsResult.value);
      } else {
        isOffline = true;
        setStatus("offline");
        setInstalledModels([]);
        errors.push(
          modelsResult.status === "rejected"
            ? modelsResult.reason.message
            : "The sidecar returned an invalid installed-model list.",
        );
      }
    }

    if (isOffline) setInstalledModels([]);
    if (errors.length > 0) {
      console.error("Failed to refresh model settings.", errors);
      setError(errors.join(" "));
    }
    setIsRefreshing(false);
  }, [request]);

  useEffect(() => {
    if (listenerReady) void refresh();
  }, [listenerReady, refresh]);

  useEffect(() => {
    let cancelled = false;
    setCapabilities([]);
    if (!listenerReady || status !== "running" || !selectedModel) {
      return;
    }
    void request("get_model_capabilities", { model_name: selectedModel })
      .then((value) => {
        if (!cancelled) setCapabilities(parseCapabilities(value));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        console.error("Could not read the active model capabilities.", reason);
        setError(normalizeErrorPayload(reason).message);
        setCapabilities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedModel, listenerReady, request, status]);

  const handlePull = async (model: ModelOption) => {
    const id = `pull:${crypto.randomUUID()}`;
    pullRequestId.current = id;
    setPullingModel(model.name);
    setPullStatus("Waiting for Ollama…");
    setError(null);
    try {
      const result = await request(
        "pull_model",
        { model_name: model.name },
        setPullStatus,
        id,
      );
      if (!isRecord(result) || typeof result.success !== "boolean") {
        throw new Error("The sidecar returned an invalid model-pull response.");
      }
      if (result.success) {
        await refresh();
      } else if (result.cancelled !== true) {
        throw new Error(`Ollama could not pull ${model.name}.`);
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      console.error(`Failed to pull model ${model.name}.`, reason);
      setError(detail);
    } finally {
      pullRequestId.current = null;
      setPullingModel(null);
      setPullStatus("");
      setIsCancelling(false);
    }
  };

  const handleCancelPull = async () => {
    const activeRequestId = pullRequestId.current;
    if (!activeRequestId) return;
    setIsCancelling(true);
    try {
      const result = await request("cancel_pull", {
        pull_request_id: activeRequestId,
      });
      if (!isRecord(result) || result.success !== true) {
        throw new Error("The model pull is no longer active.");
      }
      setPullStatus("Cancelling…");
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      console.error("Failed to cancel the model pull.", reason);
      setError(detail);
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsModelOverview
        activeModel={selectedModel}
        capabilities={capabilities}
        fallbackModel={fallbackModel ?? ""}
        installedModels={installedModels}
        isRefreshing={isRefreshing}
        onFallbackModelChange={setFallbackModel}
        onModelChange={setActiveModel}
        status={status}
        hardwareInfo={hardwareInfo}
        hardwareLoading={hardwareLoading}
        hardwareError={hardwareError}
        modelError={modelError}
        onRetryHardware={refreshHardware}
        onRetryModels={() => void refresh()}
      />

      <SettingsModelList
        activeModel={selectedModel}
        error={error}
        hardwareInfo={hardwareInfo}
        installedModels={installedModels}
        isCancelling={isCancelling}
        isRefreshing={isRefreshing || hardwareLoading}
        onCancel={() => void handleCancelPull()}
        onPull={(model) => void handlePull(model)}
        onRefresh={() => {
          void Promise.all([refresh(), refreshHardware()]);
        }}
        onUse={setActiveModel}
        pullingModel={pullingModel}
        pullStatus={pullStatus}
        status={status}
      />
    </div>
  );
}
