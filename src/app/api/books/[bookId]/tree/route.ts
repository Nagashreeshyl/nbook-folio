import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, notFound } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Full notebook structure (chapters + pages, no block bodies).
 * Blocks are fetched lazily per open page.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    const driver = getStorageDriver();
    const [book, chapters, pages, presence] = await Promise.all([
      driver.getBook(bookId),
      driver.listChapters(bookId),
      driver.listPages(bookId),
      driver.listPresence(bookId),
    ]);
    if (!book) throw notFound("Notebook not found.");
    // Never leak PIN hashes to the client; expose only whether they are set.
    const { readPinHash, editPinHash, ...safeBookRest } = book;
    const safeBook = {
      ...safeBookRest,
      hasReadPin: Boolean(readPinHash),
      hasEditPin: Boolean(editPinHash),
    };
    return json({ book: safeBook, chapters, pages, presence, session: { role: session.role } });
  } catch (error) {
    return handleError(error);
  }
}
