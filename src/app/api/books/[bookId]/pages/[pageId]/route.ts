import { z } from "zod";
import { requirePermission, requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, badRequest, notFound, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ bookId: string; pageId: string }> };

/** Page + its ordered blocks. The only payload needed to render a leaf. */
export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requireSessionForBook(bookId);
    const driver = getStorageDriver();
    const page = await driver.getPage(bookId, pageId);
    if (!page) throw notFound("Page not found.");
    const blocks = await driver.listBlocks(bookId, pageId);
    return json({ page, blocks });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requirePermission(bookId, "write");
    const patch = await parseBody(
      request,
      z.object({
        title: z.string().trim().max(300).optional(),
        chapterId: z.string().min(1).optional(),
      }),
    );
    if (patch.chapterId) {
      // createPage validates the chapter, move must too — otherwise a typo'd
      // or cross-notebook chapterId makes the page vanish from the tree.
      const chapters = await getStorageDriver().listChapters(bookId);
      if (!chapters.some((chapter) => chapter.id === patch.chapterId)) {
        throw badRequest("That chapter does not exist in this notebook.");
      }
    }
    const page = await getStorageDriver().updatePage(bookId, pageId, patch);
    return json({ page });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requirePermission(bookId, "write");
    await getStorageDriver().deletePage(bookId, pageId);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
