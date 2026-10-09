import type { Block, BlockType, Book, Chapter, Page, SearchHit } from "@/types/models";

/**
 * Exact (lexical) search layer.
 *
 * The public `SearchEngine` interface is intentionally small so a semantic /
 * vector implementation can be added later without touching callers. Only the
 * exact implementation is wired up — no fake AI search.
 */

export interface SearchScope {
  book: Book;
  chapters: Chapter[];
  pages: Page[];
  blocks: Block[];
}

export interface SearchOptions {
  limit?: number;
  /** Include `code` block bodies. */
  includeCode?: boolean;
}

export interface SearchEngine {
  readonly kind: "exact" | "semantic";
  search(query: string, scope: SearchScope, options?: SearchOptions): SearchHit[];
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const BLOCK_TAG_RE = /<\/?(?:p|h[1-6]|ul|ol|li|blockquote|pre|code|table|thead|tbody|tr|th|td|caption|br|hr|div|span|label|input|a|strong|b|em|i|u|s|mark|strike)\b[^>]*>/gi;
const ANY_TAG_RE = /<[^>]*>/g;
const ENTITY_RE = /&(?:nbsp|lt|gt|amp|quot|#39|#x27);/g;

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

/** Flattens rich-text HTML into plain, searchable text. */
export function htmlToText(html: string): string {
  if (!html) return "";
  const withoutTags = html
    .replace(BLOCK_TAG_RE, " ")
    .replace(ANY_TAG_RE, "")
    .replace(ENTITY_RE, (m) => ENTITIES[m] ?? " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

/** Unicode-aware normalisation so matching works across scripts and casings. */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function tokenize(query: string): string[] {
  return normalizeText(query)
    // \p{Mark} keeps Indic conjuncts (virama) inside a single token; the two
    // format characters cover zero-width joiners/non-joiners.
    .split(/[^\p{Letter}\p{Number}\p{Mark}_\u200C\u200D]+/u)
    .filter((t) => t.length > 0);
}

function indexOfIgnoreCase(haystack: string, needle: string): number {
  if (!needle) return -1;
  return normalizeText(haystack).indexOf(normalizeText(needle));
}

function makeSnippet(text: string, position: number, radius = 70): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function blockText(block: Block): { text: string; kind: SearchHit["matchKind"] } {
  const content = block.content as Record<string, unknown>;
  switch (block.type as BlockType) {
    case "code":
      return { text: String(content.code ?? ""), kind: "code" };
    case "math":
      return { text: String(content.latex ?? ""), kind: "text" };
    case "image":
      return { text: `${content.alt ?? ""} ${content.caption ?? ""}`, kind: "text" };
    case "file":
      return { text: String(content.name ?? ""), kind: "text" };
    default:
      return { text: htmlToText(String(content.html ?? "")), kind: "text" };
  }
}

/* ------------------------------------------------------------------ */
/* Exact engine                                                        */
/* ------------------------------------------------------------------ */

class ExactSearchEngine implements SearchEngine {
  readonly kind = "exact" as const;

  search(query: string, scope: SearchScope, options: SearchOptions = {}): SearchHit[] {
    const limit = options.limit ?? 50;
    const includeCode = options.includeCode ?? true;
    const trimmed = query.trim();
    if (!trimmed) return [];

    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return [];

    const chaptersById = new Map(scope.chapters.map((c) => [c.id, c]));
    const pagesById = new Map(scope.pages.map((p) => [p.id, p]));
    const hits: SearchHit[] = [];

    const push = (hit: SearchHit) => hits.push(hit);

    for (const page of scope.pages) {
      const chapter = chaptersById.get(page.chapterId);
      const base = {
        bookId: scope.book.id,
        bookName: scope.book.name,
        chapterId: page.chapterId,
        chapterTitle: chapter?.title ?? "",
        pageId: page.id,
        pageTitle: page.title,
      };

      // Page title
      const titlePos = indexOfIgnoreCase(page.title, trimmed);
      if (titlePos >= 0) {
        push({
          ...base,
          blockId: "",
          blockType: "paragraph",
          snippet: page.title,
          score: 100 - Math.min(50, titlePos),
          matchKind: "title",
        });
      } else if (tokens.every((t) => indexOfIgnoreCase(page.title, t) >= 0)) {
        push({
          ...base,
          blockId: "",
          blockType: "paragraph",
          snippet: page.title,
          score: 70,
          matchKind: "title",
        });
      }

      // Chapter title (weaker)
      if (chapter && indexOfIgnoreCase(chapter.title, trimmed) >= 0) {
        push({
          ...base,
          blockId: "",
          blockType: "paragraph",
          snippet: chapter.title,
          score: 55,
          matchKind: "title",
        });
      }
    }

    for (const block of scope.blocks) {
      const page = pagesById.get(block.pageId);
      if (!page) continue;
      const chapter = chaptersById.get(page.chapterId);
      const { text, kind } = blockText(block);
      if (!text) continue;
      if (kind === "code" && !includeCode) continue;

      const pos = indexOfIgnoreCase(text, trimmed);
      let score = 0;
      if (pos >= 0) {
        score = 60 - Math.min(30, Math.floor(pos / 40));
      } else {
        let matched = 0;
        for (const token of tokens) {
          if (indexOfIgnoreCase(text, token) >= 0) matched++;
        }
        if (matched === 0) continue;
        score = Math.round((matched / tokens.length) * 40);
      }
      if (kind === "code") score -= 5;
      if (kind === "text" && block.type === "heading") score += 8;

      push({
        bookId: scope.book.id,
        bookName: scope.book.name,
        chapterId: page.chapterId,
        chapterTitle: chapter?.title ?? "",
        pageId: page.id,
        pageTitle: page.title,
        blockId: block.id,
        blockType: block.type,
        snippet: makeSnippet(text, pos >= 0 ? pos : 0),
        score: Math.max(1, score),
        matchKind: kind,
      });
    }

    // Deduplicate: keep the strongest hit per page + block pair.
    const seen = new Map<string, SearchHit>();
    for (const hit of hits) {
      const key = `${hit.pageId}:${hit.blockId || "title"}`;
      const existing = seen.get(key);
      if (!existing || existing.score < hit.score) seen.set(key, hit);
    }

    return [...seen.values()]
      .sort((a, b) => b.score - a.score || a.pageTitle.localeCompare(b.pageTitle))
      .slice(0, limit);
  }
}

export const exactSearch: SearchEngine = new ExactSearchEngine();

/**
 * Placeholder for a future semantic/vector engine.
 *
 * Deliberately throws instead of returning fabricated results — the UI only
 * ever calls `exactSearch` in V1.
 */
export const semanticSearch: SearchEngine = {
  kind: "semantic",
  search() {
    throw new Error("Semantic search is not implemented yet.");
  },
};
