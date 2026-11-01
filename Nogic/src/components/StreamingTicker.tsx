import { useEffect, useState } from "react";
import type { ChatModes } from "@/chatModes.ts";

const WEB_STEPS = ["searching web", "reading sources", "drafting"];
const DEEP_THINK_STEPS = ["planning", "drafting", "critiquing", "revising"];
const DEFAULT_STEPS = ["thinking", "drafting"];

export function StreamingTicker({
  modes,
  currentStep = "",
  isExtractive = false,
}: {
  modes: ChatModes;
  currentStep?: string;
  isExtractive?: boolean;
}) {
  const steps = modes.web
    ? WEB_STEPS
    : modes.deep_think
      ? DEEP_THINK_STEPS
      : DEFAULT_STEPS;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive(0);
    if (currentStep) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setActive((step) => (step + 1) % steps.length),
      900,
    );
    return () => window.clearInterval(id);
  }, [currentStep, steps]);

  const displayStep = currentStep || steps[active];

  return (
    <>
      <p
        aria-live="polite"
        className="mt-3 whitespace-nowrap font-mono text-meta text-tertiary"
        aria-label={displayStep}
      >
        <span className="inline-block animate-shimmer">
          {displayStep}
        </span>
        {isExtractive && (
          <span className="ml-2">
            · Extractive mode (small model)
          </span>
        )}
      </p>
    </>
  );
}
