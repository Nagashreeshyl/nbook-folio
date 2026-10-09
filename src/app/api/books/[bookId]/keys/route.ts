import { z } from "zod";
import { generateAccessKey, hashAccessKey } from "@/lib/access/keys";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

/** Owner-only: list access keys (hashes are never returned to the client). */
export async function GET(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "manage");
    const keys = await getStorageDriver().listAccessKeys(bookId);
    return json({
      keys: keys.map(({ keyHash: _keyHash, ...rest }) => rest),
    });
  } catch (error) {
    return handleError(error);
  }
}

const createSchema = z.object({
  role: z.enum(["editor", "viewer"]),
  label: z.string().trim().min(1).max(60).optional(),
});

/**
 * Creates an editor or viewer key.
 *
 * The plaintext value is returned exactly once — it cannot be recovered later
 * because only its hash is stored.
 */
export async function POST(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requirePermission(bookId, "manage");
    const input = await parseBody(request, createSchema);

    const plaintext = generateAccessKey(input.role);
    const record = await getStorageDriver().createAccessKey({
      bookId,
      role: input.role,
      label: input.label ?? `${input.role === "editor" ? "Editor" : "Viewer"} key`,
      keyHash: hashAccessKey(plaintext),
    });
    const { keyHash: _keyHash, ...safe } = record;
    return json({ key: safe, plaintext }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
