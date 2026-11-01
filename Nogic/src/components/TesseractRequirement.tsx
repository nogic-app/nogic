import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isRecord, requestSidecar } from "@/sidecarRequest.ts";

const TESSERACT_CHECK_TIMEOUT_MS = 15_000;
const TESSERACT_DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1_000;

type TesseractStatus = "checking" | "installed" | "missing" | "downloading" | "error";

function isTesseractCheck(value: unknown): value is { installed: boolean } {
  return isRecord(value) && typeof value.installed === "boolean";
}

export function TesseractRequirement() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TesseractStatus>("checking");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);
  const mountedRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);

  function stopProgress() {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    void requestSidecar(
      "check_tesseract",
      {},
      isTesseractCheck,
      TESSERACT_CHECK_TIMEOUT_MS,
    )
      .then((result) => {
        if (!cancelled) setStatus(result.installed ? "installed" : "missing");
      })
      .catch((checkError: unknown) => {
        console.error("Could not check Tesseract OCR.", checkError);
        if (!cancelled) {
          setStatus("error");
          setError(t("settings.requirementCheckFailed"));
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopProgress();
    };
  }, [t]);

  async function downloadTesseract() {
    setStatus("downloading");
    setProgress(0);
    setError("");
    progressTimerRef.current = window.setInterval(() => {
      setProgress((current) => Math.min(90, current + 3));
    }, 500);

    try {
      const result = await requestSidecar(
        "download_portable_tesseract",
        {},
        isTesseractCheck,
        TESSERACT_DOWNLOAD_TIMEOUT_MS,
      );
      if (!result.installed) {
        throw new Error("The Tesseract download did not complete.");
      }
      if (mountedRef.current) {
        setProgress(100);
        setStatus("installed");
      }
    } catch (downloadError) {
      console.error("Could not download portable Tesseract.", downloadError);
      if (mountedRef.current) {
        setStatus("missing");
        setProgress(0);
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : t("settings.tesseractDownloadFailed"),
        );
      }
    } finally {
      stopProgress();
    }
  }

  async function removeTesseract() {
    setIsRemoving(true);
    setError("");
    try {
      const result = await requestSidecar(
        "remove_tesseract",
        {},
        isTesseractCheck,
        TESSERACT_CHECK_TIMEOUT_MS,
      );
      if (result.installed) {
        throw new Error("Tesseract could not be removed.");
      }
      if (mountedRef.current) setStatus("missing");
    } catch (removeError) {
      console.error("Could not remove portable Tesseract.", removeError);
      if (mountedRef.current) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : t("settings.tesseractRemoveFailed"),
        );
      }
    } finally {
      if (mountedRef.current) setIsRemoving(false);
    }
  }

  return (
    <section>
      <h3 className="text-title font-medium text-[var(--text-primary)]">
        {t("settings.requirements")}
      </h3>
      <div className="mt-3 flex items-center justify-between gap-4 border-y border-[var(--border)] py-3">
        <div>
          <p className="text-sec text-[var(--text-primary)]">Tesseract OCR</p>
          <p className="mt-0.5 text-meta text-[var(--text-secondary)]">
            {t("settings.tesseractDescription")}
          </p>
        </div>
        {status === "installed" ? (
          <div className="flex shrink-0 items-center gap-3">
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-1 text-meta text-[var(--text-secondary)]">
              {t("settings.installed")}
            </span>
            <button
              type="button"
              onClick={() => void removeTesseract()}
              disabled={isRemoving}
              className="text-meta text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              {isRemoving
                ? t("settings.tesseractRemoving")
                : t("settings.removeTesseract")}
            </button>
          </div>
        ) : status === "downloading" ? (
          <div className="w-36 shrink-0">
            <p className="text-right text-meta text-[var(--text-secondary)]">
              {t("settings.tesseractDownloading")} {progress}%
            </p>
            <div
              role="progressbar"
              aria-label={t("settings.tesseractDownloading")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : status === "missing" ? (
          <button
            type="button"
            onClick={() => void downloadTesseract()}
            className="h-8 shrink-0 rounded-md bg-[var(--accent)] px-3 text-meta text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {t("settings.downloadOcr")}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="h-8 shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-muted)] px-3 text-meta text-[var(--text-tertiary)] disabled:cursor-not-allowed"
          >
            {t(status === "checking" ? "settings.checking" : "settings.requirementUnavailable")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-meta text-[var(--danger)]">
          {error}
        </p>
      )}
    </section>
  );
}
