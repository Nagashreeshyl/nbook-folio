"use client";

import { useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { CanvasSnapshot } from "@/types/models";

interface Props {
  snapshot: CanvasSnapshot | null;
  editable: boolean;
  onChange?: (next: CanvasSnapshot | null) => void;
}

/**
 * Excalidraw canvas surface.
 *
 * Excalidraw is MIT-licensed and fully free in production (no license key, no
 * teardown) — unlike tldraw 4.x, whose production license check blanked the
 * embedded editor on the deployed domain.
 *
 * The persisted snapshot stores Excalidraw's `{elements, appState, files}`
 * under `snapshot.store`, matching the existing CanvasSnapshot shape so no
 * data migration is needed. appState is trimmed to the serialisable bits.
 */
export default function TldrawCanvas({ snapshot, editable, onChange }: Props) {
  const latest = useRef<Props["onChange"]>(onChange);
  latest.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const store = (snapshot?.store ?? null) as {
    elements?: unknown;
    appState?: Record<string, unknown>;
    files?: unknown;
  } | null;

  const initialData = store?.elements
    ? {
        elements: store.elements as never,
        appState: {
          ...(store.appState ?? {}),
          // Never persist/collapse to a zero viewport.
          collaborators: new Map(),
        } as never,
        files: (store.files ?? {}) as never,
        scrollToContent: true,
      }
    : undefined;

  return (
    <div className="excalidraw-embed h-full w-full">
      <Excalidraw
        initialData={initialData}
        viewModeEnabled={!editable}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange={(elements: any, appState: any, files: any) => {
          if (!editable || !latest.current) return;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            try {
              // Strip transient/huge fields; keep what redraws the scene.
              const slimAppState = {
                viewBackgroundColor: appState?.viewBackgroundColor,
                gridSize: appState?.gridSize ?? null,
              };
              latest.current?.({
                schemaVersion: 2,
                store: {
                  elements,
                  appState: slimAppState,
                  files: files ?? {},
                } as unknown as Record<string, unknown>,
              });
            } catch {
              /* ignore a serialise failure for this frame */
            }
          }, 800);
        }}
      />
    </div>
  );
}
