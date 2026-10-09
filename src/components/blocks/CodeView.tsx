"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Read-only code rendering.
 *
 * Source is highlighted with Shiki at render time (client-only, so the
 * highlighter never blocks first paint) and the copy button always copies the
 * raw source — there is deliberately no execution affordance anywhere.
 */
export function CodeView({
  code,
  language,
  filename,
  lineNumbers,
  allowCopy = true,
}: {
  code: string;
  language: string;
  filename?: string;
  lineNumbers: boolean;
  allowCopy?: boolean;
}) {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    (async () => {
      try {
        const shiki = await import("shiki");
        const rendered = await shiki.codeToHtml(code, {
          lang: language || "text",
          theme: "github-dark-default",
        });
        if (!cancelled) setHtml(rendered);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  const lines = code.split("\n");

  return (
    <div className="rounded-lg border border-rule bg-[#0d1117] overflow-hidden code-view group">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/10">
        <span className="flex items-center gap-2 min-w-0">
          <span className="flex gap-1 shrink-0">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="font-mono text-[11px] text-white/55 truncate">
            {filename || language || "code"}
          </span>
        </span>
        {allowCopy && (
          <button
            onClick={() => void copy()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-[10.5px] text-white/60 hover:text-white hover:bg-white/10 transition-colors no-print"
            title="Copy source"
          >
            <span className="material-symbols-outlined text-[13px]">
              {copied ? "check" : "content_copy"}
            </span>
            {copied ? t("copiedCode") : t("copyCode")}
          </button>
        )}
      </div>

      <div className="relative">
        {html ? (
          <div
            className="overflow-x-auto py-3"
            // Shiki output is generated locally from the block's own source.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="overflow-x-auto py-3 px-4 font-mono text-[13px] leading-relaxed text-white/85">
            <code>{code}</code>
          </pre>
        )}
        {lineNumbers && (
          <div
            className="absolute inset-y-0 start-0 w-9 select-none border-e border-white/10 bg-white/[0.03] py-3 text-end pe-2 font-mono text-[12px] leading-relaxed text-white/35 pointer-events-none"
            aria-hidden="true"
          >
            {lines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
        )}
        {lineNumbers && <style>{`.code-view pre { padding-inline-start: 2.75rem; }`}</style>}
      </div>
    </div>
  );
}
