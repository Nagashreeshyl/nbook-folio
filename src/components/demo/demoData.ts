import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import type {
  Block,
  BlockContentByType,
  BlockType,
  Book,
  Chapter,
  Page,
} from "@/types/models";

/**
 * Static showcase content for the `/demo` route.
 *
 * It lives in the bundle only — nothing here is ever written to storage, so
 * the demo can never appear in a notebook library.
 */

export const demoBook: Book = {
  id: "demo",
  name: "NBOOK Field Guide",
  slug: "demo",
  description: "A read-only tour of everything NBOOK can hold.",
  cover: null,
  createdAt: 0,
  updatedAt: 0,
  settings: { ...DEFAULT_BOOK_SETTINGS, pageSound: false, pageAnimation: "subtle" },
};

export const demoChapters: Chapter[] = [
  {
    id: "demo-ch-1",
    bookId: "demo",
    title: "Words on paper",
    description: "",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-ch-2",
    bookId: "demo",
    title: "Code, math & structure",
    description: "",
    order: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-ch-3",
    bookId: "demo",
    title: "Canvas & media",
    description: "",
    order: 2,
    createdAt: 0,
    updatedAt: 0,
  },
];

export const demoPages: Page[] = [
  {
    id: "demo-pg-1",
    bookId: "demo",
    chapterId: "demo-ch-1",
    title: "Welcome to NBOOK",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-pg-2",
    bookId: "demo",
    chapterId: "demo-ch-1",
    title: "Lists, quotes & callouts",
    order: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-pg-3",
    bookId: "demo",
    chapterId: "demo-ch-2",
    title: "Highlighted code & math",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-pg-4",
    bookId: "demo",
    chapterId: "demo-ch-2",
    title: "Tables & task lists",
    order: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "demo-pg-5",
    bookId: "demo",
    chapterId: "demo-ch-3",
    title: "Drawings, images & files",
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  },
];

