import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, badRequest } from "@/lib/api/http";

export const runtime = "nodejs";

/**
 * Revokes an access key.
 *
 * Revocation is enforced where sessions are minted: a revoked key can no longer
 * be exchanged for a cookie (`findActiveKeyByHash` filters revoked keys), so a
 * fresh unlock fails immediately. Sessions signed *before* revocation keep
 * working until their 12-hour expiry — the cookie is a stateless HMAC with no
 * server-side handle to invalidate. This trade-off is documented in AGENTS.md
 * §6 and covered by `e2e/share.spec.ts`.
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ bookId: string; keyId: string }> },
) {
  try {
    const { bookId, keyId } = await ctx.params;
    await requirePermission(bookId, "manage");
    const driver = getStorageDriver();
    // The owner key is the only way back in and `POST /keys` never mints a
    // replacement — revoking it would permanently lock the notebook out of
    // manage rights. Enforced here, not just hidden in the UI.
    const keys = await driver.listAccessKeys(bookId);
    const target = keys.find((key) => key.id === keyId);
    if (target?.role === "owner") {
      throw badRequest("The owner key cannot be revoked.", "owner_key_immutable");
    }
    const key = await driver.revokeAccessKey(bookId, keyId);
    const { keyHash: _keyHash, ...safe } = key;
    return json({ key: safe });
  } catch (error) {
    return handleError(error);
  }
}
