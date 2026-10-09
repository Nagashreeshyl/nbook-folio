import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ bookId: string; pageId: string; blockId: string }> },
) {
  try {
    const { bookId, pageId, blockId } = await ctx.params;
    await requirePermission(bookId, "write");
    const block = await getStorageDriver().duplicateBlock(bookId, pageId, blockId);
    return json({ block }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