const demoImage =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="380" viewBox="0 0 960 380">
      <rect width="960" height="380" fill="#f0eee9"/>
      <rect x="24" y="24" width="912" height="332" rx="10" fill="#fbf9f4" stroke="#c6c6cb"/>
      <rect x="24" y="24" width="14" height="332" rx="7" fill="#ffdcc2"/>
      <text x="72" y="150" font-family="Georgia, serif" font-size="52" fill="#080c12">Archival paper,</text>
      <text x="72" y="216" font-family="Georgia, serif" font-size="52" fill="#8c4f10">rendered in a browser.</text>
      <text x="72" y="286" font-family="monospace" font-size="20" fill="#76777c">grain · rule · folio</text>
    </svg>`,
  );

const demoFile = "data:text/plain;charset=utf-8," + encodeURIComponent("NBOOK field notes — a sample attachment.");

function block<T extends BlockType>(
  id: string,
  pageId: string,
  type: T,
  content: BlockContentByType[T],
  order: number,
): Block<T> {
  return {
    id,
    bookId: "demo",
    pageId,
    type,
    content,
    order,
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
  };
}

const rich = (html: string) => ({ html });

export const demoBlocks: Block[] = [
  /* ---- Welcome to NBOOK ---- */
  block("d-b1", "demo-pg-1", "heading", rich("<h2>A notebook that behaves like a book</h2>"), 0),
  block(
    "d-b2",
    "demo-pg-1",
    "paragraph",
    rich(
      "<p>NBOOK is organised as <strong>book → chapter → page → block</strong>. Every page is a folio of typed blocks, not a wall of text. Nothing here is a screenshot — <em>all of it is live</em>.</p>",
    ),
    1,
  ),
  block(
    "d-b3",
    "demo-pg-1",
    "paragraph",
    rich(
      '<p>Select text to reveal <mark>the formatting bar</mark>, drop a link, or type <code>/</code> in edit mode to open the block palette.</p>',
    ),
    2,
  ),
  block("d-b4", "demo-pg-1", "subheading", rich("<h3>What is in the box</h3>"), 3),
  block(
    "d-b5",
    "demo-pg-1",
    "bulletList",
    rich(
      "<ul><li><p>Fifteen block types</p></li><li><p>Owner, editor and viewer keys</p></li><li><p>Live collaboration over SSE</p></li><li><p>Export to Markdown, HTML or JSON</p></li></ul>",
    ),
    4,
  ),
  block(
    "d-b6",
    "demo-pg-1",
    "callout",
    { ...rich("<p>This panel is a <strong>callout</strong>. Tones: note, tip, warning and danger.</p>"), tone: "tip" },
    5,
  ),
  block(
    "d-b7",
    "demo-pg-1",
    "quote",
    { ...rich("<p>Paper keeps its secrets until you turn it.</p>"), citation: "Field notes, folio 12" },
    6,
  ),
  block("d-b8", "demo-pg-1", "divider", {}, 7),

  /* ---- Lists, quotes & callouts ---- */
  block("d-b9", "demo-pg-2", "heading", rich("<h2>Ordered and checkable</h2>"), 0),
  block(
    "d-b10",
    "demo-pg-2",
    "numberedList",
    rich("<ol><li><p>Unlock the notebook with a key</p></li><li><p>Write on any page</p></li><li><p>Share an editor key</p></li></ol>"),
    1,
  ),
  block(
    "d-b11",
    "demo-pg-2",
    "checklist",
    rich(
      '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked disabled></label><div><p>Read the field guide</p></div></li><li data-checked="false"><label><input type="checkbox" disabled></label><div><p>Create your own notebook</p></div></li></ul>',
    ),
    2,
  ),
  block(
    "d-b12",
    "demo-pg-2",
    "callout",
    { ...rich("<p>Viewers can read every block, but cannot change a word.</p>"), tone: "note" },
    3,
  ),
  block(
    "d-b13",
    "demo-pg-2",
    "callout",
    { ...rich("<p>Keys are stored as SHA-256 hashes — never in plain text.</p>"), tone: "warning" },
    4,
  ),

  /* ---- Code & math ---- */
  block("d-b14", "demo-pg-3", "heading", rich("<h2>Syntax-highlighted code</h2>"), 0),
  block(
    "d-b15",
    "demo-pg-3",
    "code",
    {
      language: "typescript",
      filename: "folio.ts",
      lineNumbers: true,
      code: [
        "interface Folio {",
        "  pageId: string;",
        "  blocks: Block[];",
        "}",
        "",
        "export function sortBlocks(blocks: Block[]): Block[] {",
        "  return [...blocks].sort((a, b) => a.order - b.order);",
        "}",
      ].join("\n"),
    },
    1,
  ),
  block(
    "d-b16",
    "demo-pg-3",
    "paragraph",
    rich("<p>Copy grabs the raw source — there is deliberately no Run button.</p>"),
    2,
  ),
  block("d-b17", "demo-pg-3", "subheading", rich("<h3>Rendered LaTeX</h3>"), 3),
  block(
    "d-b18",
    "demo-pg-3",
    "math",
    { latex: "e^{i\\pi} + 1 = 0", display: true },
    4,
  ),
  block(
    "d-b19",
    "demo-pg-3",
    "math",
    { latex: "c = \\sqrt{a^2 + b^2}", display: true },
    5,
  ),

  /* ---- Tables & tasks ---- */
  block("d-b20", "demo-pg-4", "heading", rich("<h2>Tables</h2>"), 0),
  block(
    "d-b21",
    "demo-pg-4",
    "table",
    {
      html:
        '<table><tbody><tr><th><p>Role</p></th><th><p>Read</p></th><th><p>Write</p></th><th><p>Manage</p></th></tr>' +
        '<tr><td><p>Owner</p></td><td><p>Yes</p></td><td><p>Yes</p></td><td><p>Yes</p></td></tr>' +
        '<tr><td><p>Editor</p></td><td><p>Yes</p></td><td><p>Yes</p></td><td><p>No</p></td></tr>' +
        '<tr><td><p>Viewer</p></td><td><p>Yes</p></td><td><p>No</p></td><td><p>No</p></td></tr></tbody></table>',
      caption: "Every check happens server-side.",
    },
    1,
  ),
  block(
    "d-b22",
    "demo-pg-4",
    "paragraph",
    rich("<p>Pages are ordered by chapter, chapters by the owner or an editor — drag handles appear in edit mode.</p>"),
    2,
  ),

  /* ---- Canvas & media ---- */
  block("d-b23", "demo-pg-5", "heading", rich("<h2>Freehand canvas</h2>"), 0),
  block(
    "d-b24",
    "demo-pg-5",
    "paragraph",
    rich("<p>A canvas block stores a structured tldraw snapshot, so drawings stay crisp and editable. This one is empty — open it in edit mode to start drawing.</p>"),
    1,
  ),
  block("d-b25", "demo-pg-5", "canvas", { snapshot: null, height: 300 }, 2),
  block("d-b26", "demo-pg-5", "subheading", rich("<h3>Images & attachments</h3>"), 3),
  block(
    "d-b27",
    "demo-pg-5",
    "image",
    { url: demoImage, alt: "Stylised sheet of archival paper", caption: "Uploaded media renders inline." },
    4,
  ),
  block(
    "d-b28",
    "demo-pg-5",
    "file",
    { url: demoFile, name: "field-notes.txt", size: 42, mime: "text/plain" },
    5,
  ),
];

export function blocksForDemoPage(pageId: string): Block[] {
  return demoBlocks
    .filter((block) => block.pageId === pageId)
    .sort((a, b) => a.order - b.order);
}
