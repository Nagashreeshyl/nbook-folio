import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Permission, Role } from "@/types/models";
import { ROLE_PERMISSIONS } from "@/types/models";

const KEY_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no ambiguous chars

/** Human-typable random token, high entropy (30 chars ≈ 150 bits). */
function randomKeyString(length = 30): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += KEY_ALPHABET[bytes[i]! % KEY_ALPHABET.length];
  }
  return out;
}

const ROLE_PREFIX: Record<Role, string> = {
  owner: "nbkown",
  editor: "nbkedt",
  viewer: "nbkview",
};

/** e.g. `nbkown_3f9k2...` — shown once to the creator. */
export function generateAccessKey(role: Role): string {
  return `${ROLE_PREFIX[role]}_${randomKeyString(30)}`;
}

/** SHA-256 hex. Key material only ever exists transiently in memory. */
export function hashAccessKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function isWellFormedAccessKey(plaintext: string): boolean {
  return /^(nbkown|nbkedt|nbkview)_[a-z0-9]{20,64}$/.test(plaintext.trim());
}

export function roleFromAccessKey(plaintext: string): Role | null {
  const value = plaintext.trim();
  if (value.startsWith("nbkown_")) return "owner";
  if (value.startsWith("nbkedt_")) return "editor";
  if (value.startsWith("nbkview_")) return "viewer";
  return null;
}

/* ------------------------------------------------------------------ */
/* Session tokens                                                      */
/* ------------------------------------------------------------------ */

export interface SessionPayload {
  bookId: string;
  keyId: string;
  role: Role;
  sessionId: string;
  displayName: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function signSession(
  payload: Omit<SessionPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds = 60 * 60 * 12,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: SessionPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const body = b64url(JSON.stringify(full));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = b64url(createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (!payload.bookId || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Rank used for "at least" comparisons. */
const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function can(role: Role, permission: Permission): boolean {
  return hasPermission(role, permission);
}
