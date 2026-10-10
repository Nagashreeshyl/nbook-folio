"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { BlockContent } from "@/components/blocks/BlockContent";
import { useNotebookContext } from "@/components/book/NotebookProvider";
import { SortableItem } from "@/components/ui/SortableItem";
import { BLOCK_TYPES, type Block, type BlockType } from "@/types/models";

interface Props {
  blocks: Block[];
  editable: boolean;
  onUpdate: (blockId: string, content: Block["content"]) => void;
  onSaveSilently?: (blockId: string, content: Block["content"]) => void;
  onCreate: (type: BlockType, afterBlockId?: string) => void;
  onDelete: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

const PALETTE: Array<{ type: BlockType; icon: string; label: string; hint: string }> = [
  { type: "paragraph", icon: "notes", label: "Text", hint: "Plain paragraph" },
  { type: "heading", icon: "title", label: "Heading", hint: "Section title" },
  { type: "subheading", icon: "text_fields", label: "Subheading", hint: "Smaller heading" },
  { type: "bulletList", icon: "format_list_bulleted", label: "Bulleted list", hint: "Unordered items" },
  { type: "numberedList", icon: "format_list_numbered", label: "Numbered list", hint: "Ordered steps" },
  { type: "checklist", icon: "checklist", label: "Checklist", hint: "Trackable to-dos" },
  { type: "quote", icon: "format_quote", label: "Quote", hint: "With citation" },
  { type: "callout", icon: "campaign", label: "Callout", hint: "Note, tip or warning" },
  { type: "divider", icon: "horizontal_rule", label: "Divider", hint: "Section break" },
  { type: "table", icon: "table_chart", label: "Table", hint: "Editable grid" },
  { type: "code", icon: "code", label: "Code", hint: "Syntax highlighted" },
  { type: "canvas", icon: "draw", label: "Canvas", hint: "Freehand drawing" },
  { type: "image", icon: "image", label: "Image", hint: "Upload a picture" },
  { type: "file", icon: "attach_file", label: "File", hint: "Attach a document" },
  { type: "math", icon: "functions", label: "Math", hint: "LaTeX expression" },
];

export function BlockList({
  blocks,
  editable,
  onUpdate,
  onSaveSilently,
  onCreate,
  onDelete,
  onDuplicate,
  onReorder,
}: Props) {
  const { t } = useI18n();
  const notebook = useNotebookContext();
  const [paletteAt, setPaletteAt] = useState<string | "end" | null>(null);
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Dismiss the active block when clicking outside the block list entirely.
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeBlock) return;
    const onDown = (event: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(event.target as Node)) {
        setActiveBlock(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [activeBlock]);

  if (!editable) {
    return (
      <div className="space-y-4">
        {blocks.map((block) => (
          <div key={block.id} data-block-id={block.id}>
            <BlockContent block={block} editable={false} onChange={() => undefined} />
          </div>
        ))}
      </div>
    );
  }

  const visible = blocks;
  const visibleIds = visible.map((block) => block.id);

  /** One reorder request per drop — the old handlers fired on every dragover. */
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = visibleIds.indexOf(String(active.id));
    const to = visibleIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(visibleIds, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
      <div className="relative" ref={listRef}>
        {visible.map((block, index) => (
          <SortableItem
            key={block.id}
            id={block.id}
            as="div"
            className={`nb-block group relative ${index > 0 ? "mt-3" : ""}`}
            dataset={{
              "data-block-id": block.id,
              "data-focused": String(activeBlock === block.id),
              "data-active": String(activeBlock === block.id),
            }}
            handleTitle={t("dragHandle")}
            handleClassName="p-1 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover cursor-grab active:cursor-grabbing"
          >
            {(handle, isDragging) => (
            <div
              className={isDragging ? "opacity-40" : undefined}
              onClick={() => setActiveBlock(block.id)}
            >
              <div className="nb-block__actions no-print">
                {handle}
                <button
                  onClick={(event) => {
                    paletteTriggerRef.current = event.currentTarget;
                    setPaletteAt(block.id);
                  }}
                  title={t("addBlock")}
                  className="p-1 rounded text-ink-faint hover:text-amber hover:bg-sheet-hover"
                  ref={(el) => { if (paletteAt === block.id) paletteTriggerRef.current = el; }}
                >
                  <span className="material-symbols-outlined text-[15px]">add</span>
                </button>
                <button
                  onClick={() => onDuplicate(block.id)}
                  title={t("duplicateBlock")}
                  className="p-1 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover"
                >
                  <span className="material-symbols-outlined text-[15px]">content_copy</span>
                </button>
                <button
                  onClick={() => onDelete(block.id)}
                  title={t("deleteBlock")}
                  className="p-1 rounded text-ink-faint hover:text-danger hover:bg-sheet-hover"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                </button>
              </div>

              <BlockContent
                block={block}
                editable
                onChange={(content) => onUpdate(block.id, content)}
                {...(onSaveSilently
                  ? { onSaveSilently: (content: Block["content"]) => onSaveSilently(block.id, content) }
                  : {})}
              />
            </div>
            )}
          </SortableItem>
        ))}

        {visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-rule bg-sheet-low/60 px-5 py-8 text-center">
            <span className="material-symbols-outlined text-amber/60 text-[30px] block mb-2">
              edit_note
            </span>
            <p className="font-serif text-[16px] text-ink">{t("emptyPage")}</p>
            <p className="font-sans text-[12.5px] text-ink-faint mt-1 mb-4">{t("emptyPageHint")}</p>
            <button
              onClick={(event) => {
                paletteTriggerRef.current = event.currentTarget;
                setPaletteAt("end");
              }}
              className="inline-flex items-center gap-1.5 rounded bg-night-raise text-white px-3.5 py-2 font-mono text-[12px] hover:brightness-110"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              {t("addBlock")}
            </button>
          </div>
        )}

        {visible.length > 0 && (
          <div className="mt-4 flex items-center gap-3 no-print">
            <button
              onClick={(event) => {
                paletteTriggerRef.current = event.currentTarget;
                setPaletteAt("end");
              }}
              className="inline-flex items-center gap-1.5 rounded border border-dashed border-rule px-3 py-1.5 font-mono text-[11.5px] text-ink-faint hover:border-amber hover:text-amber transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">add</span>
              {t("addBlock")}
            </button>
            <span className="font-mono text-[10.5px] text-ink-faint">{notebook.book?.name}</span>
          </div>
        )}

        {paletteAt && (
          <BlockPalette
            triggerRef={paletteTriggerRef}
            onClose={() => setPaletteAt(null)}
            onPick={(type) => {
              const after = paletteAt === "end" ? visible[visible.length - 1]?.id : paletteAt;
              onCreate(type, after);
              setPaletteAt(null);
            }}
          />
        )}
      </div>
      </SortableContext>
    </DndContext>
  );
}

