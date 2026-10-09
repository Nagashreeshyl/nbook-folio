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
import { isValidPin, pinMatchesHash, roleFromPin } from "@/lib/access/keys";
import { colorForSession } from "@/lib/access/presence";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody, unauthorized } from "@/lib/api/http";
import type { Role } from "@/types/models";

export const runtime = "nodejs";

const pinSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  pin: z.string().trim().regex(/^\d{4,5}$/, "PIN must be 4 or 5 digits."),
  displayName: z.string().trim().min(1).max(40).optional(),
});

/**
 * Exchanges a share PIN for a signed session cookie.
 *
 *  - A 4-digit PIN that matches the book's read PIN → viewer session.
 *  - A 5-digit PIN that matches the book's edit PIN → editor session.
 *
 * Only the SHA-256 hash of each PIN is compared; the digits are never stored.
 * Rate-limited per slug exactly like the access-key endpoint, because a PIN is
 * far lower entropy than a key.
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, pinSchema);
    await enforceAccessRateLimit(`pin:${input.slug}`);

    if (!isValidPin(input.pin)) {
      throw unauthorized("That PIN is not valid.");
    }

    const driver = getStorageDriver();
    const book = await driver.getBookBySlug(input.slug);
    if (!book) throw unauthorized("No notebook found with that link.");

    // The digit count decides which role the author intended, then the hash
    // must match the PIN stored for exactly that role. A 4-digit PIN can never
    // unlock editing even if it happened to equal the edit PIN's prefix.
    const intendedRole = roleFromPin(input.pin);
    const storedHash =
      intendedRole === "editor" ? book.editPinHash : book.readPinHash;

    if (!intendedRole || !pinMatchesHash(input.pin, storedHash)) {
      throw unauthorized("That PIN is not valid for this notebook.");
    }

    const role: Role = intendedRole;
    const displayName = input.displayName?.trim() || newDisplayName();
    const sessionId = newSessionId();
    const token = createSessionToken({
      bookId: book.id,
      // PIN sessions are not tied to an access-key record.
      keyId: `pin:${role}`,
      role,
      sessionId,
      displayName,
    });

    await driver.setPresence(book.id, {
      sessionId,
      name: displayName,
      role,
      pageId: null,
      color: colorForSession(sessionId),
      updatedAt: Date.now(),
    });

    const store = await cookies();
    store.set(sessionCookieName(book.id), token, sessionCookieOptions());

    return json({
      book: { id: book.id, slug: book.slug, name: book.name },
      role,
      sessionId,
      displayName,
    });
  } catch (error) {
    return handleError(error);
  }
}
