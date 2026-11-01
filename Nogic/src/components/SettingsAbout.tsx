import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "./ui/button.tsx";
import { useTranslation } from "react-i18next";
import { resolveResource } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isRecord } from "@/sidecarRequest.ts";
import { collectDiagnostics } from "@/diagnostics.ts";

const ISSUES_URL = "https://github.com/nogic-app/nogic/issues";
const REPORT_URL_PREFIX =
  `${ISSUES_URL}/new?title=User%20Report&body=`;
const MAX_DIAGNOSTICS_CHARS = 4000;
const MAX_REPORT_URL_LENGTH = 8000;
const LATEST_RELEASE_URL =
  "https://api.github.com/repos/nogic-app/nogic/releases/latest";

interface LatestRelease {
  tag_name: string;
  html_url: string;
}

interface AboutLink {
  key: string;
  /** Bundled documentation file, resolved from the app resources. */
  file?: string;
  /** External URL opened in the system browser. */
  url?: string;
}

const LINKS: AboutLink[] = [
  { key: "documentation", file: "docs/DOCUMENTATION.md" },
  { key: "licences", file: "docs/LICENSES.md" },
  { key: "releaseNotes", file: "docs/RELEASE_NOTES.md" },
  { key: "reportProblem", url: ISSUES_URL },
];

export function SettingsAbout() {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState("1.1.0");
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(null);
  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkLatestRelease = useCallback(async () => {
    setChecking(true);
    setLatestRelease(null);
    try {
      const [version, response] = await Promise.all([
        getVersion(),
        fetch(LATEST_RELEASE_URL, {
          headers: { Accept: "application/vnd.github+json" },
          cache: "no-store",
        }),
      ]);
      setAppVersion(version);
      if (!response.ok) {
        throw new Error(`GitHub returned HTTP ${response.status}.`);
      }

      const payload: unknown = await response.json();
      if (
        !isRecord(payload) ||
        typeof payload.tag_name !== "string" ||
        typeof payload.html_url !== "string"
      ) {
        throw new Error("GitHub returned an invalid latest-release response.");
      }
      if (isNewerVersion(payload.tag_name, version)) {
        const releaseUrl = new URL(payload.html_url);
        if (releaseUrl.origin !== "https://github.com") {
          throw new Error("GitHub returned an invalid release URL.");
        }
        setLatestRelease({
          tag_name: payload.tag_name,
          html_url: releaseUrl.toString(),
        });
      }
    } catch (error) {
      console.error("Could not check for Nogic updates.", error);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkLatestRelease();
  }, [checkLatestRelease]);

  const openAboutLink = async (link: AboutLink) => {
    setLinkError(null);
    setNotice(null);
    try {
      if (link.key === "reportProblem") {
        await reportProblem();
        return;
      }
      if (link.file) {
        await openPath(await resolveResource(link.file));
        return;
      }
      if (link.url) await openUrl(link.url);
    } catch (error) {
      console.error(`Could not open ${link.key}.`, error);
      setLinkError(t("settings.openFailed"));
    }
  };

  const reportProblem = async () => {
    try {
      const diagnostics = await collectDiagnostics();
      try {
        await writeText(diagnostics);
        setNotice(t("settings.diagnosticsCopied"));
      } catch (error) {
        console.warn("Could not copy diagnostics to the clipboard.", error);
      }

      let truncatedDiagnostics = "";
      let encodedLength = 0;
      let characterCount = 0;
      for (const character of diagnostics) {
        if (characterCount >= MAX_DIAGNOSTICS_CHARS) break;
        const characterLength = encodeURIComponent(character).length;
        if (
          REPORT_URL_PREFIX.length + encodedLength + characterLength >
          MAX_REPORT_URL_LENGTH
        ) {
          break;
        }
        truncatedDiagnostics += character;
        encodedLength += characterLength;
        characterCount += 1;
      }
      const reportUrl =
        `${REPORT_URL_PREFIX}${encodeURIComponent(truncatedDiagnostics)}`;
      await openUrl(reportUrl);
    } catch (err) {
      console.error("Diagnostics Error:", err);
      setNotice(null);
      setLinkError(t("settings.diagnosticsFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="h-12 w-12 rounded-lg object-contain mix-blend-multiply"
        />
        <div>
          <p className="text-title font-medium text-[var(--text-primary)]">
            Nogic
          </p>
          <p className="text-meta text-[var(--text-secondary)]">
            Version {appVersion}
          </p>
        </div>
      </div>

      <p className="max-w-[52ch] text-sec text-[var(--text-secondary)]">
        {t("settings.aboutDescription")}
      </p>

      <div className="border-t border-[var(--border)] pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={checking}
            onClick={() => void checkLatestRelease()}
          >
            {checking ? t("settings.checkingUpdates") : t("settings.checkForUpdates")}
          </Button>
          <p aria-live="polite" className="text-meta text-[var(--text-secondary)]">
            {checking ? (
              t("settings.checkingUpdates")
            ) : latestRelease ? (
              <button
                type="button"
                onClick={() => void openUrl(latestRelease.html_url).catch((error: unknown) => {
                  console.error("Could not open the latest Nogic release.", error);
                  setLinkError(t("settings.openFailed"));
                })}
                className="text-[var(--accent)] underline underline-offset-2"
              >
                {t("settings.newUpdateAvailable")}
              </button>
            ) : (
              t("settings.upToDate")
            )}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {LINKS.map((link) => (
          <li key={link.key}>
            <button
              type="button"
              onClick={() => void openAboutLink(link)}
              className="group flex w-full items-center justify-between gap-4 py-2.5 text-start text-sec text-[var(--text-primary)] transition-colors duration-[120ms] hover:text-[var(--accent)]"
            >
              <span>{t(`settings.${link.key}`)}</span>
              <span className="flex items-center gap-1 text-meta text-[var(--text-tertiary)] transition-colors duration-[120ms] group-hover:text-[var(--accent)]">
                {t("settings.open")}
                <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {linkError && (
        <p role="alert" className="text-meta text-[var(--text-secondary)]">
          {linkError}
        </p>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="text-meta text-[var(--text-secondary)]">
          {notice}
        </p>
      )}

      <p className="text-meta text-[var(--text-tertiary)]">
        {t("settings.copyright")}
      </p>
    </div>
  );
}

function isNewerVersion(candidate: string, current: string): boolean {
  const parse = (version: string): number[] | null => {
    const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const candidateParts = parse(candidate);
  const currentParts = parse(current);
  if (!candidateParts || !currentParts) return false;

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index];
    }
  }
  return false;
}
