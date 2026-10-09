"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { apiRequest } from "@/lib/api/client";
import type { AIFeature } from "@/lib/ai/features";
import { renderMarkdown } from "@/lib/ai/markdown";
import { parseQuiz, parseFlashcards, type QuizItem, type Flashcard } from "@/lib/ai/structured";
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
  /** Structured payloads rendered as interactive widgets. */
  quiz?: QuizItem[];
  flashcards?: Flashcard[];
  sources?: SearchHit[];
  note?: string;
}

const TEXT_ACTIONS: AIFeature[] = [
  "explain",
  "summarize",
  "rewrite",
  "translate",
  "flashcards",
  "quiz",
];

const CODE_ACTIONS: AIFeature[] = [
  "code_explain",
  "code_improve",
  "code_document",
  "code_example",
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
  const [action, setAction] = useState<AIFeature>("explain");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

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

      // Quiz and flashcards come back as JSON — render them as interactive
      // widgets. If parsing fails we fall back to the markdown text so the
      // user still sees something useful.
      const quiz = feature === "quiz" ? parseQuiz(data.text) : null;
      const flashcards = feature === "flashcards" ? parseFlashcards(data.text) : null;

      setItems((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "assistant",
          text: data.text,
          ...(quiz ? { quiz } : {}),
          ...(flashcards ? { flashcards } : {}),
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

  const body = (
    <>
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
              {t("aiSelectionHint")}
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

              {item.role === "assistant" && item.quiz ? (
                <QuizView items={item.quiz} />
              ) : item.role === "assistant" && item.flashcards ? (
                <FlashcardsView cards={item.flashcards} />
              ) : item.role === "assistant" ? (
                <div
                  className="nb-prose nb-ai-prose font-sans text-[13.5px] text-ink-soft leading-relaxed"
                  // renderMarkdown escapes all input before adding tags.
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(item.text) }}
                />
              ) : (
                <div className="font-sans text-[13.5px] text-ink-soft leading-relaxed whitespace-pre-wrap">
                  {item.text}
                </div>
              )}

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
          <label
            htmlFor="ai-action-select"
            className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5 block"
          >
            {t("aiOnSelection")}
          </label>
          <div className="flex items-center gap-2">
            <select
              id="ai-action-select"
              value={action}
              onChange={(event) => setAction(event.target.value as AIFeature)}
              disabled={busy !== null}
              className="flex-1 bg-sheet-low border border-rule rounded-lg px-3 py-2.5 font-sans text-[13px] text-ink outline-none focus:border-amber disabled:opacity-50"
            >
              <optgroup label={t("aiGroupText")}>
                {TEXT_ACTIONS.map((feature) => (
                  <option key={feature} value={feature}>
                    {t(`aiFeatures.${feature}` as never)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("aiGroupCode")}>
                {CODE_ACTIONS.map((feature) => (
                  <option key={feature} value={feature}>
                    {t(`aiFeatures.${feature}` as never)}
                  </option>
                ))}
              </optgroup>
            </select>
            <Button
              variant="primary"
              icon="auto_awesome"
              loading={busy !== null && busy === action}
              disabled={busy !== null}
              onClick={() => {
                const isCode = CODE_ACTIONS.includes(action);
                const text = isCode ? currentCodeSelection() : currentSelection();
                if (!text) {
                  toast.show(t("selectToUseAi"), "info");
                  return;
                }
                void run(action, { selection: text });
              }}
            >
              {t("aiRun")}
            </Button>
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
    </>
  );

  return (
    <>
      {/* Mobile-only dimmer behind the slide-over. On lg it is hidden and the
          panel becomes a docked column, so page text stays selectable. */}
      <div
        className="lg:hidden fixed inset-0 z-40 bg-ink/30 no-print"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="complementary"
        aria-label={t("assist")}
        className={
          // Docked column on large screens; a fixed slide-over below lg.
          "no-print bg-sheet border-s border-rule flex flex-col " +
          "fixed inset-y-0 end-0 z-40 w-[min(440px,100vw)] shadow-2xl " +
          "lg:z-auto lg:w-[400px] lg:shrink-0 lg:shadow-none lg:inset-auto " +
          "lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)]"
        }
      >
        {body}
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive quiz                                                    */
/* ------------------------------------------------------------------ */

function QuizView({ items }: { items: QuizItem[] }) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const total = items.length;
  const score = items.reduce(
    (sum, item, index) => (answers[index] === item.answerIndex ? sum + 1 : sum),
    0,
  );
  const allAnswered = items.every((_, index) => answers[index] !== undefined);

  return (
    <div className="space-y-4">
      {submitted && (
        <div className="rounded-lg border border-amber/50 bg-amber-light/40 px-3 py-2.5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-wider text-amber-mid">
            {t("quizResult")}
          </p>
          <p className="font-serif text-[22px] font-semibold text-ink">
            {score} / {total}
          </p>
        </div>
      )}

      {items.map((item, qIndex) => (
        <div key={qIndex} className="space-y-2">
          <p className="font-sans text-[13.5px] font-medium text-ink leading-snug">
            {qIndex + 1}. {item.question}
          </p>
          <div className="space-y-1.5">
            {item.options.map((option, oIndex) => {
              const chosen = answers[qIndex] === oIndex;
              const isCorrect = item.answerIndex === oIndex;
              let state =
                "border-rule bg-sheet-low hover:border-amber text-ink-soft";
              if (submitted) {
                if (isCorrect) state = "border-emerald-600/60 bg-emerald-50 text-ink";
                else if (chosen) state = "border-danger/60 bg-red-50 text-ink";
                else state = "border-rule bg-sheet-low text-ink-faint";
              } else if (chosen) {
                state = "border-amber bg-amber-light/40 text-ink";
              }
              return (
                <button
                  key={oIndex}
                  type="button"
                  disabled={submitted}
                  onClick={() => setAnswers((prev) => ({ ...prev, [qIndex]: oIndex }))}
                  className={`w-full text-start flex items-center gap-2 rounded-lg border px-3 py-2 font-sans text-[13px] transition-colors disabled:cursor-default ${state}`}
                >
                  <span
                    className={`grid place-items-center h-5 w-5 shrink-0 rounded-full border text-[11px] font-mono ${
                      chosen ? "border-amber bg-amber text-white" : "border-rule text-ink-faint"
                    }`}
                  >
                    {String.fromCharCode(65 + oIndex)}
                  </span>
                  <span className="flex-1">{option}</span>
                  {submitted && isCorrect && (
                    <span className="material-symbols-outlined text-emerald-600 text-[16px]">
                      check_circle
                    </span>
                  )}
                  {submitted && chosen && !isCorrect && (
                    <span className="material-symbols-outlined text-danger text-[16px]">cancel</span>
                  )}
                </button>
              );
            })}
          </div>
          {submitted && item.explanation && (
            <p className="font-sans text-[12px] text-ink-faint leading-relaxed ps-1">
              {item.explanation}
            </p>
          )}
        </div>
      ))}

      {!submitted ? (
        <Button
          variant="primary"
          icon="task_alt"
          disabled={!allAnswered}
          onClick={() => setSubmitted(true)}
        >
          {t("quizSubmit")}
        </Button>
      ) : (
        <Button
          variant="ghost"
          icon="refresh"
          onClick={() => {
            setAnswers({});
            setSubmitted(false);
          }}
        >
          {t("quizRetry")}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interactive flashcards                                              */
/* ------------------------------------------------------------------ */

function FlashcardsView({ cards }: { cards: Flashcard[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[index];
  if (!card) return null;

  const go = (delta: number) => {
    setFlipped(false);
    setIndex((prev) => (prev + delta + cards.length) % cards.length);
  };

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint text-center">
        {index + 1} / {cards.length}
      </p>
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className="w-full min-h-[120px] rounded-xl border border-rule bg-sheet-low hover:border-amber transition-colors px-4 py-5 flex flex-col items-center justify-center text-center gap-2"
      >
        <span className="font-mono text-[9px] uppercase tracking-wider text-amber-mid">
          {flipped ? t("flashcardAnswer") : t("flashcardQuestion")}
        </span>
        <span className="font-sans text-[14px] text-ink leading-relaxed">
          {flipped ? card.answer : card.question}
        </span>
        <span className="font-mono text-[10px] text-ink-faint mt-1">{t("flashcardTap")}</span>
      </button>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" icon="chevron_left" onClick={() => go(-1)}>
          {t("previousPage")}
        </Button>
        <Button variant="ghost" icon="chevron_right" onClick={() => go(1)}>
          {t("nextPage")}
        </Button>
      </div>
    </div>
  );
}
