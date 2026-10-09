import { describe, expect, it } from "vitest";
import { contentSchemaFor } from "@/lib/blocks/schema";
import { BLOCK_TYPES } from "@/types/models";
import { demoBlocks, demoBook, demoChapters, demoPages } from "./demoData";

describe("demo fixture", () => {
  it("exercises every block type", () => {
    const present = new Set(demoBlocks.map((block) => block.type));
    expect([...present].sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("keeps every block's content valid", () => {
    for (const block of demoBlocks) {
      expect(() => contentSchemaFor(block.type).parse(block.content)).not.toThrow();
    }
  });

  it("belongs to the demo book only", () => {
    expect(demoBook.id).toBe("demo");
    expect(demoBook.slug).toBe("demo");
    expect(demoChapters.every((chapter) => chapter.bookId === demoBook.id)).toBe(true);
    expect(demoPages.every((page) => page.bookId === demoBook.id)).toBe(true);
    expect(demoBlocks.every((block) => block.bookId === demoBook.id)).toBe(true);
    expect(demoBlocks.every((block) => demoPages.some((page) => page.id === block.pageId))).toBe(
      true,
    );
  });
});