function BlockPalette({
  onPick,
  onClose,
  triggerRef,
}: {
  onPick: (type: BlockType) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    // Position the palette anchored to the trigger, flipping to below if not enough space above.
    const anchor = triggerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const paletteHeight = 380; // approximate max height
    const paletteWidth = Math.min(320, window.innerWidth * 0.9);
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceAbove >= paletteHeight || spaceAbove > spaceBelow
        ? rect.top - paletteHeight - 8
        : rect.bottom + 8;
    const left = Math.min(
      Math.max(8, rect.right - paletteWidth),
      window.innerWidth - paletteWidth - 8,
    );
    setPosition({ top, left, width: paletteWidth });

    // Scroll the palette into view after positioning.
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ block: "nearest" });
    });
  }, [triggerRef]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Use pointerup (after click completes) instead of mousedown so that
    // clicking a palette item fires its onClick before this closes the palette.
    const onPointerUp = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onClose]);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return PALETTE;
    return PALETTE.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) || item.hint.toLowerCase().includes(needle),
    );
  }, [query]);

  if (!position) return null;

  return createPortal(
    <div
      className="fixed z-[55]"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div
        ref={ref}
        className="bg-sheet border border-rule rounded-xl shadow-2xl overflow-hidden"
        role="listbox"
        aria-label={t("addBlock")}
      >
        <div className="p-2 border-b border-rule">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && options[0]) {
                event.preventDefault();
                onPick(options[0].type);
              }
            }}
            placeholder={t("addBlock")}
            className="w-full bg-sheet-low border border-rule rounded px-2.5 py-1.5 font-sans text-[13px] outline-none focus:border-amber"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {options.map((item) => (
            <button
              key={item.type}
              role="option"
              aria-selected={false}
              onClick={() => onPick(item.type)}
              className="w-full flex items-center gap-3 px-3 py-2 text-start hover:bg-sheet-hover"
            >
              <span className="material-symbols-outlined text-amber text-[18px]">{item.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-sans text-[13px] text-ink">{item.label}</span>
                <span className="block font-mono text-[10.5px] text-ink-faint">{item.hint}</span>
              </span>
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-4 text-center font-sans text-[12.5px] text-ink-faint">
              {t("noSearchResults")}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { BLOCK_TYPES };
