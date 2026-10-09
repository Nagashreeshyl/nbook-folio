"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { Wordmark } from "@/components/ui/Wordmark";
import { apiRequest, ApiClientError } from "@/lib/api/client";
import type { Book, Chapter, Page, Role } from "@/types/models";

interface CreateResponse {
  book: Book;
  chapter: Chapter;
  page: Page;
  ownerKey: { id: string; plaintext: string; role: Role };
}

export default function CreatePage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("bookNamePlaceholder"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<CreateResponse>("/api/books", {
        method: "POST",
        body: {
          name: name.trim(),
          description: description.trim(),
          chapterTitle: `${t("chapter")} 1`,
          pageTitle: t("untitledPage"),
        },
      });
      setCreated(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.ownerKey.plaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function openNotebook() {
    if (!created) return;
    setOpening(true);
    setError(null);
    try {
      // Exchange the key now so the browser already holds the session cookie
      // when the notebook route mounts — no gate flash.
      await apiRequest("/api/access", {
        method: "POST",
        body: { slug: created.book.slug, key: created.ownerKey.plaintext },
      });
      // Land straight on the page the notebook was seeded with.
      router.push(`/b/${created.book.slug}/edit?page=${created.page.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("errorGeneric"));
      setOpening(false);
    }
  }

  if (created) {
    return (
      <main className="min-h-dvh px-5 py-10 flex items-start justify-center">
        <div className="w-full max-w-lg">
          <div className="mb-6">
            <Wordmark size="sm" />
          </div>

          <div className="tactile-folio-sheet rounded-xl p-7">
            <div className="flex items-start gap-3 mb-5">
              <span className="material-symbols-outlined text-amber text-[26px]">task_alt</span>
              <div>
                <h1 className="font-serif text-[24px] font-semibold text-ink leading-tight">
                  {t("yourBookIsReady")}
                </h1>
                <p className="font-sans text-[13px] text-ink-muted mt-1">{created.book.name}</p>
              </div>
            </div>

            <div className="border border-dashed border-amber/60 bg-amber-light/40 rounded-lg p-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-mid font-semibold">
                  {t("ownerAccessKey")}
                </span>
                <span className="font-mono text-[10px] text-ink-faint">owner</span>
              </div>
              <code className="block font-mono text-[13px] text-ink break-all bg-sheet rounded border border-rule px-3 py-2.5 select-all">
                {created.ownerKey.plaintext}
              </code>
              <p className="font-sans text-[12px] text-ink-muted mt-2.5 leading-snug">
                {t("saveThisKey")}
              </p>
              <Button
                size="sm"
                className="mt-3"
                icon={copied ? "check" : "content_copy"}
                onClick={() => void copyKey()}
              >
                {copied ? t("copied") : t("copyKey")}
              </Button>
            </div>

            {error && (
              <p className="mt-4 font-sans text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon="auto_stories"
                loading={opening}
                onClick={() => void openNotebook()}
              >
                {t("openNbook")}
              </Button>
              <Link href="/">
                <Button variant="ghost">{t("backHome")}</Button>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-5 py-10 flex items-start justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Wordmark size="sm" />
        </div>

        <div className="tactile-folio-sheet rounded-xl p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber font-semibold mb-2">
            step 01
          </p>
          <h1 className="font-serif text-[30px] font-semibold text-ink leading-tight mb-1">
            {t("createFirstBook")}
          </h1>
          <p className="font-sans text-[13px] text-ink-muted mb-6">
            {t("taglineSub")}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <Input
              label={t("bookName")}
              placeholder={t("bookNamePlaceholder")}
              value={name}
              maxLength={120}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
            <Textarea
              label={t("bookDescriptionOptional")}
              placeholder={t("bookDescriptionPlaceholder")}
              value={description}
              rows={3}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />

            {error && (
              <p className="font-sans text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="font-mono text-[11px] text-ink-faint">
                owner key created on next step
              </span>
              <Button type="submit" variant="primary" size="lg" loading={busy} icon="note_add">
                {busy ? t("creating") : t("create")}
              </Button>
            </div>
          </form>
        </div>

        <p className="mt-5 font-sans text-[12px] text-ink-faint text-center leading-relaxed">
          No account required. Access is granted with notebook-specific keys —
          owners, editors and viewers each get their own.
        </p>
      </div>
    </main>
  );
}
