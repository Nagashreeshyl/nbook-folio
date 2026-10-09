"use client";

import { useEffect, useRef } from "react";
import {
  Tldraw,
  getSnapshot,
  loadSnapshot,
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
  snapshot,
  editable,
  onChange,
}: {
  snapshot: CanvasSnapshot | null;
  editable: boolean;
  onChange?: Props["onChange"];
}) {
  const editor = useEditor();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Props["onChange"]>(onChange);
  const loadedOnce = useRef(false);
  latest.current = onChange;

  // Load the persisted document once the editor exists. Using loadSnapshot is
  // the supported round-trip for a value produced by getSnapshot().
  useEffect(() => {
    if (!editor || loadedOnce.current) return;
    loadedOnce.current = true;
    if (snapshot?.store) {
      try {
        loadSnapshot(editor.store, snapshot.store as unknown as TLEditorSnapshot);
      } catch {
        /* an older/foreign snapshot shape — start blank rather than crash */
      }
    }
    if (!editable) editor.updateInstanceState({ isReadonly: true });
    // Fit the content into view so a saved drawing is visible immediately.
    editor.zoomToFit();
  }, [editor, snapshot, editable]);

  // Persist edits (debounced) back to the block.
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
        }, 500);
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
    // tldraw fills its positioned parent; `inset-0` makes it occupy the whole
    // CanvasBlock box so its toolbars dock to the box edges instead of floating.
    <div className="absolute inset-0">
      <Tldraw
        onMount={(instance: Editor) => {
          if (!editable) instance.updateInstanceState({ isReadonly: true });
        }}
      >
        <CanvasSync snapshot={snapshot} editable={editable} onChange={onChange} />
      </Tldraw>
    </div>
  );
}
