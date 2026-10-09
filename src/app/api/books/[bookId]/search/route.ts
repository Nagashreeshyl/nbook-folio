import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { exactSearch } from "@/lib/search";
import { handleError, forbidden, json, badRequest, notFound } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Exact search across book/chapter/page titles, rich text and code.
 * Returns a structured result set — no fabricated suggestions.
 */
export async function GET(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    const driver = getStorageDriver();

    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    if (!query) throw badRequest("Search query is required.", "empty_query");
    if (query.length > 200) throw badRequest("Search query is too long.");

    const book = await driver.getBook(bookId);
    if (!book) throw notFound("Notebook not found.");

    if (session.role === "viewer" && !book.settings.allowViewerSearch) {
      throw forbidden("Search is disabled for viewers in this notebook.");
    }

    const [chapters, pages, blocks] = await Promise.all([
      driver.listChapters(bookId),
      driver.listPages(bookId),
      driver.listBlocksForBook(bookId),
    ]);

    const hits = exactSearch.search(
      query,
      { book, chapters, pages, blocks },
      { limit: 60, includeCode: true },
    );

    return json({ query, hits, engine: "exact" });
  } catch (error) {
    return handleError(error);
  }
}
