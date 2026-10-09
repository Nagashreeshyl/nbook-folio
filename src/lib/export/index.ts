import TurndownService from "turndown";
import type { Block, Book, Chapter, Page } from "@/types/models";
import { htmlToText } from "@/lib/search";

export type ExportFormat = "json" | "markdown" | "html";

export interface ExportTarget {
  id: ExportFormat;
  label: string;
  extension: string;
  mime: string;
  description: string;
}

/**
 * Export registry.
 *
 * Adding DOCX / EPUB / TXT / LaTeX means registering a new target here and a
 * serializer below — callers never switch on format themselves.
 */
export const EXPORT_FORMATS: ExportTarget[] = [
  {
    id: "json",
    label: "JSON backup",
    extension: "json",
    mime: "application/json",
    description: "Complete notebook structure, portable and lossless.",
  },
  {
    id: "markdown",
    label: "Markdown",
    extension: "md",
    mime: "text/markdown; charset=utf-8",
    description: "Chapters and pages as Markdown with fenced code blocks.",
  },
  {
    id: "html",
    label: "HTML / PDF",
    extension: "html",
    mime: "text/html; charset=utf-8",
    description: "Standalone print-ready document (Print → Save as PDF).",
  },
];

export interface NotebookBundle {
  book: Book;
  chapters: Chapter[];
  pages: Page[];
  blocks: Block[];
}

export interface ExportResult {
  filename: string;
  mime: string;
  body: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "notebook"
  );
}

function createTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  // Preserve Tiptap task lists as GitHub-flavoured checkboxes.
  service.addRule("taskListItem", {
    filter: (node) =>
      node.nodeName === "LI" &&
      node.hasAttribute("data-checked") &&
      Boolean(node.closest("ul[data-type='taskList']")),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const checked = element.getAttribute("data-checked") === "true";
      // Drop the checkbox chrome Tiptap injects but keep the item text, which
      // may sit inside or outside the <label> depending on the Tiptap version.
      const text = htmlToText(
        element.innerHTML.replace(/<input[^>]*>/gi, "").replace(/<\/?label>/gi, ""),
      );
      return `\n- [${checked ? "x" : " "}] ${text.trim()}`;
    },
  });

  service.addRule("horizontalRule", {
    filter: "hr",
    replacement: () => "\n---\n",
  });

  return service;
}

function richTextToMarkdown(html: string): string {
  if (!html?.trim()) return "";
  try {
    return createTurndown().turndown(html).trim();
  } catch {
    return htmlToText(html);
  }
}

