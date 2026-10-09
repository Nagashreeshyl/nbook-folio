"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { NotebookShell } from "@/components/book/NotebookShell";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { apiRequest } from "@/lib/api/client";
import type { AccessKey, Role } from "@/types/models";

type KeyRow = Omit<AccessKey, "keyHash">;

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

  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [plaintext, setPlaintext] = useState<{ role: Role; value: string } | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<Role | null>(null);
  const [link, setLink] = useState("");

  // Share-PIN state. We never read PINs back (only hashes are stored); the
  // boolean flags reflect whether a PIN is currently set.
  const [readPin, setReadPin] = useState("");
  const [editPin, setEditPin] = useState("");
  const [hasReadPin, setHasReadPin] = useState(false);
  const [hasEditPin, setHasEditPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const owner = notebook.can("manage");

  useEffect(() => {
    setLink(`${window.location.origin}/b/${session.slug}`);
    setOrigin(window.location.origin);
  }, [session.slug]);

  // Load whether PINs are already set from the tree-backed book.
  useEffect(() => {
    const book = notebook.book as { hasReadPin?: boolean; hasEditPin?: boolean } | null;
    if (book) {
      setHasReadPin(Boolean(book.hasReadPin));
      setHasEditPin(Boolean(book.hasEditPin));
    }
  }, [notebook.book]);

  const loadKeys = useCallback(async () => {
    if (!notebook.bookId || !owner) return;
    try {
      const data = await apiRequest<{ keys: KeyRow[] }>(`/api/books/${notebook.bookId}/keys`);
      setKeys(data.keys);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
      setKeys([]);
    }
  }, [notebook.bookId, owner, toast, t]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function createKey(role: Exclude<Role, "owner">) {
    if (!notebook.bookId) return;
    setBusy(role);
    try {
      const data = await apiRequest<{ key: KeyRow; plaintext: string }>(
        `/api/books/${notebook.bookId}/keys`,
        { method: "POST", body: { role, ...(label.trim() ? { label: label.trim() } : {}) } },
      );
      setPlaintext({ role, value: data.plaintext });
      setLabel("");
      await loadKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    } finally {
      setBusy(null);
    }
  }

  async function revoke(keyId: string) {
    if (!notebook.bookId) return;
    try {
      await apiRequest(`/api/books/${notebook.bookId}/keys/${keyId}`, { method: "DELETE" });
      await loadKeys();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorGeneric"));
    }
  }

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
          // Only send a field when the user typed into it, so saving one PIN
          // never silently clears the other.
          body: {
            ...(r ? { readPin: r } : {}),
            ...(e ? { editPin: e } : {}),
          },
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
        {
          method: "PATCH",
          body: which === "read" ? { readPin: null } : { editPin: null },
        },
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

        <section className={section}>
          <h2 className={heading}>{t("shareLink")}</h2>
          <div className="p-5 flex flex-wrap items-center gap-3">
            <code className="flex-1 min-w-[240px] font-mono text-[13px] text-ink bg-sheet-low border border-rule rounded px-3 py-2.5 break-all select-all">
              {link || "…"}
            </code>
            <Button icon="content_copy" onClick={() => void copy(link)}>
              {t("copyLink")}
            </Button>
          </div>
          <p className="px-5 pb-5 -mt-2 font-sans text-[12.5px] text-ink-faint leading-relaxed">
            Anyone with the link still needs an access key. Keys are per role and can be revoked
            at any time: a revoked key stops working at once, while a session opened with it
            already keeps access until it expires (12 hours).
          </p>
        </section>

        {owner && (
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
                    <div className="mt-1.5 flex items-center gap-2">
                      {hasReadPin && (
                        <>
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
                        </>
                      )}
                    </div>
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
                    <div className="mt-1.5 flex items-center gap-2">
                      {hasEditPin && (
                        <>
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
                        </>
                      )}
                    </div>
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
                  {hasReadPin && (
                    <div className="rounded-lg border border-rule bg-sheet-low p-3">
                      <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">
                        {t("readLink")}
                      </p>
                      <p className="font-sans text-[12px] text-ink-faint">
                        {origin}/b/{session.slug}/<span className="text-amber">••••</span>
                      </p>
                    </div>
                  )}
                  {hasEditPin && (
                    <div className="rounded-lg border border-rule bg-sheet-low p-3">
                      <p className="font-mono text-[10.5px] uppercase tracking-wider text-ink-faint font-semibold mb-1.5">
                        {t("editLink")}
                      </p>
                      <p className="font-sans text-[12px] text-ink-faint">
                        {origin}/b/{session.slug}/<span className="text-amber">•••••</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        <section className={section}>
          <h2 className={heading}>{t("access")}</h2>

          <div className="p-5 space-y-5">
            <div className="rounded-lg border border-amber/40 bg-amber-light/40 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-mid font-semibold">
                  {t("ownerKey")}
                </span>
                <span className="font-mono text-[10px] text-ink-faint">owner</span>
              </div>
              <p className="font-sans text-[12.5px] text-ink-muted leading-snug">
                {owner
                  ? "The owner key was shown once when this notebook was created. It cannot be revoked — it is the only way back in as owner. If you lose it, create a new notebook; keys are never stored in plaintext."
                  : "Only the notebook owner can see access keys."}
              </p>
            </div>

            {owner && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <Input
                    label={t("keyLabel")}
                    placeholder="Homework group, Reviewer…"
                    value={label}
                    maxLength={60}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </div>
                <Button
                  variant="primary"
                  icon="add"
                  loading={busy === "editor"}
                  onClick={() => void createKey("editor")}
                >
                  {t("createKey")} · editor
                </Button>
                <Button
                  icon="add"
                  loading={busy === "viewer"}
                  onClick={() => void createKey("viewer")}
                >
                  {t("createKey")} · viewer
                </Button>
              </div>
            )}

            {plaintext && (
              <div className="rounded-lg border border-dashed border-amber/60 bg-sheet p-4">
                <p className="font-mono text-[11px] uppercase tracking-wider text-amber-mid font-semibold mb-2">
                  {plaintext.role} · {t("keyShownOnce")}
                </p>
                <code className="block font-mono text-[13px] text-ink break-all bg-sheet-low border border-rule rounded px-3 py-2.5 select-all">
                  {plaintext.value}
                </code>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" icon="content_copy" onClick={() => void copy(plaintext.value)}>
                    {t("copyKey")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPlaintext(null)}>
                    {t("close")}
                  </Button>
                </div>
              </div>
            )}

            {keys === null ? (
              <div className="space-y-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : keys.length === 0 ? (
              <EmptyState icon="key" title="No keys yet" />
            ) : (
              <ul className="divide-y divide-rule border border-rule rounded-lg overflow-hidden">
                {keys.map((key) => (
                  <li key={key.id} className="flex items-center gap-3 px-4 py-3 bg-sheet-low">
                    <span className="material-symbols-outlined text-amber text-[18px]">key</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-sans text-[13px] text-ink truncate">
                        {key.label}
                      </span>
                      <span className="block font-mono text-[10.5px] text-ink-faint">
                        {key.role} ·{" "}
                        {key.lastUsedAt ? `used ${new Date(key.lastUsedAt).toLocaleString()}` : t("neverUsed")}
                      </span>
                    </span>
                    {key.revokedAt ? (
                      <span className="font-mono text-[10.5px] text-ink-faint uppercase">
                        {t("revoked")}
                      </span>
                    ) : (
                      <span className="font-mono text-[10.5px] text-teal-ink uppercase">
                        {t("active")}
                      </span>
                    )}
                    {!key.revokedAt && owner && key.role !== "owner" && (
                      <Button size="sm" variant="quiet" onClick={() => void revoke(key.id)}>
                        {t("revoke")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

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
