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
    <div className="h-64 rounded-lg border border-rule bg-sheet-high grid place-items-center">
      <span className="material-symbols-outlined animate-pulse text-ink-faint text-[28px]">
        draw
      </span>
    </div>
  );
}

export function CanvasBlock({
  snapshot,
  height = 320,
  editable,
  onChange,
}: {
  snapshot: CanvasSnapshot | null;
  height?: number;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}) {
  return (
    <div className="rounded-lg border border-rule overflow-hidden bg-sheet" style={{ height }}>
      <TldrawCanvas snapshot={snapshot} editable={editable} onChange={onChange} />
    </div>
  );
}


