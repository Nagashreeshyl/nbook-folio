import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { EXPORT_FORMATS, exportNotebook, type ExportFormat } from "@/lib/export";
import { handleError, json, forbidden, notFound, badRequest } from "@/lib/api/http";

export const runtime = "nodejs";

/** Lists the available export targets (drives the export dialog). */
export async function GET(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    const driver = getStorageDriver();
    const book = await driver.getBook(bookId);
    if (!book) throw notFound("Notebook not found.");

    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (!format) {
      return json({
        formats: EXPORT_FORMATS,
        allowed: session.role !== "viewer" || book.settings.allowExport,
      });
    }

    if (session.role === "viewer" && !book.settings.allowExport) {
      throw forbidden("Export is disabled for viewers in this notebook.");
    }
    if (!EXPORT_FORMATS.some((f) => f.id === format)) {
      throw badRequest(`Unsupported export format: ${format}`);
    }

    const [chapters, pages, blocks] = await Promise.all([
      driver.listChapters(bookId),
      driver.listPages(bookId),
      driver.listBlocksForBook(bookId),
    ]);

    const result = exportNotebook(
      { book, chapters, pages, blocks },
      format as ExportFormat,
    );

    return new Response(result.body, {
      headers: {
        "Content-Type": result.mime,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
