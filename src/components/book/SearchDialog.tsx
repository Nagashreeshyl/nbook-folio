"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/States";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { apiRequest } from "@/lib/api/client";
import type { SearchHit } from "@/types/models";

interface SearchResponse {
  query: string;
  hits: SearchHit[];
  engine: string;
}

export function SearchDialog({
  open,
  onClose,
  onOpenPage,
}: {
  open: boolean;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { t } = useI18n();
  const notebook = useNotebookContext();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      try {
        const data = await apiRequest<SearchResponse>(
          `/api/books/${notebook.bookId}/search?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        setHits(data.hits);
        setError(null);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(err instanceof Error ? err.message : t("errorGeneric"));
        setHits(null);
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, query, notebook.bookId, t]);

  return (
    <Modal open={open} onClose={onClose} bare align="top" maxWidth="max-w-2xl">
      <div className="flex items-center gap-3 px-1 pb-4 border-b border-rule">
        <span className="material-symbols-outlined text-ink-faint text-[20px]">search</span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && hits?.[0]) onOpenPage(hits[0].pageId);
          }}
          placeholder={t("searchPlaceholder")}
          className="flex-1 bg-transparent font-sans text-[15px] text-ink outline-none placeholder:text-ink-faint py-3"
          aria-label={t("search")}
        />
        <button
          onClick={onClose}
          className="p-1.5 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover transition-colors shrink-0"
          aria-label={t("close")}
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2">
        {error && <p className="py-6 text-center text-[13px] text-danger">{error}</p>}

        {!error && query.trim().length < 2 && (
          <p className="py-8 text-center font-sans text-[13px] text-ink-faint">
            {t("searchPlaceholder")}
          </p>
        )}

        {!error && query.trim().length >= 2 && hits === null && !busy && (
          <p className="py-8 text-center font-sans text-[13px] text-ink-faint">{t("loading")}</p>
        )}

        {!error && busy && hits === null && (
          <div className="py-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {!error && hits !== null && hits.length === 0 && (
          <p className="py-8 text-center font-sans text-[13px] text-ink-faint">
            {t("noSearchResults")}
          </p>
        )}

        {hits && hits.length > 0 && (
          <>
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint pt-3 pb-2">
              {hits.length} {t("results")}
            </p>
            <ul className="space-y-1 pb-2">
              {hits.map((hit) => (
                <li key={`${hit.blockId}`}>
                  <button
                    onClick={() => onOpenPage(hit.pageId)}
                    className="w-full text-start rounded-lg px-3 py-2.5 hover:bg-sheet-hover transition-colors"
                  >
                    <span className="flex items-center gap-2 mb-0.5">
                      <span className="font-serif text-[14px] text-ink font-medium">
                        {hit.pageTitle || t("untitledPage")}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        {hit.chapterTitle}
                      </span>
                      <span className="font-mono text-[10px] rounded border border-rule px-1 text-ink-faint">
                        {hit.matchKind}
                      </span>
                    </span>
                    <span
                      className="block font-sans text-[12.5px] text-ink-muted leading-snug line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
