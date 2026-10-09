"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { apiRequest } from "@/lib/api/client";
import type { AIFeature } from "@/lib/ai/features";
import type { SearchHit } from "@/types/models";

interface AiResponse {
  text: string;
  provider: string;
  model: string;
  fallbacks: Array<{ provider: string; error: string }>;
  sources: SearchHit[];
}

interface Conversation {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: SearchHit[];
  note?: string;
}

const TEXT_ACTIONS: Array<{ feature: AIFeature; icon: string }> = [
  { feature: "explain", icon: "lightbulb" },
  { feature: "summarize", icon: "summarize" },
  { feature: "rewrite", icon: "edit_note" },
  { feature: "translate", icon: "translate" },
  { feature: "flashcards", icon: "style" },
  { feature: "quiz", icon: "quiz" },
];

const CODE_ACTIONS: Array<{ feature: AIFeature; icon: string }> = [
  { feature: "code_explain", icon: "code" },
  { feature: "code_improve", icon: "auto_awesome" },
  { feature: "code_document", icon: "description" },
  { feature: "code_example", icon: "experiment" },
];

function currentSelection(): string {
  if (typeof window === "undefined") return "";
  const selection = window.getSelection();
  return selection?.toString().trim() ?? "";
}

function currentCodeSelection(): string {
  const selection = currentSelection();
  if (selection) return selection;
  const active = document.activeElement as HTMLElement | null;
  const codeBlock = active?.closest?.("[data-block-id]")?.querySelector("pre, .cm-content");
  return codeBlock?.textContent?.trim() ?? "";
}

export function AssistPanel({
  open,
  onClose,
  pageId,
}: {
  open: boolean;
  onClose: () => void;
  pageId: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const notebook = useNotebookContext();
  const session = useNotebookSession();

  const [items, setItems] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<AIFeature | "ask" | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, busy]);

  async function run(feature: AIFeature | "ask", payload: Record<string, unknown>) {
    setBusy(feature);
    const userText =
      feature === "ask"
        ? String(payload.query ?? "")
        : `${t(`aiFeatures.${feature}` as never)}${payload.selection ? ` — “${String(payload.selection).slice(0, 80)}${String(payload.selection).length > 80 ? "…" : ""}”` : ""}`;

    setItems((prev) => [...prev, { id: nextId.current++, role: "user", text: userText }]);

    try {
      const data = await apiRequest<AiResponse>("/api/ai", {
        method: "POST",
        body: { bookId: notebook.bookId, feature, pageId, ...payload },
      });
      setItems((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "assistant",
          text: data.text,
          ...(data.sources.length ? { sources: data.sources } : {}),
          note:
            data.fallbacks.length > 0
              ? `${data.provider} · ${data.model} (fell back after ${data.fallbacks.length} failure${data.fallbacks.length > 1 ? "s" : ""})`
              : `${data.provider} · ${data.model}`,
        },
      ]);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 0;
      const message =
        status === 503
          ? t("aiNotConfigured")
          : err instanceof Error
            ? err.message
            : t("aiUnavailable");
      setItems((prev) => [
        ...prev,
        { id: nextId.current++, role: "assistant", text: message },
      ]);
    } finally {
      setBusy(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 no-print" role="dialog" aria-label={t("assist")}>
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden="true" />
      <aside className="absolute inset-y-0 end-0 w-[min(440px,100vw)] bg-sheet border-s border-rule shadow-2xl flex flex-col">
        <header className="h-14 px-4 flex items-center justify-between border-b border-rule shrink-0">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber text-[20px]">auto_awesome</span>
            <span className="font-serif text-[17px] font-semibold text-ink">{t("assist")}</span>
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-ink-faint hover:bg-sheet-hover hover:text-ink"
            aria-label={t("close")}
          >
            <span className="material-symbols-outlined text-[19px]">close</span>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4" ref={scrollRef}>
          {items.length === 0 && (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-amber/50 text-[34px] block mb-2">
                auto_awesome
              </span>
              <p className="font-serif text-[16px] text-ink mb-1">{t("askPlaceholder")}</p>
              <p className="font-sans text-[12.5px] text-ink-faint leading-relaxed">
                Answers cite the pages they came from. Nothing is invented when no source matches.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg px-3.5 py-3 border ${
                  item.role === "user"
                    ? "bg-sheet-low border-rule ms-6"
                    : "bg-sheet-high border-rule/70 me-2"
                }`}
              >
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">
                  {item.role === "user" ? session.displayName ?? t("you") : t("assist")}
                </p>
                <div className="font-sans text-[13.5px] text-ink-soft leading-relaxed whitespace-pre-wrap">
                  {item.text}
                </div>
                {item.note && (
                  <p className="mt-2 font-mono text-[10px] text-ink-faint">{item.note}</p>
                )}
                {item.sources && item.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-rule">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-amber-mid mb-1.5">
                      {t("aiSources")}
                    </p>
                    <ul className="space-y-1">
                      {item.sources.map((source) => (
                        <li key={`${source.pageId}-${source.blockId}`}>
                          <span className="font-sans text-[12px] text-ink-muted">
                            <span className="text-ink font-medium">{source.pageTitle}</span>
                            <span className="text-ink-faint"> · {source.chapterTitle}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="rounded-lg px-3.5 py-3 border bg-sheet-high border-rule/70 me-2 flex items-center gap-2">
                <span className="material-symbols-outlined animate-pulse text-amber text-[16px]">
                  auto_awesome
                </span>
                <span className="font-sans text-[13px] text-ink-muted">{t("loading")}</span>
              </div>
            )}
          </div>

        </div>

        <div className="border-t border-rule p-3 space-y-3 shrink-0">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">
              On selection
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_ACTIONS.map((action) => (
                <ActionButton
                  key={action.feature}
                  icon={action.icon}
                  label={t(`aiFeatures.${action.feature}` as never)}
                  disabled={busy !== null}
                  onClick={() => {
                    const text = currentSelection();
                    if (!text) {
                      toast.show(t("selectToUseAi"), "info");
                      return;
                    }
                    void run(action.feature, { selection: text });
                  }}
                />
              ))}
              {CODE_ACTIONS.map((action) => (
                <ActionButton
                  key={action.feature}
                  icon={action.icon}
                  label={t(`aiFeatures.${action.feature}` as never)}
                  disabled={busy !== null}
                  onClick={() => {
                    const text = currentCodeSelection();
                    if (!text) {
                      toast.show(t("selectToUseAi"), "info");
                      return;
                    }
                    void run(action.feature, { selection: text });
                  }}
                />
              ))}
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = query.trim();
              if (!value) return;
              setQuery("");
              void run("ask", { query: value });
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
              placeholder={t("askPlaceholder")}
              className="flex-1 resize-none bg-sheet-low border border-rule rounded-lg px-3 py-2.5 font-sans text-[13px] text-ink outline-none focus:border-amber placeholder:text-ink-faint"
            />
            <Button
              type="submit"
              variant="primary"
              icon="send"
              disabled={busy !== null || !query.trim()}
              aria-label={t("send")}
            />
          </form>
        </div>
      </aside>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded border border-rule bg-sheet-low px-1.5 py-2 text-center hover:border-amber hover:bg-sheet-hover transition-colors disabled:opacity-50"
    >
      <span className="material-symbols-outlined text-amber text-[16px]">{icon}</span>
      <span className="font-mono text-[9.5px] leading-tight text-ink-muted">{label}</span>
    </button>
  );
}
