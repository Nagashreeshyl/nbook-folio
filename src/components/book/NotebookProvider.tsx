"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNotebook, type NotebookApi } from "@/hooks/useNotebook";
import { apiRequest } from "@/lib/api/client";
import type { PresenceEntry } from "@/types/models";

const PRESENCE_TTL_MS = 45_000;

export interface NotebookContextValue extends NotebookApi {
  /** Page the current session is sitting on — reported by the shell. */
  setPageId: (pageId: string | null) => void;
}

const NotebookContext = createContext<NotebookContextValue | null>(null);

export function NotebookProvider({ bookId, children }: { bookId: string; children: ReactNode }) {
  const notebook = useNotebook(bookId);
  const [pageId, setPageId] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceEntry[]>(notebook.presence);
  const pageRef = useRef<string | null>(null);

  useEffect(() => {
    pageRef.current = pageId;
  }, [pageId]);

  useEffect(() => setPresence(notebook.presence), [notebook.presence]);

  // Heartbeat doubles as "which page am I on" reporting, so the collaborator
  // dots move to the right chapter as people navigate.
  useEffect(() => {
    if (!bookId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const beat = async () => {
      if (stop) return;
      try {
        const data = await apiRequest<{ presence: PresenceEntry[] }>(
          `/api/books/${bookId}/presence`,
          { method: "POST", body: { pageId: pageRef.current } },
        );
        if (!stop) setPresence(data.presence);
      } catch {
        /* transient — the next beat retries */
      }
      timer = setTimeout(() => void beat(), PRESENCE_TTL_MS / 3);
    };

    void beat();
    return () => {
      stop = true;
      clearTimeout(timer);
      // Tell the server we left so our dot does not linger. DELETE removes the
      // entry — a heartbeat POST would only refresh `updatedAt` and keep it
      // alive for another TTL window.
      void apiRequest(`/api/books/${bookId}/presence`, { method: "DELETE" }).catch(
        () => undefined,
      );
    };
  }, [bookId]);

  const value = useMemo<NotebookContextValue>(
    () => ({ ...notebook, presence, setPageId }),
    [notebook, presence, setPageId],
  );

  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}

/**
 * Supplies an already-built notebook value. The demo route uses it to host
 * the real block renderers against fixture data, with no API behind it.
 */
export function NotebookContextProvider({
  value,
  children,
}: {
  value: NotebookContextValue;
  children: ReactNode;
}) {
  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}

export function useNotebookContext(): NotebookContextValue {
  const ctx = useContext(NotebookContext);
  if (!ctx) throw new Error("useNotebookContext must be used inside <NotebookProvider>");
  return ctx;
}
