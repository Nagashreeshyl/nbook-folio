"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableItemProps {
  id: string;
  /** Render prop so the caller can place the handle inside its own row markup. */
  children: (handle: ReactNode, isDragging: boolean) => ReactNode;
  /** Without this the item renders no handle and can never be picked up. */
  canDrag?: boolean;
  as?: "li" | "div";
  className?: string;
  /** `data-*` markers the surrounding app already relies on (e.g. data-block-id). */
  dataset?: Record<string, string>;
  /** Accessible name of the drag handle, e.g. "Reorder chapter". */
  handleTitle: string;
  handleClassName?: string;
}

/**
 * One drag-and-drop row shared by the page tree and the block list.
 *
 * dnd-kit is used deliberately: it supports pointer + keyboard reordering and
 * touches no document-level drag state, so the existing Move up / Move down
 * actions remain the accessible fallback.
 */
export function SortableItem({
  id,
  children,
  canDrag = true,
  as = "li",
  className,
  dataset,
  handleTitle,
  handleClassName,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !canDrag });

  const handle = canDrag ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      onClick={(event) => event.stopPropagation()}
      title={handleTitle}
      aria-label={handleTitle}
      style={{ touchAction: "none" }}
      className={
        handleClassName ??
        "shrink-0 p-1 rounded text-ink-faint hover:text-ink hover:bg-sheet-hover cursor-grab active:cursor-grabbing"
      }
    >
      <span className="material-symbols-outlined text-[15px]">drag_indicator</span>
    </button>
  ) : null;

  const Tag = as;

  return (
    <Tag
      {...dataset}
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(handle, isDragging)}
    </Tag>
  );
}
