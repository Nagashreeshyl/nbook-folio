"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { usePageBlocks, type SaveState } from "@/hooks/usePageBlocks";
import { BlockList } from "@/components/blocks/BlockList";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import type { NotebookMode } from "@/components/book/NotebookShell";
import type { Page } from "@/types/models";
import { playPaperTurnSound } from "@/utils/sound";

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "—",
  dirty: "saving…",
  saving: "saving…",
  saved: "saved",
  error: "retry needed",
  conflict: "conflict",
};

export function PageView({
  mode,
  requestedPageId,
}: {
  mode: NotebookMode;
  requestedPageId: string | null;
}) {
  const { t } = useI18n();
  const notebook = useNotebookContext();
  const session = useNotebookSession();
  const pageId = requestedPageId ?? notebook.firstPageId();

  const editable = mode === "edit" && notebook.can("write");
  const pageBlocks = usePageBlocks(notebook.bookId, pageId, { enabled: Boolean(pageId) });

  const siblings = useMemo(() => {
    const chapters = [...notebook.chapters].sort((a, b) => a.order - b.order);
    const ordered: Page[] = [];
    for (const chapter of chapters) ordered.push(...notebook.pagesInChapter(chapter.id));
    return ordered;
  }, [notebook]);

  const index = siblings.findIndex((page) => page.id === pageId);
  const previous = index > 0 ? (siblings[index - 1] ?? null) : null;
  const next =
    index >= 0 && index < siblings.length - 1 ? (siblings[index + 1] ?? null) : null;
  const chapter = pageBlocks.page
    ? notebook.chapters.find((item) => item.id === pageBlocks.page?.chapterId)
    : null;

  const soundEnabled = notebook.book?.settings.pageSound ?? false;
  const pageAnimation = notebook.book?.settings.pageAnimation ?? "subtle";

  // Only fires on an actual page change — never on mount or on settings edits.
  const seenPageForSound = useRef<string | null>(null);
  useEffect(() => {
    if (!pageId) return;
    const previous = seenPageForSound.current;
    seenPageForSound.current = pageId;
    if (previous === null || previous === pageId) return;
    if (!soundEnabled) return;
    // Reduced motion is an accessibility override, independent of pageSound.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    playPaperTurnSound();
  }, [pageId, soundEnabled]);

  const turnClass =
    pageAnimation === "none"
      ? "page-turn-none"
      : pageAnimation === "realistic"
        ? "page-turn page-turn--realistic"
        : "page-turn";

  if (notebook.status === "loading") {
    return (
      <div className="px-4 py-8 lg:px-10">
        <PageSkeleton />
      </div>
    );
  }

  if (!pageId) {
    return (
      <div className="px-4 py-14">
        <EmptyState
          icon="note_add"
          title={t("noPages")}
          description={notebook.can("write") ? t("addChapter") : undefined}
          action={
            <Link href={`/b/${session.slug}/settings`}>
              <Button variant="primary" icon="settings">
                {t("settings")}
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (pageBlocks.status === "error") {
    return (
      <div className="px-4 py-14">
        <ErrorState
          title={t("errorNotFound")}
          description={pageBlocks.error ?? undefined}
          action={
            <Button onClick={() => void pageBlocks.reload()} icon="refresh">
              {t("retry")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-10 lg:py-8">
      <div className="max-w-[880px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 no-print">
          <nav className="flex items-center gap-1.5 font-mono text-[11px] text-ink-faint min-w-0">
            <Link
              href={pageId ? `/b/${session.slug}/read?page=${pageId}` : `/b/${session.slug}/read`}
              className="hover:text-amber truncate max-w-[36vw]"
            >
              {notebook.book?.name}
            </Link>
            {chapter && (
              <>
                <span className="shrink-0">/</span>
                <span className="truncate max-w-[30vw]">{chapter.title}</span>
              </>
            )}
          </nav>

          {editable ? (
            <SaveIndicator state={pageBlocks.saveState} onRetry={pageBlocks.retryFailedWrites} />
          ) : null}
        </div>

        {/* No `overflow-hidden`: the block action rail lives in the margin
            outside the sheet (-58px) and would be clipped — and unhittable —
            by it. The page-turn animation transforms the sheet itself, which
            its own overflow never clipped. */}
        <article key={pageId} className={`tactile-folio-sheet rounded-lg ${turnClass}`}>
          <div className="tactile-spine-gutter" />

          <div className="ps-7 pe-6 sm:ps-10 sm:pe-9 py-8 sm:py-11">
            <PageHeader
              mode={mode}
              page={pageBlocks.page}
              editable={editable}
              onRename={(title) => void pageBlocks.renamePage(title)}
            />

            {pageBlocks.status === "loading" ? (
              <div className="mt-6 space-y-4">
                <div className="h-4 w-3/4 bg-sheet-hover rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-sheet-hover rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-sheet-hover rounded animate-pulse" />
              </div>
            ) : editable ? (
              <div className="mt-7">
                <BlockList
                  blocks={pageBlocks.blocks}
                  editable
                  onUpdate={(blockId, content) => pageBlocks.updateBlock(blockId, content)}
                  onSaveSilently={(blockId, content) =>
                    pageBlocks.saveBlockSilently(blockId, content)
                  }
                  onCreate={(type, after) => void pageBlocks.createBlock(type, after)}
                  onDelete={(blockId) => void pageBlocks.deleteBlock(blockId)}
                  onDuplicate={(blockId) => void pageBlocks.duplicateBlock(blockId)}
                  onReorder={(ids) => void pageBlocks.reorderBlocks(ids)}
                />
              </div>
            ) : (
              <div className="mt-7">
                <BlockList
                  blocks={pageBlocks.blocks}
                  editable={false}
                  onUpdate={() => undefined}
                  onCreate={() => undefined}
                  onDelete={() => undefined}
                  onDuplicate={() => undefined}
                  onReorder={() => undefined}
                />
              </div>
            )}
          </div>

          <footer className="ps-7 pe-6 sm:ps-10 sm:pe-9 py-4 border-t border-rule/70 bg-sheet-low/50 flex items-center justify-between gap-3 no-print">
            <PageNav href={previous} mode={mode} label={t("previousPage")} dir="prev" />
            <span className="font-mono text-[10.5px] text-ink-faint tabular-nums">
              {index >= 0 ? index + 1 : 0} / {siblings.length}
            </span>
            <PageNav href={next} mode={mode} label={t("nextPage")} dir="next" />
          </footer>
        </article>

        {mode === "edit" && !notebook.can("write") && (
          <p className="mt-4 font-mono text-[11px] text-amber-mid text-center">
            {t("viewerReadOnly")}
          </p>
        )}
      </div>
    </div>
  );
}

function PageHeader({
  mode,
  page,
  editable,
  onRename,
}: {
  mode: NotebookMode;
  page: Page | null;
  editable: boolean;
  onRename: (title: string) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(page?.title ?? "");

  useEffect(() => setDraft(page?.title ?? ""), [page?.id, page?.title]);

  if (!page) return null;

  return (
    <header>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-amber font-semibold mb-2.5">
        {mode === "edit" ? t("editing") : t("reading")}
      </p>
      {editable ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => draft.trim() && draft !== page.title && onRename(draft.trim())}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder={t("untitledPage")}
          className="w-full bg-transparent font-serif text-[clamp(26px,4vw,38px)] font-semibold text-ink leading-[1.15] outline-none placeholder:text-ink-faint focus:border-b focus:border-amber pb-1"
        />
      ) : (
        <h1 className="font-serif text-[clamp(26px,4vw,38px)] font-semibold text-ink leading-[1.15]">
          {page.title || t("untitledPage")}
        </h1>
      )}
    </header>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (state !== "saved") return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "conflict") return;
    toast.show(t("conflict"), "warn");
  }, [state, toast, t]);

  if (state === "error") {
    return (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 font-mono text-[11px] text-danger hover:underline"
      >
        <span className="material-symbols-outlined text-[13px]">error</span>
        {t("saveFailed")} — {t("retry")}
      </button>
    );
  }

  const tone =
    state === "conflict"
      ? "text-amber-mid"
      : state === "dirty" || state === "saving"
        ? "text-ink-faint"
        : "text-teal-ink";


  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] transition-opacity ${
        tone
      } ${flash ? "opacity-60" : "opacity-100"}`}
      aria-live="polite"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          state === "dirty" || state === "saving"
            ? "bg-ink-faint animate-pulse"
            : "bg-teal-soft"
        }`}
      />
      {state === "conflict" ? t("conflict") : SAVE_LABEL[state]}
    </span>
  );
}

function PageNav({
  href,
  mode,
  label,
  dir,
}: {
  href: Page | null;
  mode: NotebookMode;
  label: string;
  dir: "prev" | "next";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useNotebookSession();
  if (!href) return <span className="w-24" />;

  const icon = dir === "prev" ? "arrow_back" : "arrow_forward";
  return (
    <button
      onClick={() => {
        const params = new URLSearchParams(searchParams);
        params.set("page", href.id);
        router.push(`/b/${session.slug}/${mode}?${params.toString()}`);
      }}
      className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted hover:text-amber transition-colors max-w-[38%] group"
      title={href.title}
    >
      {dir === "prev" && (
        <span className="material-symbols-outlined text-[15px] rtl:rotate-180">{icon}</span>
      )}
      <span className="truncate group-hover:underline">{href.title || label}</span>
      {dir === "next" && (
        <span className="material-symbols-outlined text-[15px] rtl:rotate-180">{icon}</span>
      )}
    </button>
  );
}
