import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Links in assistant answers are ordinary Markdown links. In the Tauri
 * webview `target="_blank"` is unreliable, so hand http(s) URLs to the
 * opener plugin and fall back to a browser window outside Tauri.
 */
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  if (!href) return <span>{children}</span>;

  const isHttp = /^https?:\/\//i.test(href);
  if (!isHttp) return <span className="break-all">{children}</span>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[var(--accent)] underline decoration-[var(--border-strong)] underline-offset-2 hover:decoration-[var(--accent)]"
      onClick={(event) => {
        event.preventDefault();
        void openUrl(href).catch((cause: unknown) => {
          console.error("Failed to open Markdown link", cause);
          window.open(href, "_blank", "noopener,noreferrer");
        });
      }}
    >
      {children}
    </a>
  );
}

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text-primary)]">
      {children}
    </strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through">{children}</del>,
  ul: ({ children }) => (
    <ul className="mb-2 ms-4 list-disc space-y-1 ps-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ms-4 list-decimal space-y-1 ps-1 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-greet font-semibold text-[var(--text-primary)] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-title font-semibold text-[var(--text-primary)] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-3 text-body font-semibold text-[var(--text-primary)] first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-3 text-sec font-semibold text-[var(--text-primary)] first:mt-0">
      {children}
    </h4>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-s-2 border-[var(--border-strong)] ps-3 italic text-[var(--text-secondary)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[var(--border)]" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-[var(--bg-muted)] p-3 font-mono text-meta [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: (props: ComponentPropsWithoutRef<"code">) => (
    <code className="rounded bg-[var(--bg-muted)] px-1 py-0.5 font-mono text-[0.9em]">
      {props.children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sec">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--border-strong)] px-2 py-1 text-start font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border)] px-2 py-1 align-top">
      {children}
    </td>
  ),
};

/** Render assistant/user text as Markdown using the frozen DESIGN.md tokens. */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
