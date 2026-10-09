/**
 * Core NBOOK domain model.
 *
 * Hierarchy: Book -> Chapter -> Page -> Block
 */

export type Role = "owner" | "editor" | "viewer";

/** Server-enforced capabilities. Frontend never decides these. */
export type Permission = "read" | "write" | "manage";

export const ROLE_PERMISSIONS: Record<Role, ReadonlyArray<Permission>> = {
  owner: ["read", "write", "manage"],
  editor: ["read", "write"],
  viewer: ["read"],
};

export type BlockType =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bulletList"
  | "numberedList"
  | "checklist"
  | "quote"
  | "callout"
  | "divider"
  | "table"
  | "code"
  | "canvas"
  | "image"
  | "file"
  | "math";

/** Ordered so the add-block palette renders in a stable, meaningful order. */
export const BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading",
  "subheading",
  "bulletList",
  "numberedList",
  "checklist",
  "quote",
  "callout",
  "divider",
  "table",
  "code",
  "canvas",
  "image",
  "file",
  "math",
] as const;

/** Text carried by Tiptap-backed blocks. Stored as sanitized HTML. */
export type RichTextHtml = string;

export interface BlockContentByType {
  paragraph: { html: RichTextHtml };
  heading: { html: RichTextHtml };
  subheading: { html: RichTextHtml };
  bulletList: { html: RichTextHtml };
  numberedList: { html: RichTextHtml };
  checklist: { html: RichTextHtml };
  quote: { html: RichTextHtml; citation?: string };
  callout: { html: RichTextHtml; tone: CalloutTone };
  divider: { label?: string };
  table: { html: RichTextHtml; caption?: string };
  code: {
    language: string;
    code: string;
    filename?: string;
    lineNumbers: boolean;
  };
  canvas: {
    /** Structured tldraw store snapshot (JSON records), never a raster blob. */
    snapshot: CanvasSnapshot | null;
    /** Persisted canvas document size hint. */
    width?: number;
    height?: number;
  };
  image: {
    storagePath?: string;
    url?: string;
    width?: number;
    height?: number;
    caption?: string;
    alt?: string;
    status?: "ready" | "uploading" | "error" | "unavailable";
  };
  file: {
    storagePath?: string;
    url?: string;
    name: string;
    size: number;
    mime: string;
    status?: "ready" | "uploading" | "error" | "unavailable";
  };
  math: { latex: string; display: boolean };
}

export type CalloutTone = "note" | "tip" | "warning" | "danger";

export type BlockContent<T extends BlockType = BlockType> = T extends BlockType
  ? BlockContentByType[T]
  : never;

export interface Block<T extends BlockType = BlockType> {
  id: string;
  bookId: string;
  pageId: string;
  type: T;
  order: number;
  content: BlockContentByType[T];
  /** Optimistic-concurrency revision. Bumped on every write. */
  rev: number;
  createdAt: number;
  updatedAt: number;
  /** Session id of last writer (no personal data). */
  updatedBy?: string;
}

export interface BookSettings {
  /** `realistic` is the full sheet-flip; notebooks saved before V1 stored `flip`. */
  pageAnimation: "none" | "subtle" | "realistic";
  /** Rustle the page on navigation. Independent of the animation setting. */
  pageSound: boolean;
  allowExport: boolean;
  allowViewerSearch: boolean;
  allowViewerCopy: boolean;
  allowStorage: boolean;
  theme: "eggshell" | "parchment" | "dark";
  language: string;
  direction: "auto" | "ltr" | "rtl";
  fontScale: "small" | "medium" | "large";
}

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  pageAnimation: "subtle",
  pageSound: false,
  allowExport: true,
  allowViewerSearch: true,
  allowViewerCopy: true,
  allowStorage: true,
  theme: "eggshell",
  language: "en",
  direction: "auto",
  fontScale: "medium",
};

export interface Book {
  id: string;
  name: string;
  slug: string;
  description: string;
  cover: string | null;
  createdAt: number;
  updatedAt: number;
  settings: BookSettings;
  /**
   * Optional URL-shareable PINs. The author sets a 4-digit read PIN and/or a
   * 5-digit edit PIN; opening `/b/<slug>/<pin>` unlocks the notebook with the
   * matching role. Only the SHA-256 hash is ever stored — never the digits.
   */
  readPinHash?: string | null;
  editPinHash?: string | null;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  description: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Page {
  id: string;
  bookId: string;
  chapterId: string;
  title: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface AccessKey {
  id: string;
  bookId: string;
  /** SHA-256 of the plaintext key. Plaintext is never stored. */
  keyHash: string;
  role: Role;
  label: string;
  createdAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
}

/** Only ever returned once, at creation time. */
export interface CreatedAccessKey extends Omit<AccessKey, "keyHash"> {
  plaintext: string;
}

export interface PresenceEntry {
  sessionId: string;
  name: string;
  role: Role;
  /** Page the collaborator is currently viewing, if any. */
  pageId: string | null;
  color: string;
  updatedAt: number;
}

export interface SessionClaims {
  bookId: string;
  keyId: string;
  role: Role;
  /** Anonymous per-tab identity used for presence + edit attribution. */
  sessionId: string;
  displayName: string;
  iat: number;
  exp: number;
}

/** Structured tldraw persistence payload (records, not base64). */
export interface CanvasSnapshot {
  schemaVersion: number;
  store: Record<string, unknown>;
  documents?: Record<string, unknown>;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

export interface SearchHit {
  bookId: string;
  bookName: string;
  chapterId: string;
  chapterTitle: string;
  pageId: string;
  pageTitle: string;
  blockId: string;
  blockType: BlockType;
  /** Short excerpt around the match. */
  snippet: string;
  score: number;
  matchKind: "title" | "text" | "code";
}
