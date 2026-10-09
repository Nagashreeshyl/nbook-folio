import type { PresenceEntry, Role } from "@/types/models";

const PALETTE = ["#8c4f10", "#00262a", "#1e2229", "#7a2f12", "#3b4b21", "#4a2d6b", "#8a3324"];

/** Stable, non-identifying colour derived from the anonymous session id. */
export function colorForSession(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function presenceFromSession(
  session: { sessionId: string; displayName: string; role: Role },
  pageId: string | null,
): PresenceEntry {
  return {
    sessionId: session.sessionId,
    name: session.displayName,
    role: session.role,
    pageId,
    color: colorForSession(session.sessionId),
    updatedAt: Date.now(),
  };
}
