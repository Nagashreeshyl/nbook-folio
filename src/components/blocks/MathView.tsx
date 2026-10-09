"use client";

import { useEffect, useState } from "react";

type Katex = typeof import("katex")["default"];


/**
 * KaTeX rendering for math blocks.
 *
 * The renderer is imported on the client only when a math block actually
 * mounts, so notebooks without formulas never pay for it.
 */
export function MathView({ latex, display }: { latex: string; display: boolean }) {
  const [katex, setKatex] = useState<Katex | null>(null);
  const [html, setHtml] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("katex")
      .then((module) => {
        if (!cancelled) setKatex(module.default);
      })
      .catch(() => {
        if (!cancelled) setError("KaTeX failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!katex) return;
    if (!latex.trim()) {
      setHtml("");
      setError(null);
      return;
    }
    try {
      setHtml(
        katex.renderToString(latex, { displayMode: display, throwOnError: true, strict: false }),
      );
      setError(null);
    } catch (err) {
      setHtml("");
      setError(err instanceof Error ? err.message : "Invalid LaTeX");
    }
  }, [katex, latex, display]);

  if (error) {
    return <p className="font-mono text-[12px] text-danger break-all">{error}</p>;
  }
  if (!latex.trim()) {
    return <p className="font-mono text-[13px] text-ink-faint italic">empty expression</p>;
  }
  if (!html) {
    return <div className="h-6 bg-sheet-hover rounded animate-pulse" aria-hidden="true" />;
  }

  return (
    <div
      className={display ? "my-2 text-center overflow-x-auto" : "inline-block"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
