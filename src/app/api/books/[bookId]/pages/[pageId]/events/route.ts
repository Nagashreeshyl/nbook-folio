import { requireSessionForBook } from "@/lib/access/session";
import { presenceFromSession } from "@/lib/access/presence";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, notFound } from "@/lib/api/http";
import type { PageRealtimeEvent } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

/**
 * Server-Sent Events stream for a single page's blocks.
 *
 * Subscribing per page (not per notebook) keeps keystroke traffic scoped to
 * the leaf that is actually open.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ bookId: string; pageId: string }> },
) {
  const live: { unsub?: () => void; timer?: ReturnType<typeof setInterval> } = {};
  try {
    const { bookId, pageId } = await ctx.params;
    await requireSessionForBook(bookId);
    // Streams are keyed by pageId only — prove the page belongs to *this*
    // notebook before wiring a subscriber to it.
    const page = await getStorageDriver().getPage(bookId, pageId);
    if (!page) throw notFound("Page not found.");

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: PageRealtimeEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            /* closed */
          }
        };
        controller.enqueue(encoder.encode(`: connected\n\n`));
        live.unsub = getStorageDriver().subscribePage(bookId, pageId, send);
        live.timer = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            /* ignore */
          }
        }, HEARTBEAT_MS);

        request.signal.addEventListener("abort", () => {
          if (live.timer) clearInterval(live.timer);
          live.unsub?.();
          try {
            controller.close();
          } catch {
            /* ignore */
          }
        });
      },
      cancel() {
        if (live.timer) clearInterval(live.timer);
        live.unsub?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (live.timer) clearInterval(live.timer);
    live.unsub?.();
    return handleError(error);
  }
}

/** Endpoint used by the client to signal "I am still on this page". */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ bookId: string; pageId: string }> },
) {
  try {
    const { bookId, pageId } = await ctx.params;
    const session = await requireSessionForBook(bookId);
    await getStorageDriver().setPresence(bookId, presenceFromSession(session, pageId));
    return json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
