import { describe, expect, it } from "vitest";
import { contentSchemaFor, defaultContentFor, sanitizeRichText } from "@/lib/blocks/schema";
import { BLOCK_TYPES } from "@/types/models";

describe("sanitizeRichText", () => {
  it("removes script tags entirely", () => {
    expect(sanitizeRichText('<p>hi</p><script>alert(1)</script>')).toBe("<p>hi</p>");
  });

  it("strips event handlers", () => {
    const out = sanitizeRichText('<p onclick="steal()">x</p>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("x");
  });

  it("blocks javascript: urls", () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("keeps safe formatting", () => {
    const html = '<p><strong>bold</strong> <em>it</em> <u>up</u> <mark>hi</mark></p>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps lists, tables and checkboxes", () => {
    expect(sanitizeRichText("<ul><li>a</li></ul>")).toContain("<li>a</li>");
    expect(sanitizeRichText("<table><tr><td>c</td></tr></table>")).toContain("<td>c</td>");
    expect(
      sanitizeRichText('<ul data-type="taskList"><li data-checked="true"><input type="checkbox" checked>t</li></ul>'),
    ).toContain('data-checked="true"');
  });

  it("does not keep iframes", () => {
    expect(sanitizeRichText('<iframe src="https://evil"></iframe>')).not.toContain("iframe");
  });
});

describe("defaultContentFor", () => {
  it("produces valid content for every declared block type", () => {
    for (const type of BLOCK_TYPES) {
      const content = defaultContentFor(type);
      expect(() => contentSchemaFor(type).parse(content)).not.toThrow();
    }
  });

  it("gives code blocks a safe default language", () => {
    const content = defaultContentFor("code") as { language: string; lineNumbers: boolean };
    expect(content.language).toBe("plaintext");
    expect(content.lineNumbers).toBe(true);
  });
});

describe("contentSchemaFor", () => {
  it("sanitises rich text on write", () => {
    const schema = contentSchemaFor("paragraph");
    const parsed = schema.parse({ html: "<p>a</p><script>x()</script>" }) as { html: string };
    expect(parsed.html).toBe("<p>a</p>");
  });

  it("rejects an unknown block type", () => {
    expect(() => contentSchemaFor("nope" as never)).toThrow(/Unknown block type/);
  });

  it("rejects oversized code", () => {
    const schema = contentSchemaFor("code");
    const result = schema.safeParse({ language: "text", code: "x".repeat(200_001), lineNumbers: true });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid language identifier", () => {
    const schema = contentSchemaFor("code");
    const result = schema.safeParse({ language: "py thon", code: "", lineNumbers: true });
    expect(result.success).toBe(false);
  });

  it("applies defaults for optional fields", () => {
    const parsed = contentSchemaFor("callout").parse({ html: "<p>note</p>" }) as { tone: string };
    expect(parsed.tone).toBe("note");

    const code = contentSchemaFor("code").parse({ code: "x" }) as { language: string };
    expect(code.language).toBe("plaintext");
  });

  it("caps canvas snapshots", () => {
    const schema = contentSchemaFor("canvas");
    const huge = { schemaVersion: 1, store: { blob: "x".repeat(1_500_001) } };
    expect(schema.safeParse({ snapshot: huge }).success).toBe(false);
    expect(schema.safeParse({ snapshot: null }).success).toBe(true);
  });
});
