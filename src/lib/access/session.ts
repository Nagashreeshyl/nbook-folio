import { cookies, headers } from "next/headers";
import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import type { Permission, Role } from "@/types/models";
import { can, signSession, verifySession, type SessionPayload } from "./keys";
import { forbidden, tooMany, unauthorized } from "@/lib/api/http";

/**
 * Sessions are stored in one cookie per notebook, so several notebooks can be
 * open in different tabs without overwriting each other's credentials.
 */
export const SESSION_COOKIE_PREFIX = "nbook_session_";

export function sessionCookieName(bookId: string): string {
  return SESSION_COOKIE_PREFIX + bookId.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Session lifetime. Long enough for a study session, short enough to expire. */
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function getSessionSecret(): string {
  const secret =
    process.env.SESSION_SECRET ??
    process.env.FIREBASE_SERVICE_ACCOUNT?.slice(0, 32) ??
    process.env.NBOOK_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production.");
  }
  return "nbook-development-secret-do-not-use-in-production";
}

export function newSessionId(): string {
  return randomBytes(9).toString("hex");
}

export function newDisplayName(): string {
  const adjectives = ["Amber", "Cedar", "Frost", "Ink", "Juniper", "Slate", "Umber", "Vellum"];
  const nouns = ["Scribe", "Scholar", "Reader", "Clerk", "Archivist", "Quill"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  return `${a} ${n}`;
}

export function createSessionToken(payload: {
  bookId: string;
  keyId: string;
  role: Role;
  sessionId: string;
  displayName: string;
}): string {
  return signSession(payload, getSessionSecret(), SESSION_TTL_SECONDS);
}

/** Returns the first valid session cookie, if any (used for diagnostics). */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (!cookie.name.startsWith(SESSION_COOKIE_PREFIX)) continue;
    const session = await verifySession(cookie.value, getSessionSecret());
    if (session) return session;
  }
  return null;
}

/** Sessions are scoped to a single notebook. */
export async function readSessionForBook(bookId: string): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(sessionCookieName(bookId))?.value;
  if (!token) return null;
  return verifySession(token, getSessionSecret());
}

export async function requireSessionForBook(bookId: string): Promise<SessionPayload> {
  const session = await readSessionForBook(bookId);
  if (!session) throw unauthorized("Enter a valid access key for this notebook.");
  // Defence in depth: the cookie name already embeds the book id, but the
  // signed payload must agree — never trust one without the other.
  if (session.bookId !== bookId) {
    throw unauthorized("Enter a valid access key for this notebook.");
  }
  return session;
}

export async function requirePermission(
  bookId: string,
  permission: Permission,
): Promise<SessionPayload> {
  const session = await requireSessionForBook(bookId);
  if (!can(session.role, permission)) {
    throw forbidden(
      permission === "write"
        ? "Your access key does not allow editing this notebook."
        : permission === "manage"
          ? "Only the notebook owner can do that."
          : "You do not have access to this notebook.",
    );
  }
  return session;
}

/* ------------------------------------------------------------------ */
/* Abuse protection for the access-key endpoint                        */
/* ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

/**
 * Sliding-window limiter for access-key attempts, keyed by client + slug.
 * Deliberately in-memory: this protects against trivial scripted abuse, not
 * a distributed attack (the platform WAF / rate limiter covers that layer).
 */
export async function enforceAccessRateLimit(scope: string): Promise<void> {
  const store = await headers();
  const ip =
    store.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    store.get("x-real-ip") ??
    "unknown";
  const key = `${ip}:${scope}`;
  const now = Date.now();
  // Prune on every attempt: the bucket below returns early when it creates a
  // fresh one, so pruning only on the "already counting" path never ran for an
  // attacker cycling new slugs and the map grew without bound.
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    throw tooMany();
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearCookieOptions() {
  return { ...sessionCookieOptions(), maxAge: 0 };
}

export function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && "status" in error && error.status === 429;
}

/** Convenience for route handlers that need the raw NextRequest. */
export function requestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? randomBytes(4).toString("hex");
}

export type { SessionPayload };
