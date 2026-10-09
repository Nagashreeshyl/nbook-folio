import { z } from "zod";
import { requirePermission, requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, notFound, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requireSessionForBook(bookId);
    const book = await getStorageDriver().getBook(bookId);
    if (!book) throw notFound("Notebook not found.");
    return json({ book });
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  cover: z.string().max(2048).nullable().optional(),
  settings: z
    .object({
      // "flip" is the pre-V1 name for "realistic"; accepted, then normalised.
      pageAnimation: z
        .enum(["none", "subtle", "realistic", "flip"])
        .transform((value) => (value === "flip" ? "realistic" : value))
        .optional(),
      pageSound: z.boolean().optional(),
      allowExport: z.boolean().optional(),
      allowViewerSearch: z.boolean().optional(),
      allowViewerCopy: z.boolean().optional(),
      allowStorage: z.boolean().optional(),
      theme: z.enum(["eggshell", "parchment", "dark"]).optional(),
      language: z.string().max(20).optional(),
      direction: z.enum(["auto", "ltr", "rtl"]).optional(),
      fontScale: z.enum(["small", "medium", "large"]).optional(),
    })
    .optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "manage");
    const patch = await parseBody(request, patchSchema);
    const book = await getStorageDriver().updateBook(bookId, patch);
    return json({ book });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "manage");
    await getStorageDriver().deleteBook(bookId);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
