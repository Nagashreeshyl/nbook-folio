import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, exportNotebook, toHtml, toJson, toMarkdown } from "@/lib/export";
import type { NotebookBundle } from "@/lib/export";
import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import type { Block, Book, Chapter, Page } from "@/types/models";

const book: Book = {
  id: "bk_1",
  name: "Data Structures & Algorithms",
  slug: "dsa",
  description: "A study notebook",
  cover: null,
  createdAt: 1,
  updatedAt: 1,
  settings: { ...DEFAULT_BOOK_SETTINGS },
};

const chapters: Chapter[] = [
  { id: "ch_2", bookId: "bk_1", title: "Trees", description: "", order: 1, createdAt: 1, updatedAt: 1 },
  { id: "ch_1", bookId: "bk_1", title: "Arrays", description: "", order: 0, createdAt: 1, updatedAt: 1 },
];

const pages: Page[] = [
  { id: "pg_1", bookId: "bk_1", chapterId: "ch_1", title: "Two pointers", order: 0, createdAt: 1, updatedAt: 1 },
  { id: "pg_2", bookId: "bk_1", chapterId: "ch_2", title: "Binary search tree", order: 0, createdAt: 1, updatedAt: 1 },
];

const blocks: Block[] = [
  {
    id: "b1",
    bookId: "bk_1",
    pageId: "pg_1",
    type: "heading",
    order: 0,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    content: { html: "<h2>Technique</h2>" },
  },
  {
    id: "b2",
    bookId: "bk_1",
    pageId: "pg_1",
    type: "paragraph",
    order: 1,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    content: { html: "<p>Use <strong>two pointers</strong> to scan once.</p>" },
  },
  {
    id: "b3",
    bookId: "bk_1",
    pageId: "pg_1",
    type: "code",
    order: 2,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    content: { language: "python", code: "def two_pointer(a):\n    return a", lineNumbers: false },
  },
  {
    id: "b4",
    bookId: "bk_1",
    pageId: "pg_1",
    type: "checklist",
    order: 3,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    content: { html: '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked>Done</label></li></ul>' },
  },
  {
    id: "b5",
    bookId: "bk_1",
    pageId: "pg_2",
    type: "paragraph",
    order: 0,
    rev: 1,
    createdAt: 1,
    updatedAt: 1,
    content: { html: "<p>Left subtree is smaller.</p>" },
  },
];

const bundle: NotebookBundle = { book, chapters, pages, blocks };

describe("toMarkdown", () => {
  const markdown = toMarkdown(bundle);

  it("starts with the book title", () => {
    expect(markdown.startsWith("# Data Structures & Algorithms")).toBe(true);
  });

  it("emits chapters in order", () => {
    expect(markdown.indexOf("## Arrays")).toBeLessThan(markdown.indexOf("## Trees"));
  });

  it("emits pages", () => {
    expect(markdown).toContain("# Two pointers");
    expect(markdown).toContain("# Binary search tree");
  });

  it("converts rich text to markdown", () => {
    expect(markdown).toContain("## Technique");
    expect(markdown).toContain("**two pointers**");
  });

  it("emits a single heading marker per heading", () => {
    expect(markdown).not.toContain("### ##");
    expect(markdown).not.toContain("## ##");
    expect(markdown.split("## Technique")).toHaveLength(2);
  });

  it("emits fenced code with the language tag", () => {
    expect(markdown).toContain("```python");
    expect(markdown).toContain("def two_pointer(a):");
  });

  it("widens the fence when the source contains backticks", () => {
    const tricky = [...blocks];
    tricky[2] = {
      ...tricky[2]!,
      content: { language: "markdown", code: "```\ninner\n```", lineNumbers: false },
    };
    const md = toMarkdown({ ...bundle, blocks: tricky });
    expect(md).toContain("````markdown");
    expect(md).not.toContain("```inner");
  });

  it("preserves task list state for Tiptap-shaped checkboxes", () => {
    const taskBlocks: Block[] = [
      {
        id: "b6",
        bookId: "bk_1",
        pageId: "pg_2",
        type: "checklist",
        order: 1,
        rev: 1,
        createdAt: 1,
        updatedAt: 1,
        content: {
          html:
            '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>Ship it</p></div></li></ul>',
        },
      },
    ];
    const md = toMarkdown({ ...bundle, blocks: taskBlocks });
    expect(md).toContain("- [x] Ship it");
  });

  it("preserves task list state", () => {
    expect(markdown).toContain("- [x] Done");
  });
});

describe("toHtml", () => {
  const html = toHtml(bundle);

  it("is a standalone document", () => {
    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(html).toContain("<title>Data Structures &amp; Algorithms</title>");
  });

  it("escapes nothing it should not", () => {
    expect(html).toContain("Two pointers");
    expect(html).toContain("def two_pointer(a):");
  });
});

describe("toJson", () => {
  const parsed = JSON.parse(toJson(bundle)) as {
    format: string;
    book: Book;
    chapters: Chapter[];
    pages: Page[];
    blocks: Block[];
  };

  it("namespaces the format", () => {
    expect(parsed.format).toBe("nbook/1");
  });

  it("round-trips every entity", () => {
    expect(parsed.book.id).toBe("bk_1");
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.blocks).toHaveLength(5);
  });
});

describe("exportNotebook", () => {
  it("produces a filename derived from the book name", () => {
    const result = exportNotebook(bundle, "markdown");
    expect(result.filename).toBe("data-structures-algorithms.md");
    expect(result.mime).toContain("text/markdown");
  });

  it("supports every advertised format", () => {
    for (const target of EXPORT_FORMATS) {
      const result = exportNotebook(bundle, target.id);
      expect(result.mime).toBe(target.mime);
      expect(result.body.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown formats", () => {
    expect(() => exportNotebook(bundle, "pdf" as never)).toThrow(/Unsupported/);
  });
});
