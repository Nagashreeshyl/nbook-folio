"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, subscribe } from "@/lib/api/client";
import type { PageRealtimeEvent } from "@/lib/storage";
import type { Block, BlockContentByType, BlockType, Page } from "@/types/models";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
export type PageBlocksStatus = "loading" | "ready" | "error";

interface PageResponse {
  page: Page;
  blocks: Block[];
}

const AUTOSAVE_DELAY_MS = 400;

interface PendingWrite {
  content: Block["content"];
  baseRev: number;
  attempt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface PageBlocksApi {
  status: PageBlocksStatus;
  page: Page | null;
  blocks: Block[];
  saveState: SaveState;
  savedAt: number | null;
  error: string | null;
  reload: () => Promise<void>;
  retryFailedWrites: () => void;
  updateBlock: (blockId: string, content: BlockContentByType[BlockType]) => void;
  createBlock: (type: BlockType, afterBlockId?: string) => Promise<Block | null>;
  deleteBlock: (blockId: string) => Promise<void>;
  duplicateBlock: (blockId: string) => Promise<Block | undefined>;
  reorderBlocks: (orderedIds: string[]) => Promise<void>;
  renamePage: (title: string) => Promise<void>;
}

export function usePageBlocks(
  bookId: string | null,
  pageId: string | null,
  options: { enabled?: boolean } = {},
): PageBlocksApi {
  const enabled = options.enabled ?? true;
  const [status, setStatus] = useState<PageBlocksStatus>("loading");
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef(new Map<string, PendingWrite>());
  const inFlight = useRef(new Set<string>());
  const revs = useRef(new Map<string, number>());
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!bookId || !pageId) return;
    try {
      const data = await apiRequest<PageResponse>(`/api/books/${bookId}/pages/${pageId}`);
      if (!live.current) return;
      setPage(data.page);
      setBlocks(data.blocks);
      for (const block of data.blocks) revs.current.set(block.id, block.rev);
      setStatus("ready");
    } catch (err) {
      if (!live.current) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Couldn't load this page.");
    }
  }, [bookId, pageId]);

  /** Re-apply queued content against the freshest known revision. */
  const flush = useCallback(
    async (blockId: string) => {
      if (!bookId || !pageId) return;
      if (inFlight.current.has(blockId)) return;
      const write = pending.current.get(blockId);
      if (!write) return;

      clearTimeout(write.timer);
      inFlight.current.add(blockId);
      setSaveState("saving");

      try {
        const { block } = await apiRequest<{ block: Block }>(
          `/api/books/${bookId}/pages/${pageId}/blocks/${blockId}`,
          { method: "PATCH", body: { content: write.content, baseRev: write.baseRev } },
        );
        revs.current.set(blockId, block.rev);

        const latest = pending.current.get(blockId);
        if (latest === write) {
          pending.current.delete(blockId);
        } else if (latest) {
          // Keystrokes arrived while this write was in flight — rebase them.
          latest.baseRev = block.rev;
          latest.timer = setTimeout(() => void flush(blockId), AUTOSAVE_DELAY_MS);
        }

        if (live.current) {
          setSaveState(pending.current.size > 0 ? "dirty" : "saved");
          setSavedAt(Date.now());
          setError(null);
        }
      } catch (err) {
        const code =
          err && typeof err === "object" && "status" in err
            ? (err as { status: number }).status
            : 0;

        if (code === 409 && write.attempt < 2) {
          // Revision moved on: load the server copy, then rebase our text.
          await reload();
          const latest = pending.current.get(blockId) ?? write;
          latest.baseRev = revs.current.get(blockId) ?? latest.baseRev;
          latest.attempt += 1;
          latest.timer = setTimeout(() => void flush(blockId), 150);
          pending.current.set(blockId, latest);
          if (live.current) {
            setSaveState("conflict");
            setError("This block changed elsewhere — your version was re-saved on top.");
          }
          return;
        }

        if (!live.current) return;

        if (code === 409) {
          // Gave up after two rebases; keep the server version.
          pending.current.delete(blockId);
          setSaveState("conflict");
          setError("This block changed elsewhere. Latest version loaded.");
          await reload();
          return;
        }

        if ((code === 0 || code >= 500) && write.attempt < 3) {
          const retry = pending.current.get(blockId) ?? write;
          retry.attempt += 1;
          retry.timer = setTimeout(() => void flush(blockId), 700 * retry.attempt);
          pending.current.set(blockId, retry);
          setSaveState("dirty");
          return;
        }

        setSaveState("error");
        setError(err instanceof Error ? err.message : "Couldn't save.");
      } finally {
        inFlight.current.delete(blockId);
      }
    },
    [bookId, pageId, reload],
  );

  useEffect(() => {
    if (!enabled || !bookId || !pageId) return;
    setStatus("loading");
    setSaveState("idle");
    setError(null);
    setPage(null);
    setBlocks([]);
    revs.current.clear();
    void reload();
  }, [enabled, bookId, pageId, reload]);

  // Page block stream — granular upserts only.
  useEffect(() => {
    if (!enabled || !bookId || !pageId) return;
    const stop = subscribe<PageRealtimeEvent>(
      `/api/books/${bookId}/pages/${pageId}/events`,
      (event) => {
        if (!live.current) return;
        if (event.type === "page" && event.action === "deleted") {
          setStatus("error");
          setError("This page was deleted.");
          return;
        }
        if (event.type !== "block") return;
        for (const item of event.items) {
          if (event.action === "upsert") revs.current.set(item.id, item.rev);
        }
        setBlocks((prev) => {
          if (event.action === "deleted") {
            return prev.filter((block) => !event.items.some((item) => item.id === block.id));
          }
          const map = new Map(prev.map((block) => [block.id, block]));
          for (const item of event.items) {
            // Never let the realtime echo overwrite a block the user is still
            // editing locally (a pending/in-flight write). Doing so replaces
            // the block object mid-edit — which, for the canvas, remounts the
            // tldraw subtree and blanks the editor. The local copy is the
            // source of truth until its own save settles.
            if (pending.current.has(item.id) || inFlight.current.has(item.id)) continue;
            map.set(item.id, item);
          }
          return [...map.values()].sort((a, b) => a.order - b.order);
        });
      },
    );
    return stop;
  }, [enabled, bookId, pageId]);

  const updateBlock = useCallback(
    (blockId: string, content: BlockContentByType[BlockType]) => {
      setBlocks((prev) =>
        prev.map((block) => (block.id === blockId ? { ...block, content } : block)),
      );
      setSaveState("dirty");

      const existing = pending.current.get(blockId);
      if (existing) clearTimeout(existing.timer);
      const baseRev = existing ? existing.baseRev : (revs.current.get(blockId) ?? 0);

      pending.current.set(blockId, {
        content,
        baseRev,
        attempt: 0,
        timer: setTimeout(() => void flush(blockId), AUTOSAVE_DELAY_MS),
      });
    },
    [flush],
  );

  const retryFailedWrites = useCallback(() => {
    for (const [blockId, write] of pending.current) {
      clearTimeout(write.timer);
      write.timer = setTimeout(() => void flush(blockId), 10);
    }
    setSaveState("dirty");
  }, [flush]);

  const createBlock = useCallback(
    async (type: BlockType, afterBlockId?: string) => {
      if (!bookId || !pageId) return null;
      try {
        const { block } = await apiRequest<{ block: Block }>(
          `/api/books/${bookId}/pages/${pageId}/blocks`,
          { method: "POST", body: { type, ...(afterBlockId ? { afterBlockId } : {}) } },
        );
        revs.current.set(block.id, block.rev);
        return block;
      } catch (err) {
        if (live.current) {
          setSaveState("error");
          setError(err instanceof Error ? err.message : "Couldn't add that block.");
        }
        return null;
      }
    },
    [bookId, pageId],
  );

  const deleteBlock = useCallback(
    async (blockId: string) => {
      if (!bookId || !pageId) return;
      const queued = pending.current.get(blockId);
      if (queued) {
        clearTimeout(queued.timer);
        pending.current.delete(blockId);
      }
      revs.current.delete(blockId);
      setBlocks((prev) => prev.filter((block) => block.id !== blockId));
      await apiRequest(`/api/books/${bookId}/pages/${pageId}/blocks/${blockId}`, {
        method: "DELETE",
      });
    },
    [bookId, pageId],
  );

  const duplicateBlock = useCallback(
    async (blockId: string) => {
      if (!bookId || !pageId) return;
      const { block } = await apiRequest<{ block: Block }>(
        `/api/books/${bookId}/pages/${pageId}/blocks/${blockId}/duplicate`,
        { method: "POST" },
      );
      revs.current.set(block.id, block.rev);
      return block;
    },
    [bookId, pageId],
  );

  const reorderBlocks = useCallback(
    async (orderedIds: string[]) => {
      if (!bookId || !pageId) return;
      const position = new Map(orderedIds.map((id, index) => [id, index]));
      setBlocks((prev) =>
        [...prev]
          .sort((a, b) => (position.get(a.id) ?? 1e9) - (position.get(b.id) ?? 1e9))
          .map((block, index) => ({ ...block, order: index })),
      );
      await apiRequest(`/api/books/${bookId}/pages/${pageId}/blocks/reorder`, {
        method: "PATCH",
        body: { orderedIds },
      });
    },
    [bookId, pageId],
  );

  const renamePage = useCallback(
    async (title: string) => {
      if (!bookId || !pageId) return;
      const { page: updated } = await apiRequest<{ page: Page }>(
        `/api/books/${bookId}/pages/${pageId}`,
        { method: "PATCH", body: { title } },
      );
      if (live.current) setPage(updated);
    },
    [bookId, pageId],
  );

  // Nothing may be stranded in memory when the page unmounts.
  useEffect(() => {
    const queued = pending.current;
    return () => {
      for (const [blockId, write] of queued) {
        clearTimeout(write.timer);
        write.timer = setTimeout(() => void flush(blockId), 0);
      }
    };
  }, [flush, pageId]);

  const sorted = useMemo(() => [...blocks].sort((a, b) => a.order - b.order), [blocks]);

  return {
    status,
    page,
    blocks: sorted,
    saveState,
    savedAt,
    error,
    reload,
    retryFailedWrites,
    updateBlock,
    createBlock,
    deleteBlock,
    duplicateBlock,
    reorderBlocks,
    renamePage,
  };
}
