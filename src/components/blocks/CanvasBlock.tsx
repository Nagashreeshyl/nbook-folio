"use client";

import dynamic from "next/dynamic";
import { memo, useRef } from "react";
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
  snapshot: CanvasSnapshot | null;
  height?: number;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}

/**
 * Re-render firewall around tldraw.
 *
 * The editor owns its own state once mounted, so re-renders caused by autosave
 * or the realtime stream (which replace the block object every time the canvas
 * saves) must NOT flow into tldraw — a changing snapshot/onChange prop made the
 * embedded editor thrash and blank out. We therefore:
 *   - capture the *initial* snapshot once (ref) and never change it,
 *   - route onChange through a ref so its identity is always stable,
 *   - memo() the component so parent re-renders are a no-op.
 */
function CanvasBlockInner({ snapshot, height = 420, editable, onChange }: CanvasBlockProps) {
  const initialSnapshot = useRef(snapshot);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  return (
    <div
      className="tldraw-embed relative rounded-lg border border-rule overflow-hidden bg-sheet isolate"
      style={{ height: Math.max(height, editable ? 420 : 260) }}
    >
      <TldrawCanvas
        snapshot={initialSnapshot.current}
        editable={editable}
        onChange={(next) => onChangeRef.current?.(next)}
      />
    </div>
  );
}

/**
 * Only re-render when the mode flips (read ⇄ edit). The snapshot/onChange are
 * deliberately excluded: tldraw is uncontrolled after mount.
 */
export const CanvasBlock = memo(CanvasBlockInner, (prev, next) => prev.editable === next.editable);
