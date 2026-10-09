/**
 * Minimal, dependency-free Markdown → HTML renderer for AI Assist output.
 *
 * The model replies in Markdown (headings, bold, lists, code), which looked
 * like raw syntax when rendered as plain text. This converts the common
 * constructs into a small, fixed set of HTML tags.
 *
 * SECURITY: every input character is HTML-escaped *first*, so no markup in the
 * model's text can inject nodes. Only the tags this function emits can ever
 * reach the DOM — there is no path for raw HTML to pass through.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Inline spans: code, bold, italic, links. Operates on already-escaped text. */
function renderInline(text: string): string {
  let out = text;
  // Inline code first so its contents are not re-processed.
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // Bold (**x** or __x__) before italic so the inner markers are consumed.
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic. Asterisks: *x*. Underscores only at word boundaries so an
  // identifier like GROQ_API_KEY is never turned into emphasis.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?![\w])/g, "$1<em>$2</em>");
  // Links [text](url) — only http(s) URLs are allowed.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  return out;
}

export function renderMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown.replace(/\r\n/g, "\n"));
  const lines = escaped.split("\n");
  const html: string[] = [];

  let inFence = false;
  let fenceLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" ")).trim()}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const fenceMatch = /^```/.test(line.trim());
    if (fenceMatch) {
      if (inFence) {
        html.push(`<pre><code>${fenceLines.join("\n")}</code></pre>`);
        fenceLines = [];
        inFence = false;
      } else {
        flushParagraph();
        closeList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      // Collapse to h3/h4 so a block of AI text never outranks the page title.
      const level = Math.min(6, Math.max(3, heading[1]!.length + 1));
      html.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${renderInline(bullet[1]!)}</li>`);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${renderInline(ordered[1]!)}</li>`);
      continue;
    }

    const quote = /^&gt;\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInline(quote[1]!)}</blockquote>`);
      continue;
    }

    // Plain line → part of the current paragraph.
    closeList();
    paragraph.push(trimmed);
  }

  if (inFence && fenceLines.length) {
    html.push(`<pre><code>${fenceLines.join("\n")}</code></pre>`);
  }
  flushParagraph();
  closeList();

  return html.join("\n");
}
