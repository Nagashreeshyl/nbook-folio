import { z } from "zod";
import { requirePermission, requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { contentSchemaFor, defaultContentFor } from "@/lib/blocks/schema";
import { handleError, json, parseBody } from "@/lib/api/http";
import { BLOCK_TYPES, type BlockType } from "@/types/models";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ bookId: string; pageId: string }> };

const createSchema = z.object({
  type: z.enum(BLOCK_TYPES as unknown as [BlockType, ...BlockType[]]),
  content: z.unknown().optional(),
  afterBlockId: z.string().min(1).optional(),
  index: z.number().int().min(0).max(10_000).optional(),
});

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId } = await ctx.params;
    await requireSessionForBook(bookId);
    const blocks = await getStorageDriver().listBlocks(bookId, pageId);
    return json({ blocks });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { bookId, pageId } = await ctx.params;
    const session = await requirePermission(bookId, "write");
    const input = await parseBody(request, createSchema);

    const content =
      input.content === undefined || input.content === null
        ? defaultContentFor(input.type)
        : contentSchemaFor(input.type).parse(input.content);

    const block = await getStorageDriver().createBlock(bookId, pageId, {
      type: input.type,
      content: content as never,
      ...(input.afterBlockId ? { afterBlockId: input.afterBlockId } : {}),
      ...(typeof input.index === "number" ? { index: input.index } : {}),
    });
    return json({ block, sessionId: session.sessionId }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
