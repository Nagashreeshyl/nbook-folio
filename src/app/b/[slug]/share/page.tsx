"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NotebookShell } from "@/components/book/NotebookShell";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { apiRequest } from "@/lib/api/client";

export default function SharePage() {
  return (
    <NotebookShell mode="read" requestedPageId={null}>
      <ShareBody />
    </NotebookShell>
  );
}

function ShareBody() {
  const { t } = useI18n();
  const notebook = useNotebookContext();
  const session = useNotebookSession();
  const toast = useToast();

  const [origin, setOrigin] = useState("");

  // Share-PIN state. Only hashes are stored server-side; the booleans reflect
  // whether a PIN is currently set.
  const [readPin, setReadPin] = useState("");
  const [editPin, setEditPin] = useState("");
  const [hasReadPin, setHasReadPin] = useState(false);
  const [hasEditPin, setHasEditPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const owner = notebook.can("manage");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const book = notebook.book as {
      hasReadPin?: boolean;
      hasEditPin?: boolean;
      readPinHash?: string | null;
      editPinHash?: string | null;
    } | null;
    if (book) {
      // The tree endpoint exposes hasReadPin/hasEditPin; the realtime book
      // event carries the raw hashes. Accept either so an SSE update after a
      // save does not wipe the just-set status.
      setHasReadPin(Boolean(book.hasReadPin) || Boolean(book.readPinHash));
      setHasEditPin(Boolean(book.hasEditPin) || Boolean(book.editPinHash));
    }
  }, [notebook.book]);

  const baseLink = origin ? `${origin}/b/${session.slug}` : "";

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function savePins(event: React.FormEvent) {
    event.preventDefault();
    if (!notebook.bookId) return;
    const r = readPin.trim();
    const e = editPin.trim();
    setPinError(null);
    if ((r && !/^\d{4}$/.test(r)) || (e && !/^\d{5}$/.test(e))) {
      setPinError(t("pinBadLength"));
      return;
    }
    if (r && e && r === e) {
      setPinError(t("pinsMustDiffer"));
      return;
    }
    setPinBusy(true);
    try {
      const data = await apiRequest<{ book: { hasReadPin: boolean; hasEditPin: boolean } }>(
        `/api/books/${notebook.bookId}`,
        {
          method: "PATCH",
          body: { ...(r ? { readPin: r } : {}), ...(e ? { editPin: e } : {}) },
        },
      );
      setHasReadPin(data.book.hasReadPin);
      setHasEditPin(data.book.hasEditPin);
      setReadPin("");
      setEditPin("");
      toast.success(t("pinsSaved"));
    } catch (error) {
      setPinError(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setPinBusy(false);
    }
  }

  async function clearPin(which: "read" | "edit") {
    if (!notebook.bookId) return;
    setPinBusy(true);
    setPinError(null);
    try {
      const data = await apiRequest<{ book: { hasReadPin: boolean; hasEditPin: boolean } }>(
        `/api/books/${notebook.bookId}`,
        { method: "PATCH", body: which === "read" ? { readPin: null } : { editPin: null } },
      );
      setHasReadPin(data.book.hasReadPin);
      setHasEditPin(data.book.hasEditPin);
      toast.success(t("pinsSaved"));
    } catch (error) {
      setPinError(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setPinBusy(false);
    }
  }

  const section = "border border-rule rounded-xl bg-sheet overflow-hidden";
  const heading =
    "px-5 py-3 border-b border-rule font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint font-semibold";
  const isPublic = !hasReadPin && !hasEditPin;

  return (
    <div className="px-4 py-6 lg:px-10 lg:py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <header>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-amber font-semibold mb-1.5">
            {session.role}
          </p>
          <h1 className="font-serif text-[32px] font-semibold text-ink leading-tight">
            {t("share")}
          </h1>
        </header>

        {/* The notebook link. */}
        <section className={section}>
          <h2 className={heading}>{t("shareLink")}</h2>
          <div className="p-5 flex flex-wrap items-center gap-3">
            <code className="flex-1 min-w-[240px] font-mono text-[13px] text-ink bg-sheet-low border border-rule rounded px-3 py-2.5 break-all select-all">
              {baseLink || "…"}
            </code>
            <Button icon="content_copy" onClick={() => void copy(baseLink)}>
              {t("copyLink")}
            </Button>
          </div>
          <p className="px-5 pb-5 -mt-2 font-sans text-[12.5px] text-ink-faint leading-relaxed">
            {isPublic ? t("shareOpenHint") : t("shareProtectedHint")}
          </p>
        </section>

        {/* PIN sharing — the primary way to share. */}
        {owner ? (
          <section className={section}>
            <h2 className={heading}>{t("sharePins")}</h2>
            <div className="p-5 space-y-5">
              <p className="font-sans text-[12.5px] text-ink-faint leading-relaxed">
                {t("sharePinsHint")}
              </p>

              <form onSubmit={savePins} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Input
                      label={t("readPin")}
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength={4}
                      placeholder={hasReadPin ? "••••" : "e.g. 4821"}
                      value={readPin}
                      icon="visibility"
                      onChange={(event) =>
                        setReadPin(event.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                    />
                    {hasReadPin && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="font-mono text-[10.5px] text-teal-ink uppercase">
                          {t("readPinSet")}
                        </span>
                        <button
                          type="button"
                          className="font-mono text-[10.5px] text-ink-faint hover:text-danger underline"
                          onClick={() => void clearPin("read")}
                        >
                          {t("clearPin")}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Input
                      label={t("editPin")}
                      inputMode="numeric"
                      pattern="\d{5}"
                      maxLength={5}
                      placeholder={hasEditPin ? "•••••" : "e.g. 73920"}
                      value={editPin}
                      icon="edit"
                      onChange={(event) =>
                        setEditPin(event.target.value.replace(/\D/g, "").slice(0, 5))
                      }
                    />
                    {hasEditPin && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="font-mono text-[10.5px] text-teal-ink uppercase">
                          {t("editPinSet")}
                        </span>
                        <button
                          type="button"
                          className="font-mono text-[10.5px] text-ink-faint hover:text-danger underline"
                          onClick={() => void clearPin("edit")}
                        >
                          {t("clearPin")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {pinError && (
                  <p className="font-sans text-[13px] text-danger" role="alert">
                    {pinError}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  icon="pin"
                  loading={pinBusy}
                  disabled={!readPin.trim() && !editPin.trim()}
                >
                  {t("savePins")}
                </Button>
              </form>

              {(hasReadPin || hasEditPin) && (
                <div className="space-y-3 pt-1">
                  <p className="font-sans text-[12px] text-ink-muted leading-relaxed">
                    {t("shareHowTo")}
                  </p>
                  {hasReadPin && (
                    <div className="rounded-lg border border-rule bg-sheet-low p-3">
                      <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">
                        {t("readLink")}
                      </p>
                      <p className="font-sans text-[12px] text-ink-faint break-all">
                        {baseLink}/<span className="text-amber font-semibold">••••</span>{" "}
                        <span className="text-ink-faint">({t("readLinkNote")})</span>
                      </p>
                    </div>
                  )}
                  {hasEditPin && (
                    <div className="rounded-lg border border-rule bg-sheet-low p-3">
                      <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">
                        {t("editLink")}
                      </p>
                      <p className="font-sans text-[12px] text-ink-faint break-all">
                        {baseLink}/<span className="text-amber font-semibold">•••••</span>{" "}
                        <span className="text-ink-faint">({t("editLinkNote")})</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className={section}>
            <h2 className={heading}>{t("sharePins")}</h2>
            <div className="p-5">
              <p className="font-sans text-[13px] text-ink-faint">{t("shareOwnerOnly")}</p>
            </div>
          </section>
        )}

        {/* Live collaborators. */}
        <section className={section}>
          <h2 className={heading}>{t("collaborators")}</h2>
          <div className="p-5">
            {notebook.presence.length === 0 ? (
              <p className="font-sans text-[13px] text-ink-faint">{t("noCollaborators")}</p>
            ) : (
              <ul className="space-y-2">
                {notebook.presence.map((entry) => (
                  <li key={entry.sessionId} className="flex items-center gap-3">
                    <span
                      className="h-7 w-7 rounded-full grid place-items-center font-mono text-[10px] font-bold text-white"
                      style={{ backgroundColor: entry.color }}
                    >
                      {entry.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-sans text-[13px] text-ink flex-1 truncate">
                      {entry.name}
                      {entry.sessionId === session.sessionId && (
                        <span className="text-ink-faint"> · {t("you")}</span>
                      )}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-faint uppercase">
                      {entry.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
