"use client";

import dynamic from "next/dynamic";
import { memo, useRef } from "react";
import { apiRequest } from "@/lib/api/client";
import type { CanvasSnapshot } from "@/types/models";

/**
 * tldraw is by far the heaviest dependency in the app, so both the read-only
 * preview and the editor are code-split out of the initial bundle.
 */
const TldrawCanvas = dynamic(() => import("./TldrawCanvas"), {
  ssr: false,
  loading: () => <CanvasSkeleton />,
});

function CanvasSkeleton() {
  return (
    <div className="h-[420px] rounded-lg border border-rule bg-sheet-high grid place-items-center">
      <span className="material-symbols-outlined animate-pulse text-ink-faint text-[28px]">
        draw
      </span>
    </div>
  );
}

interface CanvasBlockProps {
  bookId: string | null;
  pageId: string | null;
  blockId: string;
  initialRev: number;
  snapshot: CanvasSnapshot | null;
  height?: number;
  editable: boolean;
}

/**
 * Self-contained canvas editor.
 *
 * tldraw owns its state once mounted, and ANY re-render from the surrounding
 * block list (autosave state, realtime echoes, dnd-kit reordering) was tearing
 * the editor down and blanking it mid-session. So this block:
 *   - takes only primitive, stable props (ids, the initial snapshot, editable),
 *   - persists drawings by calling the blocks API *directly* from a ref-held
 *     callback — never through usePageBlocks/setBlocks, so a save can never
 *     re-render this subtree,
 *   - tracks its own `rev` locally (it is the sole writer of its own canvas),
 *   - is memo()'d so parent re-renders are a hard no-op (only an edit/read
 *     mode flip gets through).
 */
function CanvasBlockInner({
  bookId,
  pageId,
  blockId,
  initialRev,
  snapshot,
  height = 420,
  editable,
}: CanvasBlockProps) {
  const initialSnapshot = useRef(snapshot);
  const rev = useRef(initialRev);
  const saving = useRef(false);
  const queued = useRef<CanvasSnapshot | null>(null);

  // Persist directly to the blocks API, serialised so a save never overlaps.
  const save = useRef(async (next: CanvasSnapshot | null) => {
    if (!bookId || !pageId) return;
    if (saving.current) {
      queued.current = next;
      return;
    }
    saving.current = true;
    try {
      const { block } = await apiRequest<{ block: { rev: number } }>(
        `/api/books/${bookId}/pages/${pageId}/blocks/${blockId}`,
        {
          method: "PATCH",
          body: { content: { snapshot: next }, baseRev: rev.current },
        },
      );
      rev.current = block.rev;
    } catch {
      // Transient failures just drop this frame; the next stroke retries.
    } finally {
      saving.current = false;
      if (queued.current !== null) {
        const pending = queued.current;
        queued.current = null;
        void save.current(pending);
      }
    }
  });

  return (
    <div
      className="tldraw-embed relative rounded-lg border border-rule overflow-hidden bg-sheet isolate"
      style={{ height: Math.max(height, editable ? 420 : 260) }}
    >
      <TldrawCanvas
        snapshot={initialSnapshot.current}
        editable={editable}
        onChange={(next) => void save.current(next)}
      />
    </div>
  );
}

/** Only re-render when the mode flips. All other parent updates are ignored. */
export const CanvasBlock = memo(
  CanvasBlockInner,
  (prev, next) =>
    prev.editable === next.editable &&
    prev.blockId === next.blockId &&
    prev.bookId === next.bookId &&
    prev.pageId === next.pageId,
);
