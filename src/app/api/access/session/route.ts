import { z } from "zod";
import { readSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json } from "@/lib/api/http";

export const runtime = "nodejs";

const querySchema = z.object({ slug: z.string().trim().min(1).max(160) });

/**
 * Reports whether this browser already holds a valid session for a notebook.
 *
 * Lets returning readers skip the access-key prompt without ever exposing the
 * key itself — only the signed cookie is re-verified.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ slug: url.searchParams.get("slug") ?? "" });
    if (!parsed.success) return json({ authenticated: false });

    const book = await getStorageDriver().getBookBySlug(parsed.data.slug);
    if (!book) return json({ authenticated: false, notFound: true });

    const session = await readSessionForBook(book.id);
    if (!session) return json({ authenticated: false, bookId: book.id });

    return json({
      authenticated: true,
      bookId: book.id,
      slug: book.slug,
      name: book.name,
      role: session.role,
      sessionId: session.sessionId,
      displayName: session.displayName,
    });
  } catch (error) {
    return handleError(error);
  }
}

