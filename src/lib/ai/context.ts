import type { Block, Book, Chapter, Page } from "@/types/models";
import { htmlToText, exactSearch } from "@/lib/search";

export interface NotebookContextItem {
  chapterId: string;
  chapterTitle: string;
  pageId: string;
  pageTitle: string;
  blockId: string;
  text: string;
}

export interface NotebookContext {
  items: NotebookContextItem[];
  /** Rendered context block handed to the model. */
  rendered: string;
  /** Source references the UI can surface as citations. */
  sources: Array<{ chapterId: string; chapterTitle: string; pageId: string; pageTitle: string }>;
}

const MAX_CHARS = 6_000;
const MAX_ITEMS = 6;

function blockToPlainText(block: Block): string {
  const content = block.content as Record<string, unknown>;
  switch (block.type) {
    case "code":
      return `\`\`\`${content.language ?? ""}\n${content.code ?? ""}\n\`\`\``;
    case "math":
      return String(content.latex ?? "");
    case "image":
      return htmlToText(String(content.caption ?? content.alt ?? ""));
    case "file":
      return String(content.name ?? "");
    case "canvas":
      return "[canvas diagram]";
    default:
      return htmlToText(String(content.html ?? ""));
  }
}

/**
 * Notebook-aware retrieval for "Ask NBOOK".
 *
 * V1 retrieval is exact/lexical (see `lib/search`). The shape of this function
 * is the contract a vector-backed implementation would fill in later.
 */
export function buildNotebookContext(
  query: string,
  scope: { book: Book; chapters: Chapter[]; pages: Page[]; blocks: Block[] },
): NotebookContext {
  const chaptersById = new Map(scope.chapters.map((c) => [c.id, c]));
  const pagesById = new Map(scope.pages.map((p) => [p.id, p]));
  const blocksById = new Map(scope.blocks.map((b) => [b.id, b]));

  const hits = exactSearch.search(query, scope, { limit: MAX_ITEMS * 3 });
  const items: NotebookContextItem[] = [];
  const seenPages = new Set<string>();

  for (const hit of hits) {
    if (items.length >= MAX_ITEMS) break;
    const block = hit.blockId ? blocksById.get(hit.blockId) : undefined;
    const text = block
      ? blockToPlainText(block)
      : `${hit.pageTitle} — ${hit.snippet}`;
    if (!text.trim()) continue;
    if (block && block.type === "divider") continue;
    const key = `${hit.pageId}:${hit.blockId}`;
    if (seenPages.has(key)) continue;
    seenPages.add(key);
    items.push({
      chapterId: hit.chapterId,
      chapterTitle: hit.chapterTitle || chaptersById.get(hit.chapterId)?.title || "",
      pageId: hit.pageId,
      pageTitle: pagesById.get(hit.pageId)?.title ?? hit.pageTitle,
      blockId: hit.blockId,
      text: text.slice(0, 1200),
    });
  }

  // Fall back to the opening of the notebook when nothing matched, so the
  // model still has grounded material instead of hallucinating structure.
  if (items.length === 0) {
    const firstPages = [...scope.pages].sort((a, b) => a.order - b.order).slice(0, 2);
    for (const page of firstPages) {
      const pageBlocks = scope.blocks
        .filter((b) => b.pageId === page.id)
        .sort((a, b) => a.order - b.order)
        .slice(0, 3);
      const chapter = chaptersById.get(page.chapterId);
      for (const block of pageBlocks) {
        const text = blockToPlainText(block);
        if (!text.trim()) continue;
        items.push({
          chapterId: page.chapterId,
          chapterTitle: chapter?.title ?? "",
          pageId: page.id,
          pageTitle: page.title,
          blockId: block.id,
          text: text.slice(0, 900),
        });
        if (items.length >= 3) break;
      }
      if (items.length >= 3) break;
    }
  }

  let budget = MAX_CHARS;
  const usable: NotebookContextItem[] = [];
  for (const item of items) {
    if (budget <= 0) break;
    const clipped = item.text.slice(0, budget);
    usable.push({ ...item, text: clipped });
    budget -= clipped.length;
  }

  const rendered = usable
    .map(
      (item, index) =>
        `[${index + 1}] Chapter "${item.chapterTitle}" — Page "${item.pageTitle}"\n${item.text}`,
    )
    .join("\n\n");

  const dedupedSources: NotebookContext["sources"] = [];
  const sourceKeys = new Set<string>();
  for (const item of usable) {
    const key = `${item.chapterId}:${item.pageId}`;
    if (sourceKeys.has(key)) continue;
    sourceKeys.add(key);
    dedupedSources.push({
      chapterId: item.chapterId,
      chapterTitle: item.chapterTitle,
      pageId: item.pageId,
      pageTitle: item.pageTitle,
    });
  }

  return { items: usable, rendered, sources: dedupedSources };
}