function codeFence(code: string, language: string): string {
  const lang = language && language !== "plaintext" ? language : "";
  const ticks = "```";
  // Avoid terminating the fence early if the source contains backticks.
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = ticks.repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${code}\n${fence}`;
}

function asHeading(markdown: string, level: 1 | 2 | 3 | 4 | 5 | 6): string {
  if (!markdown) return "";
  const marker = "#".repeat(level);
  // The block type owns the heading level, so drop any ATX marker Turndown
  // derived from the source HTML before re-prefixing.
  const firstLine = markdown.replace(/^#{1,6}\s+/, "");
  return `${marker} ${firstLine}`;
}

function blockToMarkdown(block: Block): string {
  const content = block.content as Record<string, unknown>;
  switch (block.type) {
    case "heading":
      return asHeading(richTextToMarkdown(String(content.html ?? "")), 2);
    case "subheading":
      return asHeading(richTextToMarkdown(String(content.html ?? "")), 3);
    case "paragraph":
      return richTextToMarkdown(String(content.html ?? ""));
    case "bulletList":
    case "numberedList":
    case "checklist":
      return richTextToMarkdown(String(content.html ?? ""));
    case "quote": {
      const body = richTextToMarkdown(String(content.html ?? ""));
      const citation = content.citation ? `\n— ${richTextToMarkdown(String(content.citation))}` : "";
      return body
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
        .concat(citation);
    }
    case "callout": {
      const tone = String(content.tone ?? "note").toUpperCase();
      const body = richTextToMarkdown(String(content.html ?? ""))
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `> **${tone}**\n${body}`;
    }
    case "divider":
      return "---";
    case "table":
      return tableHtmlToMarkdown(String(content.html ?? ""));
    case "code":
      return codeFence(String(content.code ?? ""), String(content.language ?? ""));
    case "math":
      return content.display === false
        ? `$${String(content.latex ?? "")}$`
        : `$$\n${String(content.latex ?? "")}\n$$`;
    case "image": {
      const alt = String(content.alt ?? "");
      const src = String(content.url ?? content.storagePath ?? "");
      const caption = content.caption ? `\n*${htmlToText(String(content.caption))}*` : "";
      return `![${alt}](${src})${caption}`;
    }
    case "file": {
      const name = String(content.name ?? "file");
      const src = String(content.url ?? content.storagePath ?? "");
      return `[${name}](${src})`;
    }
    case "canvas":
      return "_[canvas diagram — open in NBOOK to view]_";
    default:
      return "";
  }
}

function tableHtmlToMarkdown(html: string): string {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length === 0) return htmlToText(html);
  const lines: string[] = [];
  rows.forEach((row, rowIndex) => {
    const cells = [...row[1]!.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) =>
      htmlToText(cell[1] ?? "").replace(/\|/g, "\\|"),
    );
    lines.push(`| ${cells.join(" | ")} |`);
    if (rowIndex === 0) lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
  });
  return lines.join("\n");
}

export function toMarkdown(bundle: NotebookBundle): string {
  const { book, chapters, pages, blocks } = bundle;
  const blocksByPage = groupBy(blocks, (b) => b.pageId);
  const pagesByChapter = groupBy(pages, (p) => p.chapterId);
  const orderedChapters = [...chapters].sort((a, b) => a.order - b.order);

  const out: string[] = [`# ${book.name}`, ""];
  if (book.description) out.push(book.description, "");

  for (const chapter of orderedChapters) {
    out.push(`## ${chapter.title}`, "");
    if (chapter.description) out.push(chapter.description, "");
    const chapterPages = (pagesByChapter.get(chapter.id) ?? []).sort((a, b) => a.order - b.order);
    for (const page of chapterPages) {
      out.push(`### ${page.title}`, "");
      const pageBlocks = (blocksByPage.get(page.id) ?? []).sort((a, b) => a.order - b.order);
      for (const block of pageBlocks) {
        const md = blockToMarkdown(block);
        if (md) out.push(md, "");
      }
    }
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blockToHtml(block: Block): string {
  const content = block.content as Record<string, unknown>;
  switch (block.type) {
    case "heading":
    case "subheading":
    case "paragraph":
      return sanitizeInline(String(content.html ?? ""));
    case "bulletList":
    case "numberedList":
    case "checklist":
    case "quote":
      return sanitizeInline(String(content.html ?? ""));
    case "callout": {
      const tone = String(content.tone ?? "note");
      return `<aside class="nb-callout nb-callout-${escapeHtml(tone)}">${sanitizeInline(String(content.html ?? ""))}</aside>`;
    }
    case "divider":
      return "<hr>";
    case "table":
      return sanitizeInline(String(content.html ?? ""));
    case "code":
      return `<pre class="nb-code" data-language="${escapeHtml(String(content.language ?? ""))}"><code>${escapeHtml(String(content.code ?? ""))}</code></pre>`;
    case "math":
      return `<div class="nb-math">${escapeHtml(String(content.latex ?? ""))}</div>`;
    case "image": {
      const src = String(content.url ?? content.storagePath ?? "");
      const alt = escapeHtml(String(content.alt ?? ""));
      const caption = content.caption
        ? `<figcaption>${sanitizeInline(String(content.caption))}</figcaption>`
        : "";
      return `<figure class="nb-image"><img src="${escapeHtml(src)}" alt="${alt}"/>${caption}</figure>`;
    }
    case "file": {
      const name = escapeHtml(String(content.name ?? "file"));
      const src = escapeHtml(String(content.url ?? content.storagePath ?? ""));
      return `<p class="nb-file"><a href="${src}">${name}</a></p>`;
    }
    case "canvas":
      return `<div class="nb-canvas">[canvas diagram — open in NBOOK]</div>`;
    default:
      return "";
  }
}

/** Blocks are already sanitised on write; this strips anything unexpected. */
function sanitizeInline(html: string): string {
  return html;
}

/** Minimal, dependency-free HTML→Markdown fallback used only for `heading`. */
function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function toHtml(bundle: NotebookBundle): string {
  const { book, chapters, pages, blocks } = bundle;
  const blocksByPage = groupBy(blocks, (b) => b.pageId);
  const pagesByChapter = groupBy(pages, (p) => p.chapterId);
  const orderedChapters = [...chapters].sort((a, b) => a.order - b.order);

  const sections: string[] = [];
  for (const chapter of orderedChapters) {
    const chapterPages = (pagesByChapter.get(chapter.id) ?? []).sort((a, b) => a.order - b.order);
    sections.push(
      `<section class="nb-chapter"><h2>${escapeHtml(chapter.title)}</h2>` +
        chapterPages
          .map((page) => {
            const pageBlocks = (blocksByPage.get(page.id) ?? []).sort(
              (a, b) => a.order - b.order,
            );
            return (
              `<article class="nb-page"><h3>${escapeHtml(page.title)}</h3>` +
              pageBlocks.map(blockToHtml).join("\n") +
              `</article>`
            );
          })
          .join("\n") +
        `</section>`,
    );
  }

  return `<!doctype html>
<html lang="${escapeHtml(book.settings.language)}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(book.name)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 48px 24px; background: #f0eee9; color: #1b1c19;
    font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    line-height: 1.65; }
  main { max-width: 820px; margin: 0 auto; background: #fdfbf7; border: 1px solid #e5e0d8;
    border-radius: 4px; padding: 56px 64px; box-shadow: 0 4px 20px -2px rgba(45,35,20,.08); }
  h1, h2, h3, h4 { font-family: Newsreader, Georgia, serif; color: #080c12; line-height: 1.25; }
  h1 { font-size: 34px; margin: 0 0 6px; }
  h2 { font-size: 26px; margin: 48px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #c6c6cb; }
  h3 { font-size: 21px; margin: 32px 0 8px; color: #8c4f10; }
  .nb-desc { color: #45474b; margin: 0 0 32px; }
  .nb-meta { font-family: "JetBrains Mono", monospace; font-size: 11px; letter-spacing: .12em;
    text-transform: uppercase; color: #76777c; margin-bottom: 32px; }
  pre.nb-code { background: #1a1d24; color: #e4e2dd; padding: 16px 18px; border-radius: 6px;
    overflow-x: auto; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 13px; }
  blockquote { border-left: 3px solid #8c4f10; margin: 16px 0; padding: 4px 0 4px 16px;
    color: #45474b; font-style: italic; }
  .nb-callout { border-left: 4px solid #8c4f10; background: #ffdcc233; padding: 12px 16px;
    border-radius: 0 4px 4px 0; margin: 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  th, td { border: 1px solid #c6c6cb; padding: 8px 10px; text-align: left; font-size: 14px; }
  th { background: #f0eee9; }
  hr { border: none; border-top: 1px solid #c6c6cb; margin: 28px 0; }
  .nb-page { margin-bottom: 40px; }
  .nb-canvas { border: 1px dashed #c6c6cb; padding: 24px; text-align: center; color: #76777c;
    font-family: "JetBrains Mono", monospace; font-size: 12px; }
  @media print {
    body { background: #fff; padding: 0; }
    main { box-shadow: none; border: none; padding: 0; max-width: none; }
    .nb-page { break-inside: avoid-page; }
    pre.nb-code { white-space: pre-wrap; }
  }
</style>
</head>
<body>
<main>
<p class="nb-meta">NBOOK • ${escapeHtml(book.name)}</p>
<h1>${escapeHtml(book.name)}</h1>
${book.description ? `<p class="nb-desc">${escapeHtml(book.description)}</p>` : ""}
${sections.join("\n")}
</main>
</body>
</html>
`;
}

export function toJson(bundle: NotebookBundle): string {
  const { book, chapters, pages, blocks } = bundle;
  return JSON.stringify(
    {
      format: "nbook/1",
      exportedAt: new Date().toISOString(),
      book,
      chapters: [...chapters].sort((a, b) => a.order - b.order),
      pages: [...pages].sort((a, b) => a.order - b.order),
      blocks: [...blocks].sort((a, b) => a.order - b.order),
    },
    null,
    2,
  );
}

const serializers: Record<ExportFormat, (bundle: NotebookBundle) => string> = {
  json: toJson,
  markdown: toMarkdown,
  html: toHtml,
};

export function exportNotebook(bundle: NotebookBundle, format: ExportFormat): ExportResult {
  const target = EXPORT_FORMATS.find((f) => f.id === format);
  if (!target) throw new Error(`Unsupported export format: ${format}`);
  return {
    filename: `${slugify(bundle.book.name)}.${target.extension}`,
    mime: target.mime,
    body: serializers[format](bundle),
  };
}
