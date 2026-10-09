import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json } from "@/lib/api/http";
import type { BookRealtimeEvent } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 20_000;

/**
 * Server-Sent Events stream for notebook structure changes.
 *
 * Clients stay subscribed to a single stream per open notebook and receive
 * granular upsert/delete events (never the whole document tree).
 */
export async function GET(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  const live: { unsub?: () => void; timer?: ReturnType<typeof setInterval> } = {};
  try {
    const { bookId } = await ctx.params;
    await requireSessionForBook(bookId);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: BookRealtimeEvent) => {
          try {
            // Never leak PIN hashes to the browser: redact them from the book
            // payload and expose only whether each PIN is set.
            let safe: BookRealtimeEvent = event;
            if (event.type === "book") {
              const { readPinHash, editPinHash, ...rest } = event.book as typeof event.book & {
                readPinHash?: string | null;
                editPinHash?: string | null;
              };
              safe = {
                ...event,
                book: {
                  ...rest,
                  hasReadPin: Boolean(readPinHash),
                  hasEditPin: Boolean(editPinHash),
                } as typeof event.book,
              };
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(safe)}\n\n`));
          } catch {
            /* stream already closed */
          }
        };

        controller.enqueue(encoder.encode(`: connected\n\n`));
        live.unsub = getStorageDriver().subscribeBook(bookId, send);
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
    const response = handleError(error);
    if (response.status === 404) return json({ error: "Not found" }, { status: 404 });
    return response;
  }
}
