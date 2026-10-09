"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/ui/Wordmark";
import { apiRequest, ApiClientError } from "@/lib/api/client";

interface PinResponse {
  book: { id: string; slug: string; name: string };
  role: "viewer" | "editor";
}

/**
 * `/b/<slug>/<pin>` — opens a notebook straight from a shared link.
 *
 * A 4-digit PIN unlocks reading; a 5-digit PIN unlocks editing. The PIN is
 * exchanged for a session cookie, then the browser is sent to the matching
 * view. The digits never persist client-side.
 */
export default function PinUnlockPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams<{ slug: string; pin: string }>();
  const slug = params.slug;
  const pin = params.pin;

  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  const unlock = useCallback(async () => {
    if (!slug || !pin) return;
    if (!/^\d{4,5}$/.test(pin)) {
      setError(t("pinInvalid"));
      return;
    }
    setError(null);
    try {
      const result = await apiRequest<PinResponse>("/api/access/pin", {
        method: "POST",
        body: { slug, pin },
      });
      // 5-digit PIN → editing, 4-digit PIN → reading.
      const target = result.role === "editor" ? "edit" : "read";
      router.replace(`/b/${result.book.slug}/${target}`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.status === 429
            ? t("pinRateLimited")
            : err.message
          : t("errorGeneric"),
      );
    }
  }, [slug, pin, router, t]);

  useEffect(() => {
    // Exchange exactly once on mount — React 18 Strict Mode double-invokes
    // effects in development, and a second POST would waste a rate-limit slot.
    if (attempted.current) return;
    attempted.current = true;
    void unlock();
  }, [unlock]);

  return (
    <main className="min-h-dvh px-5 py-10 flex items-start justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Wordmark size="sm" />
        </div>

        <div className="tactile-folio-sheet rounded-xl p-7 text-center">
          {error ? (
            <>
              <span className="material-symbols-outlined text-danger text-[32px]">lock</span>
              <h1 className="font-serif text-[24px] font-semibold text-ink leading-tight mt-3">
                {t("pinUnlockFailed")}
              </h1>
              <p className="font-sans text-[13px] text-ink-muted mt-2" role="alert">
                {error}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  icon="refresh"
                  onClick={() => {
                    attempted.current = false;
                    void unlock();
                  }}
                >
                  {t("retry")}
                </Button>
                <Link href="/">
                  <Button variant="ghost">{t("backHome")}</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-amber text-[32px] animate-pulse">
                lock_open
              </span>
              <h1 className="font-serif text-[24px] font-semibold text-ink leading-tight mt-3">
                {t("pinUnlocking")}
              </h1>
              <p className="font-sans text-[13px] text-ink-muted mt-2">{t("checking")}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
