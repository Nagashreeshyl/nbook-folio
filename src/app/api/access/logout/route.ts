import { cookies } from "next/headers";
import {
  clearCookieOptions,
  SESSION_COOKIE_PREFIX,
  sessionCookieName,
} from "@/lib/access/session";
import { json } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Clears notebook session cookies.
 *
 * Pass `?bookId=...` to drop a single notebook's session; otherwise every
 * notebook session held by this browser is dropped.
 */
export async function DELETE(request: Request) {
  const store = await cookies();
  const url = new URL(request.url);
  const bookId = url.searchParams.get("bookId");

  if (bookId) {
    store.set(sessionCookieName(bookId), "", clearCookieOptions());
  } else {
    for (const cookie of store.getAll()) {
      if (cookie.name.startsWith(SESSION_COOKIE_PREFIX)) {
        store.set(cookie.name, "", clearCookieOptions());
      }
    }
  }
  return json({ ok: true });
}
