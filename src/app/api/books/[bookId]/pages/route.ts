import { z } from "zod";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "write");
    const input = await parseBody(
      request,
      z.object({
        chapterId: z.string().min(1),
        title: z.string().trim().max(300).optional().default(""),
      }),
    );
    const page = await getStorageDriver().createPage(bookId, input.chapterId, {
      title: input.title || "Untitled page",
    });
    return json({ page }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

const reorderSchema = z.object({
  chapterId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1).max(1000),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "write");
    const input = await parseBody(request, reorderSchema);
    const pages = await getStorageDriver().reorderPages(
      bookId,
      input.chapterId,
      input.orderedIds,
    );
    return json({ pages });
  } catch (error) {
    return handleError(error);
  }
}
