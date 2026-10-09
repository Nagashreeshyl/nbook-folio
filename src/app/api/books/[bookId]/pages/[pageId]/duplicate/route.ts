import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: { params: Promise<{ bookId: string; pageId: string }> }) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requirePermission(bookId, "write");
    const page = await getStorageDriver().duplicatePage(bookId, pageId);
    return json({ page }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
