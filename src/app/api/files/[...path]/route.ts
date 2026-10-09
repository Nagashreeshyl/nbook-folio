import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, notFound } from "@/lib/api/http";

export const runtime = "nodejs";

const SAFE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  "Cache-Control": "private, max-age=3600",
};

/**
 * Streams stored files. The first path segment is the notebook id, so the
 * session check is scoped to the notebook that owns the object.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await ctx.params;
    const decoded = segments.map((s) => decodeURIComponent(s));
    const bookId = decoded[0];
    if (!bookId || decoded.length < 2) throw notFound("File not found.");
    // Reject traversal attempts before touching storage.
    if (decoded.some((s) => s.includes("..") || s.includes("/"))) {
      throw notFound("File not found.");
    }

    await requireSessionForBook(bookId);

    const storagePath = decoded.join("/");
    const file = await getStorageDriver().readFile(storagePath);
    if (!file) throw notFound("File not found.");

    return new Response(new Uint8Array(file.data), {
      headers: {
        ...SAFE_HEADERS,
        "Content-Type": file.mime,
        "Content-Length": String(file.data.byteLength),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
