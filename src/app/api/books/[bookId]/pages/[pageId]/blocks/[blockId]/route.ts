import { z } from "zod";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { contentSchemaFor } from "@/lib/blocks/schema";
import { handleError, json, notFound, parseBody } from "@/lib/api/http";
import { StorageError } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ bookId: string; pageId: string; blockId: string }> };

const patchSchema = z.object({
  content: z.unknown(),
  /** Must match the stored revision — prevents silent last-write-wins. */
  baseRev: z.number().int().min(0),
});

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId, blockId } = await ctx.params;
    const session = await requirePermission(bookId, "write");
    const input = await parseBody(request, patchSchema);

    const driver = getStorageDriver();
    const existing = await driver.getBlock(bookId, pageId, blockId);
    if (!existing) throw notFound("Block not found.");

    const content = contentSchemaFor(existing.type).parse(input.content);
    const block = await driver.updateBlock(
      bookId,
      pageId,
      blockId,
      { content },
      input.baseRev,
      session.sessionId,
    );
    return json({ block });
  } catch (error) {
    if (error instanceof StorageError && error.code === "conflict") {
      return json(
        {
          error: "This block changed elsewhere. Reloading the latest version.",
          code: "conflict",
        },
        { status: 409 },
      );
    }
    return handleError(error);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId, blockId } = await ctx.params;
    await requirePermission(bookId, "write");
    await getStorageDriver().deleteBlock(bookId, pageId, blockId);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
