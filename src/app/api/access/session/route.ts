import { z } from "zod";
import { cookies } from "next/headers";
import {
  createSessionToken,
  newDisplayName,
  newSessionId,
  readSessionForBook,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/access/session";
import { colorForSession } from "@/lib/access/presence";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json } from "@/lib/api/http";

export const runtime = "nodejs";

const querySchema = z.object({ slug: z.string().trim().min(1).max(160) });

/**
 * Reports access state for a notebook link and, when the notebook has no PINs
 * set, grants read access automatically.
 *
 * Three outcomes:
 *  - `authenticated`               → this browser already holds a session.
 *  - `authenticated` (just minted) → the notebook is public (no PINs), so a
 *                                    viewer session is issued on the spot.
 *  - `gate` + hasReadPin/hasEditPin → the notebook is PIN-protected; the
 *                                    client shows the PIN entry page.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ slug: url.searchParams.get("slug") ?? "" });
    if (!parsed.success) return json({ authenticated: false });

    const book = await getStorageDriver().getBookBySlug(parsed.data.slug);
    if (!book) return json({ authenticated: false, notFound: true });

    // Already unlocked (owner key, prior PIN, or earlier passwordless grant).
    const existing = await readSessionForBook(book.id);
    if (existing) {
      return json({
        authenticated: true,
        bookId: book.id,
        slug: book.slug,
        name: book.name,
        role: existing.role,
        sessionId: existing.sessionId,
        displayName: existing.displayName,
      });
    }

    const hasReadPin = Boolean(book.readPinHash);
    const hasEditPin = Boolean(book.editPinHash);

    // No PINs at all → the notebook is openly shareable. Mint a viewer session
    // immediately so the link "just works" with no prompt.
    if (!hasReadPin && !hasEditPin) {
      const displayName = newDisplayName();
      const sessionId = newSessionId();
      const token = createSessionToken({
        bookId: book.id,
        keyId: "public:viewer",
        role: "viewer",
        sessionId,
        displayName,
      });
      await getStorageDriver().setPresence(book.id, {
        sessionId,
        name: displayName,
        role: "viewer",
        pageId: null,
        color: colorForSession(sessionId),
        updatedAt: Date.now(),
      });
      const store = await cookies();
      store.set(sessionCookieName(book.id), token, sessionCookieOptions());
      return json({
        authenticated: true,
        bookId: book.id,
        slug: book.slug,
        name: book.name,
        role: "viewer",
        sessionId,
        displayName,
      });
    }

    // PIN-protected: tell the client which PIN entries to offer.
    return json({
      authenticated: false,
      bookId: book.id,
      slug: book.slug,
      name: book.name,
      hasReadPin,
      hasEditPin,
    });
  } catch (error) {
    return handleError(error);
  }
}
