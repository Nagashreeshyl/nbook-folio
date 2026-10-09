import { z } from "zod";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(5_000),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ bookId: string; pageId: string }> },
) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requirePermission(bookId, "write");
    const { orderedIds } = await parseBody(request, reorderSchema);
    const blocks = await getStorageDriver().reorderBlocks(bookId, pageId, orderedIds);
    return json({ blocks });
  } catch (error) {
    return handleError(error);
  }
}
