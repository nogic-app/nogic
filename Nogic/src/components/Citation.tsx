import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline LTR isolate in JetBrains Mono: article numbers, page numbers, codes. */
export function Num({ children }: { children: ReactNode }) {
  return (
    <span dir="ltr" className="font-mono" style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

interface CitationProps {
  children: ReactNode;
  onClick?: () => void | Promise<void>;
  className?: string;
  /** Set false when children already contain their own <Num> spans (RTL copy). */
  mono?: boolean;
}

export function Citation({
  children,
  onClick,
  className: extraClassName,
  mono = true,
}: CitationProps) {
  const className = cn(
    extraClassName,
    "rounded-md text-primary no-underline decoration-accent underline-offset-4 hover:underline",
    mono && "font-mono",
  );

  return (
    <span className="inline-block">
      {onClick ? (
        <button
          type="button"
          onClick={() => void onClick()}
          className={className}
        >
          {children}
        </button>
      ) : (
        <span className={className}>{children}</span>
      )}
    </span>
  );
}
