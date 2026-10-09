"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { LOCALES, type Locale } from "@/lib/i18n";
import { NotebookShell } from "@/components/book/NotebookShell";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";
import { Segmented, Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { apiRequest } from "@/lib/api/client";
import type { BookSettings } from "@/types/models";

export default function SettingsPage() {
  return (
    <NotebookShell mode="read" requestedPageId={null}>
      <SettingsBody />
    </NotebookShell>
  );
}

function SettingsBody() {
  const { t, locale, setLocale } = useI18n();
  const notebook = useNotebookContext();
  const session = useNotebookSession();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<BookSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState("");

  useEffect(() => {
    if (notebook.book) {
      setName(notebook.book.name);
      setDescription(notebook.book.description);
      setDraft(notebook.book.settings);
    }
  }, [notebook.book]);

  const owner = notebook.can("manage");
  const readOnly = !owner;

  async function saveGeneral(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await notebook.patchBook({ name: name.trim(), description: description.trim() });
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch: Partial<BookSettings>) {
    const next = { ...(draft ?? {}), ...patch } as BookSettings;
    setDraft(next);
    if (readOnly) return;
    try {
      await notebook.patchBook({ settings: patch });
      toast.success(t("saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    }
  }

  async function removeBook() {
    if (!notebook.bookId) return;
    try {
      await apiRequest(`/api/books/${notebook.bookId}`, { method: "DELETE" });
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    }
  }

  if (!notebook.book || !draft) {
    return <div className="p-8 font-mono text-[12px] text-ink-faint">{t("loading")}</div>;
  }

  const section = "border border-rule rounded-xl bg-sheet overflow-hidden";
  const heading =
    "px-5 py-3 border-b border-rule font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint font-semibold";

  return (
    <div className="px-4 py-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-amber font-semibold mb-1.5">
              {session.slug}
            </p>
            <h1 className="font-serif text-[32px] font-semibold text-ink leading-tight">
              {t("settings")}
            </h1>
          </div>
          <Link href={`/b/${session.slug}/read`}>
            <Button icon="arrow_back" size="sm">
              {t("back")}
            </Button>
          </Link>
        </header>

        {readOnly && (
          <p className="rounded-lg border border-amber/40 bg-amber-light/50 px-4 py-3 font-sans text-[13px] text-amber-mid">
            {t("errorForbidden")}
          </p>
        )}

        <section className={section}>
          <h2 className={heading}>{t("general")}</h2>
          <form onSubmit={saveGeneral} className="p-5 space-y-4">
            <Input
              label={t("bookName")}
              value={name}
              maxLength={120}
              disabled={readOnly}
              onChange={(event) => setName(event.target.value)}
            />
            <Textarea
              label={t("bookDescription")}
              value={description}
              rows={3}
              maxLength={2000}
              disabled={readOnly}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={busy} disabled={readOnly}>
                {t("save")}
              </Button>
            </div>
          </form>
        </section>

        <section className={section}>
          <h2 className={heading}>{t("appearance")}</h2>
          <div className="p-5 space-y-6">
            <div>
              <Label>{t("theme")}</Label>
              <div className="grid grid-cols-3 gap-2">
                <ThemeOption
                  value="eggshell"
                  active={draft.theme === "eggshell"}
                  label={t("themeEggshell")}
                  swatch={["#f0eee9", "#fbf9f4", "#080c12"]}
                  onClick={() => void saveSettings({ theme: "eggshell" })}
                />
                <ThemeOption
                  value="parchment"
                  active={draft.theme === "parchment"}
                  label={t("themeParchment")}
                  swatch={["#e8dfc9", "#f6efdd", "#2c2416"]}
                  onClick={() => void saveSettings({ theme: "parchment" })}
                />
                <ThemeOption
                  value="dark"
                  active={draft.theme === "dark"}
                  label={t("themeDark")}
                  swatch={["#1a1d24", "#23262e", "#f2efe6"]}
                  onClick={() => void saveSettings({ theme: "dark" })}
                />
              </div>
            </div>

            <Segmented
              label={t("fontScale")}
              value={draft.fontScale}
              options={[
                { value: "small", label: t("fontSmall") },
                { value: "medium", label: t("fontMedium") },
                { value: "large", label: t("fontLarge") },
              ]}
              onChange={(value) => void saveSettings({ fontScale: value })}
            />

            <Segmented
              label={t("pageAnimation")}
              value={draft.pageAnimation}
              options={[
                { value: "none", label: "None" },
                { value: "subtle", label: "Subtle" },
                { value: "realistic", label: "Realistic" },
              ]}
              onChange={(value) => void saveSettings({ pageAnimation: value })}
            />

            <Toggle
              label={t("pageSound")}
              description={t("pageSoundHint")}
              checked={draft.pageSound}
              disabled={readOnly}
              onChange={(value) => void saveSettings({ pageSound: value })}
            />

            <div>
              <Label>{t("language")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {LOCALES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setLocale(option.id as Locale)}
                    className={`py-2 px-3 rounded border font-sans text-[13px] transition-all ${
                      locale === option.id
                        ? "border-amber bg-sheet-high font-semibold text-ink"
                        : "border-rule bg-sheet-low text-ink-muted hover:bg-sheet-hover"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-sans text-[11.5px] text-ink-faint">
                Interface language for this browser. Page content keeps its own direction.
              </p>
            </div>
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>{t("permissions")}</h2>
          <div className="p-4 space-y-2">
            <Toggle
              label={t("allowExport")}
              checked={draft.allowExport}
              disabled={readOnly}
              onChange={(value) => void saveSettings({ allowExport: value })}
            />
            <Toggle
              label={t("allowViewerSearch")}
              checked={draft.allowViewerSearch}
              disabled={readOnly}
              onChange={(value) => void saveSettings({ allowViewerSearch: value })}
            />
            <Toggle
              label={t("allowViewerCopy")}
              checked={draft.allowViewerCopy}
              disabled={readOnly}
              onChange={(value) => void saveSettings({ allowViewerCopy: value })}
            />
            <Toggle
              label={t("allowStorage")}
              checked={draft.allowStorage}
              disabled={readOnly}
              onChange={(value) => void saveSettings({ allowStorage: value })}
            />
          </div>
        </section>

        <section className={`${section} border-danger/40`}>
          <h2 className={`${heading} text-danger/80`}>{t("dangerZone")}</h2>
          <div className="p-5 space-y-3">
            <p className="font-sans text-[13px] text-ink-muted leading-relaxed">
              {t("deleteBookWarning")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                placeholder={t("deleteBookConfirm")}
                disabled={!owner}
                className="flex-1 min-w-[220px] bg-sheet-low border border-rule rounded px-3 py-2 font-sans text-[13px] outline-none focus:border-danger disabled:opacity-50"
              />
              <Button
                variant="danger"
                disabled={!owner || confirmName !== notebook.book.name}
                onClick={() => void removeBook()}
                icon="delete_forever"
              >
                {t("deleteBookAction")}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ThemeOption({
  active,
  label,
  swatch,
  onClick,
  value,
}: {
  active: boolean;
  label: string;
  swatch: string[];
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border p-3 text-start transition-all ${
        active ? "border-amber bg-sheet-high" : "border-rule bg-sheet-low hover:bg-sheet-hover"
      }`}
    >
      <span className="flex gap-1 mb-2">
        {swatch.map((color) => (
          <span
            key={color}
            className="h-5 w-5 rounded-sm border border-black/10"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
      <span className="font-sans text-[12px] text-ink block">{label}</span>
      <span className="sr-only">{value}</span>
    </button>
  );
}
