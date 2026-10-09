import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/ai/markdown";

describe("renderMarkdown", () => {
  it("renders headings collapsed to h3+", () => {
    expect(renderMarkdown("## Core Idea")).toBe("<h3>Core Idea</h3>");
    expect(renderMarkdown("# Title")).toBe("<h3>Title</h3>");
    expect(renderMarkdown("### Deep")).toBe("<h4>Deep</h4>");
  });

  it("renders bold and italic", () => {
    expect(renderMarkdown("**Aarav** is _brave_")).toBe(
      "<p><strong>Aarav</strong> is <em>brave</em></p>",
    );
  });

  it("does not italicise underscores inside an identifier", () => {
    const out = renderMarkdown("Set GROQ_API_KEY or OPENROUTER_API_KEY.");
    expect(out).toBe("<p>Set GROQ_API_KEY or OPENROUTER_API_KEY.</p>");
    expect(out).not.toContain("<em>");
  });

  it("renders bullet and ordered lists", () => {
    expect(renderMarkdown("- one\n- two")).toBe("<ul>\n<li>one</li>\n<li>two</li>\n</ul>");
    expect(renderMarkdown("1. first\n2. second")).toBe(
      "<ol>\n<li>first</li>\n<li>second</li>\n</ol>",
    );
  });

  it("renders inline and fenced code", () => {
    expect(renderMarkdown("use `print()`")).toBe("<p>use <code>print()</code></p>");
    expect(renderMarkdown("```\nprint(1)\n```")).toBe("<pre><code>print(1)</code></pre>");
  });

  it("groups consecutive plain lines into one paragraph", () => {
    expect(renderMarkdown("line one\nline two")).toBe("<p>line one line two</p>");
  });

  it("separates paragraphs on a blank line", () => {
    expect(renderMarkdown("para one\n\npara two")).toBe("<p>para one</p>\n<p>para two</p>");
  });

  it("renders safe http links and ignores other schemes", () => {
    expect(renderMarkdown("[docs](https://example.com)")).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">docs</a>',
    );
    // A javascript: link is not matched by the http(s)-only pattern, so it
    // stays as inert escaped text.
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("<a ");
  });

  it("escapes HTML so markup in the text cannot inject nodes", () => {
    const out = renderMarkdown("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes an img onerror payload", () => {
    const out = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("keeps bold markers out of an escaped angle bracket", () => {
    const out = renderMarkdown("**bold** and <b>raw</b>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });
});
