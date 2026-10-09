"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  NotebookContextProvider,
  type NotebookContextValue,
} from "@/components/book/NotebookProvider";
import {
  NotebookSessionProvider,
  type NotebookSessionValue,
} from "@/components/book/NotebookGate";
import { BlockList } from "@/components/blocks/BlockList";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { blocksForDemoPage, demoBook, demoChapters, demoPages } from "./demoData";

const noop = () => undefined;
const asyncNoop = async () => undefined;

/**
 * Read-only tour of NBOOK. It reuses the real block renderers by supplying
 * fixture values to the notebook and session contexts — no API, no storage,
 * and nothing that could leak into a notebook library.
 */
export function DemoNotebook() {
  const { t } = useI18n();
  const [pageId, setPageId] = useState(demoPages[0]?.id ?? "");
  const page = demoPages.find((item) => item.id === pageId) ?? demoPages[0];
  const chapter = page ? demoChapters.find((item) => item.id === page.chapterId) : null;
  const blocks = page ? blocksForDemoPage(page.id) : [];

  const notebookValue = useMemo<NotebookContextValue>(
    () => ({
      status: "ready",
      book: demoBook,
      chapters: demoChapters,
      pages: demoPages,
      presence: [],
      role: "viewer",
      error: null,
      bookId: demoBook.id,
      can: (permission) => permission === "read",
      refresh: asyncNoop,
      patchBook: asyncNoop,
      createChapter: () => Promise.reject(new Error("read-only demo")),
      renameChapter: asyncNoop,
      deleteChapter: asyncNoop,
      reorderChapters: asyncNoop,
      createPage: () => Promise.reject(new Error("read-only demo")),
      renamePage: asyncNoop,
      deletePage: asyncNoop,
      duplicatePage: () => Promise.reject(new Error("read-only demo")),
      reorderPages: asyncNoop,
      pagesInChapter: (chapterId) =>
        demoPages
          .filter((item) => item.chapterId === chapterId)
          .sort((a, b) => a.order - b.order),
      firstPageId: () => demoPages[0]?.id ?? null,
      setPageId: noop,
    }),
    [],
  );

  const sessionValue = useMemo<NotebookSessionValue>(
    () => ({
      status: "ready",
      bookId: demoBook.id,
      slug: demoBook.slug,
      role: "viewer",
      sessionId: "demo",
      displayName: "Guest",
      error: null,
      busy: false,
      unlock: async () => true,
      logout: asyncNoop,
    }),
    [],
  );

  return (
    <NotebookSessionProvider value={sessionValue}>
      <NotebookContextProvider value={notebookValue}>
        <div className="min-h-dvh flex flex-col bg-paper">
          <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur-md">
            <div className="h-14 px-3 sm:px-5 flex items-center gap-3">
              <Wordmark size="sm" />
              <span className="hidden sm:block h-4 w-px bg-rule" />
              <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber/50 bg-amber-light/60 px-2.5 py-0.5">
                <span className="material-symbols-outlined text-amber text-[14px]">visibility</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-mid font-semibold">
                  {t("demoBadge")}
                </span>
              </span>
              <span className="flex-1" />
              <Link href="/">
                <Button size="sm" variant="ghost">
                  {t("backHome")}
                </Button>
              </Link>
              <Link href="/create">
                <Button size="sm" variant="primary" icon="add">
                  {t("createBook")}
                </Button>
              </Link>
            </div>
          </header>

          <div className="flex-1 flex min-h-0">
            <aside className="hidden md:flex w-[248px] shrink-0 border-e border-rule bg-sheet/50 flex-col sticky top-14 h-[calc(100dvh-3.5rem)]">
              <div className="px-4 pt-4 pb-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint font-semibold">
                  {t("contents")}
                </span>
              </div>
              <nav className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
                <ol className="space-y-3">
                  {demoChapters.map((demoChapter, chapterIndex) => (
                    <li key={demoChapter.id}>
                      <div className="flex items-center gap-1 px-2 py-1">
                        <span className="font-mono text-[10px] text-amber tabular-nums w-4 shrink-0">
                          {String(chapterIndex + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 min-w-0 font-serif text-[14px] font-semibold text-ink truncate">
                          {demoChapter.title}
                        </span>
                      </div>
                      <ol className="ms-6 border-s border-rule/70 ms-2 space-y-0.5 mt-0.5">
                        {demoPages
                          .filter((item) => item.chapterId === demoChapter.id)
                          .map((demoPage) => {
                            const active = demoPage.id === pageId;
                            return (
                              <li key={demoPage.id}>
                                <button
                                  type="button"
                                  onClick={() => setPageId(demoPage.id)}
                                  className={`w-full flex items-center gap-1.5 rounded px-2 py-1.5 text-start transition-colors ${
                                    active ? "bg-sheet-high" : "hover:bg-sheet-hover"
                                  }`}
                                >
                                  <span
                                    className={`material-symbols-outlined text-[14px] shrink-0 ${
                                      active ? "text-amber" : "text-ink-faint"
                                    }`}
                                  >
                                    {active ? "book_5" : "description"}
                                  </span>
                                  <span
                                    className={`flex-1 min-w-0 truncate font-sans text-[12.5px] ${
                                      active ? "text-ink" : "text-ink-muted"
                                    }`}
                                  >
                                    {demoPage.title}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                      </ol>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <main className="flex-1 min-w-0 px-4 py-6 lg:px-10 lg:py-8">
              <div className="max-w-[880px] mx-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <nav className="flex items-center gap-1.5 font-mono text-[11px] text-ink-faint min-w-0">
                    <span className="truncate max-w-[36vw]">{demoBook.name}</span>
                    {chapter && (
                      <>
                        <span className="shrink-0">/</span>
                        <span className="truncate max-w-[30vw]">{chapter.title}</span>
                      </>
                    )}
                  </nav>
                  <span className="md:hidden font-mono text-[10px] uppercase text-ink-faint">
                    {t("demoBadge")}
                  </span>
                </div>

                {/* Mobile chapter picker — the sidebar is desktop-only. */}
                <div className="md:hidden mb-4 -mx-1 px-1 overflow-x-auto">
                  <div className="flex gap-2">
                    {demoPages.map((demoPage) => (
                      <button
                        key={demoPage.id}
                        type="button"
                        onClick={() => setPageId(demoPage.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 font-sans text-[12px] ${
                          demoPage.id === pageId
                            ? "border-amber bg-sheet-high text-ink"
                            : "border-rule bg-sheet text-ink-muted"
                        }`}
                      >
                        {demoPage.title}
                      </button>
                    ))}
                  </div>
                </div>

                <article className="tactile-folio-sheet rounded-lg overflow-hidden page-turn" key={pageId}>
                  <div className="tactile-spine-gutter" />
                  <div className="ps-7 pe-6 sm:ps-10 sm:pe-9 py-8 sm:py-11">
                    <header className="mb-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber mb-2">
                        {t("demoBadge")}
                      </p>
                      <h1 className="font-serif text-[30px] sm:text-[36px] font-semibold text-ink leading-tight">
                        {page?.title}
                      </h1>
                    </header>

                    <div className="mt-7">
                      <BlockList
                        blocks={blocks}
                        editable={false}
                        onUpdate={() => undefined}
                        onCreate={() => undefined}
                        onDelete={() => undefined}
                        onDuplicate={() => undefined}
                        onReorder={() => undefined}
                      />
                    </div>
                  </div>

                  <footer className="ps-7 pe-6 sm:ps-10 sm:pe-9 py-4 border-t border-rule/70 bg-sheet-low/50">
                    <p className="font-sans text-[12px] text-ink-muted">{t("demoReadOnly")}</p>
                  </footer>
                </article>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/create">
                    <Button variant="primary" icon="note_add">
                      {t("createBook")}
                    </Button>
                  </Link>
                  <Link href="/">
                    <Button variant="ghost">{t("backHome")}</Button>
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </NotebookContextProvider>
    </NotebookSessionProvider>
  );
}
