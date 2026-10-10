"use client";

import { useEffect, useRef } from "react";
import {
  Tldraw,
  getSnapshot,
  useEditor,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import type { CanvasSnapshot } from "@/types/models";

interface Props {
  snapshot: CanvasSnapshot | null;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}

/** Bridges the tldraw store with the block's persisted snapshot. */
function CanvasSync({
  editable,
  onChange,
}: {
  editable: boolean;
  onChange?: Props["onChange"];
}) {
  const editor = useEditor();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Props["onChange"]>(onChange);
  latest.current = onChange;

  // Persist edits (debounced) back to the block. Only user-originated changes
  // save, so programmatic loads never echo back as a write.
  useEffect(() => {
    if (!editor || !editable || !onChange) return;
    const stop = editor.store.listen(
      () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          try {
            const next = getSnapshot(editor.store);
            latest.current?.({
              schemaVersion: 1,
              store: next as unknown as Record<string, unknown>,
            });
          } catch {
            /* editor torn down mid-write */
          }
        }, 600);
      },
      { source: "user", scope: "document" },
    );
    return () => {
      stop();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, editable, onChange]);

  return null;
}

export default function TldrawCanvas({ snapshot, editable, onChange }: Props) {
  return (
    // tldraw renders its own full-size `.tl-container` (position:absolute,
    // inset:0) into this element, which must therefore be positioned and sized.
    // The parent CanvasBlock gives it a fixed height; `h-full w-full relative`
    // here lets tldraw measure a real viewport so its toolbars dock correctly.
    <div className="tl-embed-root relative h-full w-full">
      <Tldraw
        // Hydrate from the saved snapshot at construction time — the supported
        // way to restore a document produced by getSnapshot(). Loading inside
        // an effect raced tldraw's own first paint and left the UI mislaid.
        snapshot={
          snapshot?.store
            ? (snapshot.store as unknown as TLEditorSnapshot)
            : undefined
        }
        onMount={(editor: Editor) => {
          if (!editable) {
            editor.updateInstanceState({ isReadonly: true });
          }
          // Fit any restored content once layout has settled; guard so an
          // empty canvas (no shapes) is left at the default camera.
          requestAnimationFrame(() => {
            try {
              if (editor.getCurrentPageShapeIds().size > 0) editor.zoomToFit();
            } catch {
              /* editor already unmounted */
            }
          });
        }}
      >
        <CanvasSync editable={editable} onChange={onChange} />
      </Tldraw>
    </div>
  );
}
