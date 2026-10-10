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

/**
 * Bridges the tldraw store with the block's persisted snapshot.
 *
 * Subscribes exactly once per editor and routes saves through a ref, so a
 * parent re-render (autosave / realtime upsert) never re-subscribes or tears
 * the listener down — that churn is what blanked the canvas mid-session.
 */
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

  useEffect(() => {
    if (!editor || !editable) return;
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
        }, 800);
      },
      { source: "user", scope: "document" },
    );
    return () => {
      stop();
      if (timer.current) clearTimeout(timer.current);
    };
    // Intentionally only `editor` + `editable`: `onChange` is read via a ref so
    // its changing identity never re-subscribes the store listener.
  }, [editor, editable]);

  return null;
}

export default function TldrawCanvas({ snapshot, editable, onChange }: Props) {
  // Capture the initial snapshot once; tldraw is uncontrolled afterwards.
  const initial = useRef(
    snapshot?.store ? (snapshot.store as unknown as TLEditorSnapshot) : undefined,
  );

  return (
    // tldraw renders its own full-size `.tl-container` (absolute, inset:0) into
    // this element, so it must be positioned and sized — the parent gives it a
    // fixed height.
    <div className="tl-embed-root relative h-full w-full">
      <Tldraw
        snapshot={initial.current}
        onMount={(editor: Editor) => {
          if (!editable) editor.updateInstanceState({ isReadonly: true });
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
