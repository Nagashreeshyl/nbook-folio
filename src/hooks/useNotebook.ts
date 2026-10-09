"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, subscribe } from "@/lib/api/client";
import type { BookRealtimeEvent as BookEvent } from "@/lib/storage";
import type { Book, Chapter, Page, PresenceEntry, Role } from "@/types/models";

export type NotebookStatus = "loading" | "ready" | "unauthorized" | "not-found" | "error";

interface TreeResponse {
  book: Book;
  chapters: Chapter[];
  pages: Page[];
  presence: PresenceEntry[];
  session: { role: Role };
}

export interface NotebookState {
  status: NotebookStatus;
  book: Book | null;
  chapters: Chapter[];
  pages: Page[];
  presence: PresenceEntry[];
  role: Role | null;
  error: string | null;
}

export interface NotebookApi extends NotebookState {
  /** Always the resolved notebook id, even before the tree loads. */
  bookId: string | null;
  can: (permission: "read" | "write" | "manage") => boolean;
  refresh: () => Promise<void>;
  patchBook: (patch: Record<string, unknown>) => Promise<void>;

  createChapter: (title: string) => Promise<Chapter>;
  renameChapter: (chapterId: string, title: string) => Promise<void>;
  deleteChapter: (chapterId: string) => Promise<void>;
  reorderChapters: (orderedIds: string[]) => Promise<void>;

  createPage: (chapterId: string, title?: string) => Promise<Page>;
  renamePage: (pageId: string, title: string) => Promise<void>;
  deletePage: (pageId: string) => Promise<void>;
  duplicatePage: (pageId: string) => Promise<Page>;
  reorderPages: (chapterId: string, orderedIds: string[]) => Promise<void>;

  pagesInChapter: (chapterId: string) => Page[];
  firstPageId: () => string | null;
}

const INITIAL: NotebookState = {
  status: "loading",
  book: null,
  chapters: [],
  pages: [],
  presence: [],
  role: null,
  error: null,
};

function upsertAll<T extends { id: string }>(list: T[], incoming: T[]): T[] {
  const byId = new Map(list.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

export function useNotebook(bookId: string | null): NotebookApi {
  const [state, setState] = useState<NotebookState>(INITIAL);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!bookId) return;
    try {
      const data = await apiRequest<TreeResponse>(`/api/books/${bookId}/tree`);
      if (!mounted.current) return;
      setState({
        status: "ready",
        book: data.book,
        chapters: data.chapters,
        pages: data.pages,
        presence: data.presence,
        role: data.session.role,
        error: null,
      });
    } catch (error) {
      if (!mounted.current) return;
      const status =
        error && typeof error === "object" && "status" in error
          ? (error as { status: number }).status
          : 500;
      setState((prev) => ({
        ...prev,
        status: status === 401 ? "unauthorized" : status === 404 ? "not-found" : "error",
        error: error instanceof Error ? error.message : "Something went wrong.",
      }));
    }
  }, [bookId]);

  useEffect(() => {
    if (!bookId) return;
    setState(INITIAL);
    void load();
  }, [bookId, load]);

  // Structure stream — granular upserts only, never a full tree replacement.
  useEffect(() => {
    if (!bookId) return;
    const stop = subscribe<BookEvent>(`/api/books/${bookId}/events`, (event) => {
      if (!mounted.current) return;
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        switch (event.type) {
          case "book":
            if (event.action === "deleted") {
              // Drivers can only report the id — putting that partial object
              // into state would crash every `book.settings` read downstream.
              return {
                ...prev,
                status: "not-found",
                book: null,
                error: "This notebook was deleted.",
              };
            }
            return { ...prev, book: event.book };
          case "chapter":
            return {
              ...prev,
              chapters:
                event.action === "deleted"
                  ? prev.chapters.filter((c) => !event.items.some((i) => i.id === c.id))
                  : upsertAll(prev.chapters, event.items),
            };
          case "page":
            return {
              ...prev,
              pages:
                event.action === "deleted"
                  ? prev.pages.filter((p) => !event.items.some((i) => i.id === p.id))
                  : upsertAll(prev.pages, event.items),
            };
          default:
            return prev;
        }
      });
    });
    return stop;
  }, [bookId]);

  const patch = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      options: { method?: "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
    ): Promise<T> =>
      apiRequest<T>(`/api/books/${bookId}${path}`, {
        method: options.method ?? "POST",
        ...(options.body === undefined ? {} : { body: options.body }),
      }),
    [bookId],
  );

  const api = useMemo<NotebookApi>(() => {
    const permission: Record<Role, Array<"read" | "write" | "manage">> = {
      viewer: ["read"],
      editor: ["read", "write"],
      owner: ["read", "write", "manage"],
    };

    return {
      ...state,
      bookId,
      can: (p) => (state.role ? permission[state.role].includes(p) : false),
      refresh: load,
      patchBook: async (next) => {
        await patch(`/`, { method: "PATCH", body: next });
        await load();
      },
      createChapter: async (title) => {
        const { chapter } = await patch<{ chapter: Chapter }>("/chapters", {
          body: { title },
        });
        return chapter;
      },
      renameChapter: async (chapterId, title) => {
        await patch(`/chapters/${chapterId}`, { method: "PATCH", body: { title } });
      },
      deleteChapter: async (chapterId) => {
        await patch(`/chapters/${chapterId}`, { method: "DELETE" });
      },
      reorderChapters: async (orderedIds) => {
        await patch("/chapters", { method: "PATCH", body: { orderedIds } });
      },
      createPage: async (chapterId, title = "") => {
        const { page } = await patch<{ page: Page }>("/pages", { body: { chapterId, title } });
        return page;
      },
      renamePage: async (pageId, title) => {
        await patch(`/pages/${pageId}`, { method: "PATCH", body: { title } });
      },
      deletePage: async (pageId) => {
        await patch(`/pages/${pageId}`, { method: "DELETE" });
      },
      duplicatePage: async (pageId) => {
        const { page } = await patch<{ page: Page }>(`/pages/${pageId}/duplicate`);
        return page;
      },
      reorderPages: async (chapterId, orderedIds) => {
        await patch("/pages", { method: "PATCH", body: { chapterId, orderedIds } });
      },
      pagesInChapter: (chapterId) =>
        state.pages
          .filter((page) => page.chapterId === chapterId)
          .sort((a, b) => a.order - b.order),
      firstPageId: () => {
        const sortedChapters = [...state.chapters].sort((a, b) => a.order - b.order);
        for (const chapter of sortedChapters) {
          const pages = state.pages
            .filter((page) => page.chapterId === chapter.id)
            .sort((a, b) => a.order - b.order);
          if (pages[0]) return pages[0].id;
        }
        return null;
      },
    };
  }, [state, bookId, load, patch]);

  return api;
}
