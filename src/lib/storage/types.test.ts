import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import type { Book } from "@/types/models";
import { hydrateBook } from "@/lib/storage/types";

const stored = {
  id: "bk_1",
  name: "Old notebook",
  slug: "old-notebook",
  description: "",
  cover: null,
  createdAt: 1,
  updatedAt: 1,
  settings: { theme: "dark" },
} as unknown as Book;

describe("hydrateBook", () => {
  it("defaults pageSound to off", () => {
    expect(DEFAULT_BOOK_SETTINGS.pageSound).toBe(false);
    expect(DEFAULT_BOOK_SETTINGS.pageAnimation).toBe("subtle");
    expect(hydrateBook(stored).settings.pageSound).toBe(false);
  });

  it("keeps stored settings over the defaults", () => {
    const hydrated = hydrateBook(stored);
    expect(hydrated.settings.theme).toBe("dark");
    expect(hydrated.settings.fontScale).toBe(DEFAULT_BOOK_SETTINGS.fontScale);
    expect(hydrated.id).toBe("bk_1");
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(stored);
    hydrateBook(stored);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("leaves complete settings untouched", () => {
    const complete: Book = {
      ...stored,
      settings: { ...DEFAULT_BOOK_SETTINGS, pageSound: true },
    };
    expect(hydrateBook(complete).settings.pageSound).toBe(true);
  });
});
