import { describe, expect, it } from "vitest";
import { exactSearch, htmlToText, normalizeText, semanticSearch, tokenize } from "@/lib/search";
import type { SearchScope } from "@/lib/search";
import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import type { Block, Book, Chapter, Page } from "@/types/models";

const book: Book = {
  id: "bk_1",
  name: "Algorithms",
  slug: "algorithms",
  description: "",
  cover: null,
  createdAt: 1,
  updatedAt: 1,
  settings: { ...DEFAULT_BOOK_SETTINGS },
};

const chapter: Chapter = {
  id: "ch_1",
  bookId: "bk_1",
  title: "Sorting",
  description: "",
  order: 0,
  createdAt: 1,
  updatedAt: 1,
};

const page: Page = {
  id: "pg_1",
  bookId: "bk_1",
  chapterId: "ch_1",
  title: "Quicksort basics",
  order: 0,
  createdAt: 1,
  updatedAt: 1,
};

const otherPage: Page = {
  id: "pg_2",
  bookId: "bk_1",
  chapterId: "ch_1",
  title: "Mergesort",
  order: 1,
  createdAt: 1,
  updatedAt: 1,
};

function block(partial: Partial<Block> & Pick<Block, "id" | "pageId" | "type" | "content">): Block {
  return {
    bookId: "bk_1",
    order: 0,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as Block;
}

const scope: SearchScope = {
  book,
  chapters: [chapter],
  pages: [page, otherPage],
  blocks: [
    block({
      id: "b1",
      pageId: "pg_1",
      type: "paragraph",
      content: { html: "<p>Quicksort partitions an array around a pivot element.</p>" },
    }),
    block({
      id: "b2",
      pageId: "pg_1",
      type: "code",
      content: { language: "javascript", code: "function quicksort(a) { return a; }", lineNumbers: false },
    }),
    block({
      id: "b3",
      pageId: "pg_2",
      type: "paragraph",
      content: { html: "<p>Merge sort divides the array in half recursively.</p>" },
    }),
    block({
      id: "b4",
      pageId: "pg_2",
      type: "heading",
      content: { html: "<h2>Stability of sort algorithms</h2>" },
    }),
  ],
};

describe("htmlToText", () => {
  it("strips tags and collapses whitespace", () => {
    expect(htmlToText("<p>Hello   <strong>world</strong></p>")).toBe("Hello world");
    expect(htmlToText("<ul><li>one</li><li>two</li></ul>")).toBe("one two");
  });

  it("decodes common entities", () => {
    expect(htmlToText("<p>a &amp; b &lt;c&gt;</p>")).toBe("a & b <c>");
  });

  it("handles empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("tokenize / normalizeText", () => {
  it("is unicode aware", () => {
    expect(tokenize("ಕನ್ನಡ ಪಠ್ಯ")).toEqual(["ಕನ್ನಡ", "ಪಠ್ಯ"]);
    expect(normalizeText("QUICKSORT")).toBe("quicksort");
    expect(tokenize("quicksort, mergesort!")).toEqual(["quicksort", "mergesort"]);
  });
});

describe("exactSearch", () => {
  it("matches page titles above body text", () => {
    const hits = exactSearch.search("quicksort", scope);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.matchKind).toBe("title");
    expect(hits[0]!.pageTitle).toBe("Quicksort basics");
  });

  it("returns hits with chapter context", () => {
    const hits = exactSearch.search("partition", scope);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.chapterTitle).toBe("Sorting");
    expect(hits[0]!.pageId).toBe("pg_1");
  });

  it("can include and exclude code bodies", () => {
    expect(exactSearch.search("quicksort(a)", scope, { includeCode: true }).length).toBeGreaterThan(0);
    const withoutCode = exactSearch.search("quicksort(a)", scope, { includeCode: false });
    expect(withoutCode.every((hit) => hit.matchKind !== "code")).toBe(true);
  });

  it("flags code matches", () => {
    const hits = exactSearch.search("function quicksort", scope);
    expect(hits.some((hit) => hit.matchKind === "code")).toBe(true);
  });

  it("produces a snippet around the match", () => {
    const hits = exactSearch.search("pivot", scope);
    const hit = hits.find((h) => h.matchKind === "text")!;
    expect(hit.snippet).toContain("pivot");
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(exactSearch.search("", scope)).toEqual([]);
    expect(exactSearch.search("   ", scope)).toEqual([]);
    expect(exactSearch.search("zzzzzzzz", scope)).toEqual([]);
  });

  it("respects the result limit", () => {
    const hits = exactSearch.search("sort", scope, { limit: 1 });
    expect(hits).toHaveLength(1);
  });

  it("matches non-latin content", () => {
    const local: SearchScope = {
      ...scope,
      pages: [{ ...page, title: "ಕನ್ನಡ ಪಠ್ಯ" }],
      blocks: [
        block({
          id: "kn1",
          pageId: "pg_1",
          type: "paragraph",
          content: { html: "<p>ಇದು ಒಂದು ಪರೀಕ್ಷಾ ಪಠ್ಯ.</p>" },
        }),
      ],
    };
    const hits = exactSearch.search("ಪರೀಕ್ಷಾ", local);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("semanticSearch", () => {
  it("throws instead of fabricating results", () => {
    expect(() => semanticSearch.search("anything", scope)).toThrow(/not implemented/i);
  });
});
