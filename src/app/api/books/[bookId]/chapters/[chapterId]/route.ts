import { z } from "zod";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, notFound, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ bookId: string; chapterId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { bookId, chapterId } = await ctx.params;
    await requirePermission(bookId, "write");
    const patch = await parseBody(
      request,
      z.object({
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(1000).optional(),
      }),
    );
    const chapter = await getStorageDriver().getChapter(bookId, chapterId);
    if (!chapter) throw notFound("Chapter not found.");
    const updated = await getStorageDriver().updateChapter(bookId, chapterId, patch);
    return json({ chapter: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { bookId, chapterId } = await ctx.params;
    await requirePermission(bookId, "write");
    await getStorageDriver().deleteChapter(bookId, chapterId);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
