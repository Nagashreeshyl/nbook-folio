import { z } from "zod";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

/** Chapter structure follows the write permission (owner + editor). */
export async function POST(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "write");
    const input = await parseBody(
      request,
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(1000).optional().default(""),
      }),
    );
    const chapter = await getStorageDriver().createChapter(bookId, input);
    return json({ chapter }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "write");
    const { orderedIds } = await parseBody(request, reorderSchema);
    const chapters = await getStorageDriver().reorderChapters(bookId, orderedIds);
    return json({ chapters });
  } catch (error) {
    return handleError(error);
  }
}
