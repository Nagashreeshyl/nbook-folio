"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Wordmark } from "@/components/ui/Wordmark";
import { apiRequest, ApiClientError } from "@/lib/api/client";
import type { Role } from "@/types/models";

export type GateStatus = "checking" | "gate" | "ready";

export interface NotebookSessionValue {
  status: GateStatus;
  bookId: string | null;
  slug: string;
  role: Role | null;
  sessionId: string | null;
  displayName: string | null;
  error: string | null;
  busy: boolean;
  unlock: (key: string, displayName?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const NotebookSessionContext = createContext<NotebookSessionValue | null>(null);

interface SessionResponse {
  authenticated: boolean;
  notFound?: boolean;
  bookId?: string;
  slug?: string;
  name?: string;
  role?: Role;
  sessionId?: string;
  displayName?: string;
}

/** Supplies a fixed session — the demo route presents a read-only guest. */
export function NotebookSessionProvider({
  value,
  children,
}: {
  value: NotebookSessionValue;
  children: ReactNode;
}) {
  return <NotebookSessionContext.Provider value={value}>{children}</NotebookSessionContext.Provider>;
}

/**
 * Resolves notebook access before any notebook UI mounts.
 *
 * Revisit → the signed cookie is re-verified silently. First visit → the
 * access-key prompt. Either path ends with a scoped session in context so no
 * child component ever has to re-check permissions.
 */
export function NotebookGate({ slug, children }: { slug: string; children: ReactNode }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [session, setSession] = useState<{
    bookId: string;
    role: Role;
    sessionId: string;
    displayName?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    setError(null);
    setNotFound(false);
    (async () => {
      try {
        const data = await apiRequest<SessionResponse>(
          `/api/access/session?slug=${encodeURIComponent(slug)}`,
        );
        if (cancelled) return;
        if (data.notFound) {
          setNotFound(true);
          setStatus("gate");
          return;
        }
        if (data.authenticated && data.bookId && data.role && data.sessionId) {
          setSession({
            bookId: data.bookId,
            role: data.role,
            sessionId: data.sessionId,
            ...(data.displayName ? { displayName: data.displayName } : {}),
          });
          setStatus("ready");
        } else {
          setStatus("gate");
        }
      } catch {
        if (!cancelled) {
          setError(t("errorGeneric"));
          setStatus("gate");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  const unlock = useCallback(
    async (attemptKey: string, displayName?: string) => {
      setBusy(true);
      setError(null);
      try {
        const data = await apiRequest<{
          book: { id: string; slug: string; name: string };
          role: Role;
          sessionId: string;
          displayName?: string;
        }>("/api/access", {
          method: "POST",
          body: {
            slug,
            key: attemptKey.trim(),
            ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
          },
        });
        setSession({
          bookId: data.book.id,
          role: data.role,
          sessionId: data.sessionId,
          // Otherwise the header shows no name until the session endpoint is
          // re-fetched on the next full page load.
          ...(data.displayName ? { displayName: data.displayName } : {}),
        });
        setKey("");
        setStatus("ready");
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setError(
            err.status === 401 ? t("invalidKey") : err.status === 429 ? err.message : err.message,
          );
        } else {
          setError(t("errorGeneric"));
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [slug, t],
  );

  const logout = useCallback(async () => {
    await apiRequest(`/api/access/logout?bookId=${encodeURIComponent(session?.bookId ?? "")}`, {
      method: "DELETE",
    });
    setSession(null);
    setStatus("gate");
    setKey("");
  }, [session?.bookId]);

  const value = useMemo<NotebookSessionValue>(
    () => ({
      status,
      bookId: session?.bookId ?? null,
      slug,
      role: session?.role ?? null,
      sessionId: session?.sessionId ?? null,
      displayName: session?.displayName ?? null,
      error,
      busy,
      unlock,
      logout,
    }),
    [status, session, slug, error, busy, unlock, logout],
  );

  if (status === "checking") {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-center">
          <span className="material-symbols-outlined animate-pulse text-amber text-[34px]">
            auto_stories
          </span>
          <p className="font-mono text-[11px] text-ink-faint mt-3 uppercase tracking-widest">
            {t("loading")}
          </p>
        </div>
      </div>
    );
  }

  if (status === "gate") {
    return (
      <main className="min-h-dvh px-5 py-10 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="mb-7 text-center">
            <Wordmark />
          </div>

          <div className="tactile-folio-sheet rounded-xl overflow-hidden">
            <div className="tactile-spine-gutter" />
            <div className="p-7 ps-9">
              {notFound ? (
                <>
                  <span className="material-symbols-outlined text-ink-faint text-[30px] block mb-3">
                    search_off
                  </span>
                  <h1 className="font-serif text-[24px] font-semibold text-ink mb-2">
                    {t("notebookNotFound")}
                  </h1>
                  <p className="font-sans text-[13px] text-ink-muted mb-6">
                    Check the link you were given, or ask the notebook owner to share it again.
                  </p>
                  <LinkHome />
                </>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void unlock(key, name);
                  }}
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber font-semibold mb-2">
                    access
                  </p>
                  <h1 className="font-serif text-[26px] font-semibold text-ink leading-tight mb-1.5">
                    {t("unlockTitle")}
                  </h1>
                  <p className="font-sans text-[13px] text-ink-muted mb-6 leading-relaxed">
                    {t("unlockSubtitle")}
                  </p>

                  <div className="space-y-4">
                    <Input
                      label={t("accessKey")}
                      placeholder={t("accessKeyPlaceholder")}
                      value={key}
                      autoFocus
                      spellCheck={false}
                      autoComplete="off"
                      icon="key"
                      onChange={(event) => setKey(event.target.value)}
                      error={error}
                    />
                    <Input
                      label={t("collaborators")}
                      hint="optional"
                      placeholder="How others will see you"
                      value={name}
                      maxLength={40}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full mt-6"
                    icon="lock_open"
                    loading={busy}
                    disabled={!key.trim()}
                  >
                    {busy ? t("checking") : t("enter")}
                  </Button>

                  <div className="mt-5 pt-4 border-t border-rule/70">
                    <LinkHome />
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <NotebookSessionContext.Provider value={value}>{children}</NotebookSessionContext.Provider>;
}

function LinkHome() {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      className="font-mono text-[12px] text-amber hover:underline inline-flex items-center gap-1"
    >
      ← {t("backHome")}
    </Link>
  );
}

export function useNotebookSession(): NotebookSessionValue {
  const ctx = useContext(NotebookSessionContext);
  if (!ctx) throw new Error("useNotebookSession must be used inside a /b/[slug] route");
  return ctx;
}
