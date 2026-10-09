"use client";

import dynamic from "next/dynamic";
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

export function CanvasBlock({
  snapshot,
  height = 420,
  editable,
  onChange,
}: {
  snapshot: CanvasSnapshot | null;
  height?: number;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}) {
  // tldraw positions its toolbars/menus with `position: absolute` against the
  // nearest positioned ancestor, so the wrapper MUST be `relative` and have a
  // real height — otherwise the panels float out of the box (the bug in the
  // screenshot). A sensible minimum keeps the editor usable on a short block.
  return (
    <div
      className="tldraw-embed relative rounded-lg border border-rule overflow-hidden bg-sheet"
      style={{ height: Math.max(height, editable ? 420 : 260) }}
    >
      <TldrawCanvas snapshot={snapshot} editable={editable} onChange={onChange} />
    </div>
  );
}
