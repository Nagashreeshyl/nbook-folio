"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { useNotebookSession } from "@/components/book/NotebookGate";
import { SortableItem } from "@/components/ui/SortableItem";
import { EmptyState } from "@/components/ui/States";

interface Props {
  activePageId: string | null;
  onNavigate?: (pageId: string) => void;
}

export function PageTree({ activePageId, onNavigate }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { slug } = useNotebookSession();
  const notebook = useNotebookContext();
  const [renaming, setRenaming] = useState<{ kind: "chapter" | "page"; id: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  const chapters = [...notebook.chapters].sort((a, b) => a.order - b.order);
  const chapterIds = chapters.map((chapter) => chapter.id);
  const canWrite = notebook.can("write");

  const fail = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : t("errorGeneric"));

  async function addChapter() {
    try {
      const chapter = await notebook.createChapter(`${t("chapter")} ${chapters.length + 1}`);
      setRenaming({ kind: "chapter", id: chapter.id });
      setDraft(chapter.title);
    } catch (error) {
      fail(error);
    }
  }

  async function addPage(chapterId: string) {
    try {
      const page = await notebook.createPage(chapterId, t("untitledPage"));
      router.push(`/b/${slug}/edit?page=${page.id}`);
    } catch (error) {
      fail(error);
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const value = draft.trim();
    const target = renaming;
    setRenaming(null);
    if (!value) return;
    try {
      if (target.kind === "chapter") await notebook.renameChapter(target.id, value);
      else await notebook.renamePage(target.id, value);
    } catch (error) {
      fail(error);
    }
  }

  async function move(kind: "chapter" | "page", id: string, delta: number, chapterId?: string) {
    try {
      if (kind === "chapter") {
        const ids = chapters.map((c) => c.id);
        const index = ids.indexOf(id);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next]!, ids[index]!];
        await notebook.reorderChapters(ids);
      } else if (chapterId) {
        const ids = notebook
          .pagesInChapter(chapterId)
          .map((p) => p.id);
        const index = ids.indexOf(id);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next]!, ids[index]!];
        await notebook.reorderPages(chapterId, ids);
      }
    } catch (error) {
      fail(error);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Page drops are only accepted inside their own chapter — the tree reorders,
   * it does not reparent (the API has no move-page-to-chapter operation).
   */
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (chapterIds.includes(activeId)) {
      const target = chapterIds.indexOf(overId);
      if (target < 0) return;
      const next = arrayMove(chapterIds, chapterIds.indexOf(activeId), target);
      void notebook.reorderChapters(next).catch(fail);
      return;
    }

    const page = notebook.pages.find((candidate) => candidate.id === activeId);
    if (!page) return;
    const ids = notebook.pagesInChapter(page.chapterId).map((candidate) => candidate.id);
    const target = ids.indexOf(overId);
    if (target < 0) return;
    const next = arrayMove(ids, ids.indexOf(activeId), target);
    void notebook.reorderPages(page.chapterId, next).catch(fail);
  }

  function go(pageId: string) {
    setOpenMenu(null);
    if (onNavigate) onNavigate(pageId);
    else router.push(`/b/${slug}/read?page=${pageId}`);
  }

  return (
    <nav className="flex flex-col h-full min-h-0" aria-label={t("contents")}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint font-semibold">
          {t("contents")}
        </span>
        <div className="flex items-center gap-1">
          {canWrite && (
            <button
              onClick={() => void addPage(chapters[0]?.id ?? "")}
              disabled={!chapters.length}
              title={t("addPage")}
              className="p-1 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover disabled:opacity-30"
            >
              <span className="material-symbols-outlined text-[16px]">note_add</span>
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => void addChapter()}
              title={t("addChapter")}
              className="p-1 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover"
            >
              <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        {notebook.status === "loading" ? (
          <div className="p-2 space-y-2">
            <div className="h-4 w-24 bg-sheet-hover rounded animate-pulse" />
            <div className="h-6 w-36 bg-sheet-hover rounded animate-pulse" />
            <div className="h-6 w-32 bg-sheet-hover rounded animate-pulse" />
          </div>
        ) : chapters.length === 0 ? (
          <EmptyState
            icon="create_new_folder"
            title={t("noChapters")}
            description={canWrite ? t("noPages") : undefined}
            action={
              canWrite ? (
                <Button size="sm" variant="primary" icon="add" onClick={() => void addChapter()}>
                  {t("addChapter")}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <SortableContext items={chapterIds} strategy={verticalListSortingStrategy}>
          <ol className="space-y-3">
            {chapters.map((chapter, chapterIndex) => {
              const pages = notebook.pagesInChapter(chapter.id);
              const isRenaming =
                renaming?.kind === "chapter" && renaming.id === chapter.id;
              return (
                <SortableItem
                  key={chapter.id}
                  id={chapter.id}
                  canDrag={canWrite}
                  className="relative"
                  handleTitle={t("reorderChapter")}
                  handleClassName="shrink-0 p-0.5 rounded text-ink-faint hover:text-amber cursor-grab active:cursor-grabbing"
                >
                  {(handle, isDragging) => (
                  <>
                  <div
                    className={`group flex items-center gap-1 px-2 py-1 ${
                      isDragging ? "opacity-40" : ""
                    }`}
                  >
                    <span className="font-mono text-[10px] text-amber tabular-nums w-4 shrink-0">
                      {String(chapterIndex + 1).padStart(2, "0")}
                    </span>
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void commitRename();
                          if (event.key === "Escape") setRenaming(null);
                        }}
                        className="flex-1 min-w-0 bg-sheet border border-amber rounded px-1.5 py-0.5 font-serif text-[14px] text-ink outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => {
                          if (!canWrite) return;
                          setRenaming({ kind: "chapter", id: chapter.id });
                          setDraft(chapter.title);
                        }}
                        className="flex-1 min-w-0 font-serif text-[14px] font-semibold text-ink truncate"
                        title={chapter.title}
                      >
                        {chapter.title}
                      </span>
                    )}

                    {canWrite && (
                      <span className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {handle}
                        <button
                          onClick={() => void addPage(chapter.id)}
                          title={t("addPage")}
                          className="p-0.5 rounded text-ink-faint hover:text-amber"
                        >
                          <span className="material-symbols-outlined text-[15px]">add</span>
                        </button>
                        <div className="relative" ref={openMenu === chapter.id ? menuRef : undefined}>
                          <button
                            onClick={() =>
                              setOpenMenu(openMenu === chapter.id ? null : chapter.id)
                            }
                            title="More"
                            className="p-0.5 rounded text-ink-faint hover:text-ink"
                          >
                            <span className="material-symbols-outlined text-[15px]">more_horiz</span>
                          </button>
                          {openMenu === chapter.id && (
                            <div className="absolute end-0 top-full z-30 mt-1 w-40 bg-sheet border border-rule rounded-lg shadow-lg py-1">
                              <MenuItem
                                icon="edit"
                                label={t("rename")}
                                onClick={() => {
                                  setRenaming({ kind: "chapter", id: chapter.id });
                                  setDraft(chapter.title);
                                  setOpenMenu(null);
                                }}
                              />
                              <MenuItem
                                icon="arrow_upward"
                                label={t("moveUp")}
                                disabled={chapterIndex === 0}
                                onClick={() => {
                                  void move("chapter", chapter.id, -1);
                                  setOpenMenu(null);
                                }}
                              />
                              <MenuItem
                                icon="arrow_downward"
                                label={t("moveDown")}
                                disabled={chapterIndex === chapters.length - 1}
                                onClick={() => {
                                  void move("chapter", chapter.id, 1);
                                  setOpenMenu(null);
                                }}
                              />
                              <div className="my-1 border-t border-rule" />
                              <MenuItem
                                icon="delete"
                                label={t("delete")}
                                danger
                                onClick={() => {
                                  setOpenMenu(null);
                                  if (
                                    window.confirm(
                                      `Delete “${chapter.title}” and all of its pages?`,
                                    )
                                  ) {
                                    void notebook.deleteChapter(chapter.id).catch(fail);
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </span>
                    )}
                  </div>

                  <SortableContext
                    items={pages.map((page) => page.id)}
                    strategy={verticalListSortingStrategy}
                  >
                  <ol className="ms-4 border-s border-rule/70 ps-2 space-y-0.5 mt-0.5">
                    {pages.map((page) => {
                      const active = page.id === activePageId;
                      const pageRenaming = renaming?.kind === "page" && renaming.id === page.id;
                      return (
                        <SortableItem
                          key={page.id}
                          id={page.id}
                          canDrag={canWrite}
                          className="group relative"
                          handleTitle={t("reorderPage")}
                          handleClassName="shrink-0 p-0.5 rounded text-ink-faint hover:text-ink cursor-grab active:cursor-grabbing"
                        >
                          {(handle, isDragging) => (
                          <div
                            className={`flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer transition-colors ${
                              active ? "bg-sheet-high" : "hover:bg-sheet-hover"
                            }${isDragging ? " opacity-40" : ""}`}
                            onClick={() => go(page.id)}
                          >
                            {handle}
                            <span
                              className={`material-symbols-outlined text-[14px] shrink-0 ${
                                active ? "text-amber" : "text-ink-faint"
                              }`}
                            >
                              {active ? "book_5" : "description"}
                            </span>
                            {pageRenaming ? (
                              <input
                                autoFocus
                                value={draft}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setDraft(event.target.value)}
                                onBlur={() => void commitRename()}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void commitRename();
                                  if (event.key === "Escape") setRenaming(null);
                                  event.stopPropagation();
                                }}
                                className="flex-1 min-w-0 bg-sheet border border-amber rounded px-1.5 py-0.5 font-sans text-[12.5px] text-ink outline-none"
                              />
                            ) : (
                              <span
                                className={`flex-1 min-w-0 truncate font-sans text-[12.5px] ${
                                  active ? "text-ink font-medium" : "text-ink-soft"
                                }`}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  if (!canWrite) return;
                                  setRenaming({ kind: "page", id: page.id });
                                  setDraft(page.title);
                                }}
                              >
                                {page.title || t("untitledPage")}
                              </span>
                            )}

                            {canWrite && (
                              <span className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void move("page", page.id, -1, page.chapterId);
                                  }}
                                  title={t("moveUp")}
                                  className="p-0.5 rounded text-ink-faint hover:text-ink"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    arrow_upward
                                  </span>
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void notebook
                                      .duplicatePage(page.id)
                                      .then((copy) => go(copy.id))
                                      .catch(fail);
                                  }}
                                  title={t("duplicate")}
                                  className="p-0.5 rounded text-ink-faint hover:text-ink"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    content_copy
                                  </span>
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!window.confirm(`Delete “${page.title}”?`)) return;
                                    void notebook.deletePage(page.id).catch(fail);
                                  }}
                                  title={t("delete")}
                                  className="p-0.5 rounded text-ink-faint hover:text-danger"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    delete
                                  </span>
                                </button>
                              </span>
                            )}
                          </div>
                          )}
                        </SortableItem>
                      );
                    })}
                    {pages.length === 0 && canWrite && (
                      <li>
                        <button
                          onClick={() => void addPage(chapter.id)}
                          className="w-full text-start rounded px-2 py-1.5 font-sans text-[12px] text-ink-faint hover:text-amber hover:bg-sheet-hover"
                        >
                          + {t("addPage")}
                        </button>
                      </li>
                    )}
                  </ol>
                  </SortableContext>
                  </>
                  )}
                </SortableItem>
              );
            })}
          </ol>
          </SortableContext>
        )}
      </div>
      </DndContext>
    </nav>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-start font-sans text-[12.5px] disabled:opacity-40 ${
        danger ? "text-danger hover:bg-danger/10" : "text-ink-soft hover:bg-sheet-hover"
      }`}
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
      {label}
    </button>
  );
}
