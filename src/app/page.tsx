"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { Wordmark } from "@/components/ui/Wordmark";
import { apiRequest } from "@/lib/api/client";
import type { Book } from "@/types/models";

function formatWhen(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function HomePage() {
  const { t } = useI18n();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<{ books: Book[] }>("/api/books");
      setBooks(data.books);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
      setBooks([]);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-dvh px-5 py-8 flex flex-col">
      <header className="w-full max-w-3xl mx-auto flex items-center justify-between">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Link href="/demo">
            <Button variant="ghost" icon="visibility">
              {t("exploreDemo")}
            </Button>
          </Link>
          <Link href="/create">
            <Button variant="primary" icon="add">
              {t("createBook")}
            </Button>
          </Link>
        </div>
      </header>

      <section className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center py-14">
        <div className="tactile-folio-sheet rounded-xl p-8 sm:p-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber font-semibold mb-5">
            A tactile archival codex
          </p>
          <h1 className="font-serif text-[clamp(34px,7vw,58px)] leading-[1.02] font-semibold text-ink tracking-tight">
            {t("tagline1")}
            <br />
            {t("tagline2")}
            <br />
            <span className="text-amber">{t("tagline3")}</span>
          </h1>
          <p className="font-serif text-[17px] sm:text-[19px] text-ink-muted mt-6 max-w-xl leading-relaxed italic">
            {t("taglineSub")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/create">
              <Button variant="primary" size="lg" icon="note_add">
                {books && books.length > 0 ? t("createBook") : t("createFirstBook")}
              </Button>
            </Link>
            <Link href="/demo">
              <Button variant="secondary" size="lg" icon="visibility">
                {t("exploreDemo")}
              </Button>
            </Link>
            <span className="font-mono text-[11px] text-ink-faint">
              no account · link + access key
            </span>
          </div>
        </div>
      </section>

      <section className="w-full max-w-3xl mx-auto pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint font-semibold">
            {t("recentBooks")}
          </h2>
          <button
            onClick={() => void load()}
            title={t("retry")}
            className="p-1 rounded text-ink-faint hover:text-amber hover:bg-sheet-hover transition-colors inline-flex items-center justify-center cursor-pointer"
            aria-label={t("retry")}
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
          </button>
        </div>

        <div className="border border-rule rounded-lg overflow-hidden bg-sheet">
          {books === null ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-5 w-40" />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <p className="font-sans text-[13px] text-danger">{error}</p>
              <Button size="sm" className="mt-3" onClick={() => void load()}>
                {t("retry")}
              </Button>
            </div>
          ) : books.length === 0 ? (
            <EmptyState
              icon="menu_book"
              title={t("noBooks")}
              description={t("noBooksHint")}
              action={
                <span className="flex flex-wrap items-center justify-center gap-2">
                  <Link href="/create">
                    <Button variant="primary" icon="add">
                      {t("createFirstBook")}
                    </Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="ghost" icon="visibility">
                      {t("exploreDemo")}
                    </Button>
                  </Link>
                </span>
              }
            />
          ) : (
            <ul className="divide-y divide-rule">
              {books.map((book) => (
                <li key={book.id}>
                  <Link
                    href={`/b/${book.slug}`}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-sheet-hover transition-colors group"
                  >
                    <span className="h-9 w-9 shrink-0 rounded bg-sheet-high border border-rule grid place-items-center">
                      <span className="material-symbols-outlined text-amber text-[18px]">
                        bookmark
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[16px] text-ink font-medium truncate">
                        {book.name}
                      </span>
                      {book.description && (
                        <span className="block font-sans text-[12px] text-ink-faint truncate">
                          {book.description}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-ink-faint shrink-0 tabular-nums">
                      {formatWhen(book.updatedAt)}
                    </span>
                    <span className="material-symbols-outlined text-ink-faint group-hover:text-amber transition-colors text-[18px] shrink-0 rtl:rotate-180">
                      chevron_right
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="w-full max-w-3xl mx-auto flex items-center justify-between pt-4 border-t border-rule/70">
        <span className="font-mono text-[10px] text-ink-faint">NBOOK — eggshell · parchment · slate night</span>
        <span className="font-mono text-[10px] text-ink-faint">link + key access</span>
      </footer>
    </main>
  );
}
