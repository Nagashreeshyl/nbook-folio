import { z } from "zod";
import { presenceFromSession } from "@/lib/access/presence";
import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

/** Collaborator heartbeat. Also reports which page the session is viewing. */
export async function POST(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    const input = await parseBody(
      request,
      z.object({ pageId: z.string().min(1).nullable().optional() }),
    );
    await getStorageDriver().setPresence(
      bookId,
      presenceFromSession(session, input.pageId ?? null),
    );
    const presence = await getStorageDriver().listPresence(bookId);
    return json({ presence });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    await requireSessionForBook(bookId);
    const presence = await getStorageDriver().listPresence(bookId);
    return json({ presence });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * "I'm gone" — called when a tab unmounts. Without it the entry lingers for
 * the full TTL, because a heartbeat POST would *refresh* `updatedAt` instead
 * of removing the session.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    await getStorageDriver().clearPresence(bookId, session.sessionId);
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
