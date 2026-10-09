"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { NotebookProvider, useNotebookContext } from "@/components/book/NotebookProvider";
import { PageTree } from "@/components/book/PageTree";
import { PresenceBar } from "@/components/book/PresenceBar";
import { SearchDialog } from "@/components/book/SearchDialog";
import { AssistPanel } from "@/components/ai/AssistPanel";
import { ExportDialog } from "@/components/book/ExportDialog";
import { Wordmark } from "@/components/ui/Wordmark";

export type NotebookMode = "read" | "edit";

export function NotebookShell({
  mode,
  requestedPageId,
  children,
}: {
  mode: NotebookMode;
  requestedPageId: string | null;
  children: ReactNode;
}) {
  const { bookId, status } = useNotebookSession();
  if (status !== "ready" || !bookId) return null;
  return (
    <NotebookProvider bookId={bookId}>
      <NotebookChrome mode={mode} requestedPageId={requestedPageId}>
        {children}
      </NotebookChrome>
    </NotebookProvider>
  );
}

function NotebookChrome({
  mode,
  requestedPageId,
  children,
}: {
  mode: NotebookMode;
  requestedPageId: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useNotebookSession();
  const notebook = useNotebookContext();

  // Resolve the leaf to open: explicit `?page=` wins, otherwise the first
  // page in reading order. Collapsing it here keeps the tree highlight, the
  // presence heartbeat and the body all on the same page.
  const pageId = requestedPageId ?? notebook.firstPageId();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pageId]);
  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => notebook.setPageId(pageId), [notebook, pageId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function switchMode(next: NotebookMode) {
    if (next === mode) return;
    const params = new URLSearchParams(searchParams);
    if (pageId) params.set("page", pageId);
    const query = params.toString();
    router.push(`/b/${session.slug}/${next}${query ? `?${query}` : ""}`);
  }

  const base = `/b/${session.slug}`;
  const canEdit = notebook.can("write");

  const settings = notebook.book?.settings;
  const themeClass =
    settings?.theme === "dark"
      ? "dark-tactile"
      : settings?.theme === "parchment"
        ? "parchment-tactile"
        : "";
  const scaleClass = `nb-fs-${settings?.fontScale ?? "medium"}`;
  // "auto" follows the document direction (the locale sets it); only an
  // explicit ltr/rtl override pins the shell, otherwise `dir="auto"` would
  // re-detect direction from the first strong character and break RTL.
  const direction = settings?.direction;
  const pinnedDirection = direction === "ltr" || direction === "rtl" ? direction : undefined;

  return (
    <div
      className={`min-h-dvh flex flex-col ${themeClass} ${scaleClass}`}
      dir={pinnedDirection}
    >
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur-md no-print">
        {/* Wraps to a second row instead of overflowing on narrow phones. */}
        <div className="min-h-14 px-3 sm:px-4 py-1 sm:py-0 flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 sm:gap-x-3">
          <button
            className="lg:hidden p-2 -ms-1 rounded text-ink-muted hover:bg-sheet-hover"
            onClick={() => setDrawerOpen((value) => !value)}
            aria-label={t("contents")}
            aria-expanded={drawerOpen}
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <Wordmark size="sm" />
            <span className="hidden sm:block h-4 w-px bg-rule" />
            <span className="hidden sm:block font-serif text-[15px] text-ink truncate max-w-[36vw]">
              {notebook.book?.name ?? ""}
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-rule bg-sheet px-2 py-0.5 font-mono text-[10px] uppercase text-ink-faint shrink-0">
              {session.role}
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1 sm:gap-1.5 ms-auto">
            <PresenceBar />

            <Link
              href={`${base}/settings`}
              className="hidden sm:inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[12px] text-ink-muted hover:bg-sheet-hover hover:text-ink transition-colors"
              title={t("settings")}
            >
              <span className="material-symbols-outlined text-[17px]">settings</span>
            </Link>

            <button
              onClick={() => setAssistOpen(true)}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[12px] text-ink-muted hover:bg-sheet-hover hover:text-ink transition-colors"
              title={t("assist")}
            >
              <span className="material-symbols-outlined text-[17px] text-amber">auto_awesome</span>
              <span className="hidden lg:inline">{t("askNbook")}</span>
            </button>

            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[12px] text-ink-muted hover:bg-sheet-hover hover:text-ink transition-colors"
              title={`${t("search")} — ⌘K`}
            >
              <span className="material-symbols-outlined text-[17px]">search</span>
              <span className="hidden md:inline text-ink-faint">⌘K</span>
            </button>

            <button
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[12px] text-ink-muted hover:bg-sheet-hover hover:text-ink transition-colors"
              title={t("export")}
            >
              <span className="material-symbols-outlined text-[17px]">download</span>
            </button>

            <div className="flex items-center rounded border border-rule bg-sheet overflow-hidden">
              <ModeButton
                active={mode === "read"}
                icon="menu_book"
                label={t("view")}
                onClick={() => switchMode("read")}
              />
              <ModeButton
                active={mode === "edit"}
                icon="edit"
                label={t("edit")}
                onClick={() => canEdit && switchMode("edit")}
                disabled={!canEdit}
                title={canEdit ? undefined : t("viewerReadOnly")}
              />
            </div>

            <Link
              href={`${base}/share`}
              className="inline-flex items-center gap-1.5 rounded bg-night-raise text-white px-3 py-1.5 font-mono text-[12px] hover:brightness-110 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">ios_share</span>
              <span className="hidden sm:inline">{t("share")}</span>
            </Link>
          </div>
        </div>

        {!canEdit && (
          <div className="px-4 py-1.5 bg-amber-light/50 border-t border-amber/30">
            <p className="font-mono text-[11px] text-amber-mid flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px]">visibility</span>
              {t("viewerReadOnly")}
            </p>
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="hidden lg:flex w-[266px] shrink-0 border-e border-rule bg-sheet/50 flex-col sticky top-14 h-[calc(100dvh-3.5rem)] no-print">
          <PageTree activePageId={pageId} />
        </aside>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden no-print">
            <div
              className="absolute inset-0 bg-ink/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-y-0 start-0 w-[82vw] max-w-[300px] bg-sheet border-e border-rule shadow-2xl flex flex-col">
              <div className="h-14 px-3 flex items-center justify-between border-b border-rule shrink-0">
                <Wordmark size="sm" />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded text-ink-faint hover:bg-sheet-hover"
                  aria-label={t("close")}
                >
                  <span className="material-symbols-outlined text-[19px]">close</span>
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <PageTree
                  activePageId={pageId}
                  onNavigate={(next) => {
                    const params = new URLSearchParams(searchParams);
                    params.set("page", next);
                    router.push(
                      `/b/${session.slug}/${mode}?${params.toString()}`,
                    );
                    setDrawerOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0">{children}</main>
      </div>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenPage={(pageIdNext) => {
          setSearchOpen(false);
          const params = new URLSearchParams(searchParams);
          params.set("page", pageIdNext);
          router.push(`/b/${session.slug}/${mode}?${params.toString()}`);
        }}
      />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <AssistPanel
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        pageId={pageId}
      />
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[12px] transition-colors disabled:opacity-40 ${
        active ? "bg-sheet-high font-bold text-ink" : "text-ink-muted hover:text-ink"
      }`}
    >
      <span className={`material-symbols-outlined text-[16px] ${active ? "text-amber" : ""}`}>
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
