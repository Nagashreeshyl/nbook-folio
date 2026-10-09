"use client";

import { useEffect, useRef } from "react";
import { Tldraw, useEditor, type TLEditorSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import type { CanvasSnapshot } from "@/types/models";

interface Props {
  snapshot: CanvasSnapshot | null;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}

/** Bridges the tldraw store with the block's persisted snapshot. */
function CanvasSync({ editable, onChange }: { editable: boolean; onChange?: Props["onChange"] }) {
  const editor = useEditor();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Props["onChange"]>(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!editor || !editable || !onChange) return;
    const stop = editor.store.listen(
      () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          try {
            const next = editor.getSnapshot();
            latest.current?.({ schemaVersion: 1, store: next as unknown as Record<string, unknown> });
          } catch {
            /* editor torn down mid-write */
          }
        }, 500);
      },
      { source: "all", scope: "document" },
    );
    return () => {
      stop();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, editable, onChange]);

  return null;
}

export default function TldrawCanvas({ snapshot, editable, onChange }: Props) {
  const starting =
    snapshot && snapshot.store ? (snapshot.store as unknown as TLEditorSnapshot) : undefined;

  return (
    <Tldraw
      snapshot={starting}
      onMount={(instance) => {
        if (!editable) instance.updateInstanceState({ isReadonly: true });
      }}
    >
      <CanvasSync editable={editable} onChange={onChange} />
    </Tldraw>
  );
}
