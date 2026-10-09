import { z } from "zod";
import { requirePermission, requireSessionForBook } from "@/lib/access/session";
import { hashPin, isValidEditPin, isValidReadPin } from "@/lib/access/keys";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, notFound, parseBody, badRequest } from "@/lib/api/http";
import type { BookPatch } from "@/lib/storage";

export const runtime = "nodejs";

/** Strip PIN hashes before any book leaves the server. */
function safeBook<T extends { readPinHash?: string | null; editPinHash?: string | null }>(
  book: T,
): Omit<T, "readPinHash" | "editPinHash"> & { hasReadPin: boolean; hasEditPin: boolean } {
  const { readPinHash, editPinHash, ...rest } = book;
  return { ...rest, hasReadPin: Boolean(readPinHash), hasEditPin: Boolean(editPinHash) };
}

export async function GET(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requireSessionForBook(bookId);
    const book = await getStorageDriver().getBook(bookId);
    if (!book) throw notFound("Notebook not found.");
    return json({ book: safeBook(book) });
  } catch (error) {
    return handleError(error);
  }
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  cover: z.string().max(2048).nullable().optional(),
  /**
   * Share PINs as raw digits. A 4-digit read PIN and/or a 5-digit edit PIN,
   * hashed before storage. Pass an empty string or null to clear a PIN. The
   * two PINs must differ so a reader link can never also grant editing.
   */
  readPin: z.string().trim().nullable().optional(),
  editPin: z.string().trim().nullable().optional(),
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
    const input = await parseBody(request, patchSchema);

    const { readPin, editPin, ...rest } = input;
    const patch: BookPatch = { ...rest };

    // Resolve the final PIN values so we can enforce "the two must differ"
    // even when only one is being changed in this request.
    const current = await getStorageDriver().getBook(bookId);
    if (!current) throw notFound("Notebook not found.");

    if (readPin !== undefined) {
      if (readPin === null || readPin === "") {
        patch.readPinHash = null;
      } else if (!isValidReadPin(readPin)) {
        throw badRequest("The read PIN must be exactly 4 digits.");
      } else {
        patch.readPinHash = hashPin(readPin);
      }
    }
    if (editPin !== undefined) {
      if (editPin === null || editPin === "") {
        patch.editPinHash = null;
      } else if (!isValidEditPin(editPin)) {
        throw badRequest("The edit PIN must be exactly 5 digits.");
      } else {
        patch.editPinHash = hashPin(editPin);
      }
    }

    // Reject a read PIN whose digits equal the edit PIN (ignoring length):
    // a shared viewer link must never also unlock editing.
    const finalReadRaw = readPin && readPin !== "" ? readPin : null;
    const finalEditRaw = editPin && editPin !== "" ? editPin : null;
    if (finalReadRaw && finalEditRaw && finalReadRaw === finalEditRaw) {
      throw badRequest("The read PIN and edit PIN must be different.");
    }

    const book = await getStorageDriver().updateBook(bookId, patch);
    return json({ book: safeBook(book) });
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
