import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listenSidecar as listen } from "@/sidecarEvents.ts";
import { isTauriCallbackIdError } from "@/sidecarRequest.ts";
import { isPlantData, toPlantCard, type PlantData } from "@/plants.ts";
import { PlantCard } from "./PlantCard.tsx";
import {
  EMPTY_PLANT_FORM,
  isPlantFormComplete,
  PlantUploadForm,
  type PlantFormValues,
} from "./PlantUploadForm.tsx";

type UploadStatus = "idle" | "filled" | "saving" | "saved" | "cancelled";

const CARD_CLASSES =
  "w-full max-w-[560px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PlantUploadCard() {
  const [values, setValues] = useState<PlantFormValues>(EMPTY_PLANT_FORM);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedPlant, setSavedPlant] = useState<PlantData | null>(null);
  const [savedSourceName, setSavedSourceName] = useState("");
  const [savedTotal, setSavedTotal] = useState(0);
  const [requestId] = useState(() => `plant_add:${crypto.randomUUID()}`);
  const awaitingResponse = useRef(false);
  const submittedSourceName = useRef("");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const startListening = async () => {
      try {
        const stopListening = await listen<string>("python-message", (event) => {
          let payload: unknown;
          try {
            payload = JSON.parse(event.payload);
          } catch {
            return;
          }
          if (!isRecord(payload) || payload.id !== requestId) return;
          if (!awaitingResponse.current) return;

          if (payload.type === "error") {
            awaitingResponse.current = false;
            setStatus("filled");
            setError(
              typeof payload.error === "string"
                ? payload.error
                : "The plant could not be saved.",
            );
            return;
          }
          if (payload.type !== "response" || !isRecord(payload.data)) return;

          const { plant, total } = payload.data;
          if (!isPlantData(plant) || typeof total !== "number") {
            awaitingResponse.current = false;
            setStatus("filled");
            setError("The sidecar returned an unreadable plant.");
            return;
          }

          const storedSource =
            typeof plant.source_name === "string"
              ? plant.source_name
              : submittedSourceName.current;
          awaitingResponse.current = false;
          setSavedPlant(plant);
          setSavedSourceName(storedSource);
          setSavedTotal(total);
          setStatus("saved");
          setError(null);
        });

        if (cancelled) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      } catch (cause) {
        if (cancelled && isTauriCallbackIdError(cause)) return;
        console.error("Failed to listen for the plant upload response.", cause);
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
  }, [requestId]);

  function handleChange(patch: Partial<PlantFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    setStatus((current) => (current === "idle" ? "filled" : current));
  }

  function cancel() {
    awaitingResponse.current = false;
    setStatus("cancelled");
    setError(null);
  }

  const canSave = isPlantFormComplete(values);

  async function save() {
    if (!canSave || status === "saving") return;
    submittedSourceName.current = values.sourceName.trim();
    awaitingResponse.current = true;
    setStatus("saving");
    setError(null);
    try {
      await invoke("send_to_sidecar", {
        message: JSON.stringify({
          action: "add_plant",
          id: requestId,
          latin_name: values.latinName.trim(),
          common_name: values.commonName.trim(),
          water_need: values.waterNeed,
          sun_exposure: values.sunExposure,
          source_name: values.sourceName.trim(),
          source_url: values.sourceUrl.trim(),
          source_quote: values.sourceQuote.trim(),
        }),
      });
    } catch (cause) {
      awaitingResponse.current = false;
      setStatus("filled");
      setError(errorMessage(cause));
    }
  }

  if (status === "saved" && savedPlant) {
    return (
      <div className={CARD_CLASSES}>
        <p className="text-[14px] leading-[1.6] text-[var(--text-primary)]">
          Saved.{" "}
          <span className="font-medium">{savedPlant.latin_name}</span> is now in
          the verified table.
        </p>
        <ul className="mt-3 space-y-1" aria-label="Saved plant">
          <PlantCard plant={toPlantCard(savedPlant)} defaultOpen />
        </ul>
        <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
          Table · {savedSourceName} · {savedTotal} plants
        </p>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className={CARD_CLASSES}>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Cancelled. Nothing was added to the table.
        </p>
      </div>
    );
  }

  return (
    <PlantUploadForm
      values={values}
      isSaving={status === "saving"}
      canSave={canSave}
      error={error}
      onChange={handleChange}
      onCancel={cancel}
      onSave={() => void save()}
    />
  );
}
