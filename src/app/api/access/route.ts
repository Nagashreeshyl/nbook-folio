import { z } from "zod";
import { cookies } from "next/headers";
import {
  enforceAccessRateLimit,
  createSessionToken,
  newDisplayName,
  newSessionId,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/access/session";
import { hashAccessKey, isWellFormedAccessKey, roleFromAccessKey } from "@/lib/access/keys";
import { colorForSession } from "@/lib/access/presence";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody, unauthorized } from "@/lib/api/http";

export const runtime = "nodejs";

const unlockSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  key: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(40).optional(),
});

/**
 * Exchanges an access key for a short-lived, signed session cookie.
 *
 * Only the SHA-256 hash of the key is compared — plaintext keys are never
 * stored server-side.
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, unlockSchema);
    await enforceAccessRateLimit(input.slug);

    const driver = getStorageDriver();
    const book = await driver.getBookBySlug(input.slug);
    if (!book) throw unauthorized("No notebook found with that link.");

    if (!isWellFormedAccessKey(input.key)) {
      throw unauthorized("That access key is not valid.");
    }
    const expectedRole = roleFromAccessKey(input.key);
    const record = await driver.findActiveKeyByHash(book.id, hashAccessKey(input.key));
    if (!record) throw unauthorized("That access key is not valid or has been revoked.");

    // Defensive: prefix role must match the stored role.
    if (expectedRole && expectedRole !== record.role) {
      throw unauthorized("That access key is not valid.");
    }

    // One name for cookie *and* presence: two separate newDisplayName() calls
    // made collaborators watch your name change on the first heartbeat.
    const displayName = input.displayName?.trim() || newDisplayName();
    const sessionId = newSessionId();
    const token = createSessionToken({
      bookId: book.id,
      keyId: record.id,
      role: record.role,
      sessionId,
      displayName,
    });

    await driver.touchAccessKey(book.id, record.id);
    await driver.setPresence(book.id, {
      sessionId,
      name: displayName,
      role: record.role,
      pageId: null,
      color: colorForSession(sessionId),
      updatedAt: Date.now(),
    });

    const store = await cookies();
    store.set(sessionCookieName(book.id), token, sessionCookieOptions());

    return json({
      book: { id: book.id, slug: book.slug, name: book.name },
      role: record.role,
      sessionId,
      displayName,
    });
  } catch (error) {
    return handleError(error);
  }
}

