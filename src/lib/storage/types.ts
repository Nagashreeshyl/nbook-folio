import { DEFAULT_BOOK_SETTINGS } from "@/types/models";
import type {
  AccessKey,
  Block,
  BlockContentByType,
  BlockType,
  Book,
  BookSettings,
  Chapter,
  Page,
  PresenceEntry,
  Role,
} from "@/types/models";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type StorageErrorCode =
  | "not_found"
  | "conflict"
  | "unavailable"
  | "invalid";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

export const notFound = (what: string) => new StorageError("not_found", `${what} not found`);
export const conflict = (message: string) => new StorageError("conflict", message);

/* ------------------------------------------------------------------ */
/* Realtime events                                                     */
/* ------------------------------------------------------------------ */

export type BookRealtimeEvent =
  | { type: "book"; action: "updated" | "deleted"; book: Book }
  | { type: "chapter"; action: "upsert" | "deleted"; items: Chapter[] }
  | { type: "page"; action: "upsert" | "deleted"; items: Page[] };

export type PageRealtimeEvent =
  | { type: "block"; action: "upsert" | "deleted"; items: Block[] }
  | { type: "page"; action: "deleted" };

export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ */
/* Driver interface                                                    */
/* ------------------------------------------------------------------ */

/** Book updates allow partial settings patches. */
export interface BookPatch extends Partial<Omit<Book, "settings">> {
  settings?: Partial<BookSettings>;
}

/**
 * Notebooks written before a setting existed arrive without that key.
 * Merging on the way out keeps readers (and the settings form) exhaustive.
 * The pre-V1 animation name `flip` is read back as `realistic`.
 */
export function hydrateBook(book: Book): Book {
  const settings = { ...DEFAULT_BOOK_SETTINGS, ...book.settings };
  if ((settings.pageAnimation as string) === "flip") settings.pageAnimation = "realistic";
  return { ...book, settings };
}

export interface CreateBookInput {
  name: string;
  description?: string;
}

export interface CreateBlockInput<T extends BlockType = BlockType> {
  type: T;
  content: BlockContentByType[T];
  /** Insert position. Defaults to end of page. */
  index?: number;
  afterBlockId?: string;
}

export interface FilePayload {
  data: Buffer;
  mime: string;
}

export interface StoredFile {
  path: string;
  url: string;
  mime: string;
  size: number;
}

/**
 * Persistence abstraction.
 *
 * Two production-grade implementations exist:
 *  - `firestore` — Firebase Firestore + Storage (production / emulator)
 *  - `local`     — JSON file store used only when Firebase is not configured
 *
 * Route handlers only ever talk to this interface, never to a concrete
 * vendor SDK directly.
 */
export interface StorageDriver {
  readonly kind: "firestore" | "local";

  /* books */
  createBook(input: CreateBookInput): Promise<Book>;
  getBook(bookId: string): Promise<Book | null>;
  getBookBySlug(slug: string): Promise<Book | null>;
  listBooks(): Promise<Book[]>;
  updateBook(bookId: string, patch: BookPatch): Promise<Book>;
  deleteBook(bookId: string): Promise<void>;

  /* chapters */
  listChapters(bookId: string): Promise<Chapter[]>;
  getChapter(bookId: string, chapterId: string): Promise<Chapter | null>;
  createChapter(bookId: string, input: { title: string; description?: string }): Promise<Chapter>;
  updateChapter(bookId: string, chapterId: string, patch: Partial<Chapter>): Promise<Chapter>;
  deleteChapter(bookId: string, chapterId: string): Promise<void>;
  reorderChapters(bookId: string, orderedIds: string[]): Promise<Chapter[]>;

  /* pages */
  listPages(bookId: string): Promise<Page[]>;
  getPage(bookId: string, pageId: string): Promise<Page | null>;
  createPage(bookId: string, chapterId: string, input: { title: string }): Promise<Page>;
  updatePage(bookId: string, pageId: string, patch: Partial<Page>): Promise<Page>;
  deletePage(bookId: string, pageId: string): Promise<void>;
  duplicatePage(bookId: string, pageId: string): Promise<Page>;
  reorderPages(bookId: string, chapterId: string, orderedIds: string[]): Promise<Page[]>;

  /* blocks */
  listBlocks(bookId: string, pageId: string): Promise<Block[]>;
  /** Every block in a notebook — used by search and export. */
  listBlocksForBook(bookId: string): Promise<Block[]>;
  getBlock(bookId: string, pageId: string, blockId: string): Promise<Block | null>;
  createBlock(bookId: string, pageId: string, input: CreateBlockInput): Promise<Block>;
  /**
   * Optimistic concurrency: `baseRev` must match the stored revision,
   * otherwise a `conflict` StorageError is thrown and the caller must
   * reload before retrying.
   */
  updateBlock(
    bookId: string,
    pageId: string,
    blockId: string,
    patch: { content: unknown },
    baseRev: number,
    sessionId?: string,
  ): Promise<Block>;
  deleteBlock(bookId: string, pageId: string, blockId: string): Promise<void>;
  reorderBlocks(bookId: string, pageId: string, orderedIds: string[]): Promise<Block[]>;
  duplicateBlock(bookId: string, pageId: string, blockId: string): Promise<Block>;

  /* access keys */
  listAccessKeys(bookId: string): Promise<AccessKey[]>;
  createAccessKey(input: {
    bookId: string;
    role: Role;
    label: string;
    keyHash: string;
  }): Promise<AccessKey>;
  revokeAccessKey(bookId: string, keyId: string): Promise<AccessKey>;
  findActiveKeyByHash(bookId: string, keyHash: string): Promise<AccessKey | null>;
  touchAccessKey(bookId: string, keyId: string): Promise<void>;

  /* files (Firebase Storage in production) */
  putFile(path: string, file: FilePayload): Promise<StoredFile>;
  readFile(path: string): Promise<FilePayload | null>;
  deleteFile(path: string): Promise<void>;

  /* realtime */
  subscribeBook(bookId: string, cb: (event: BookRealtimeEvent) => void): Unsubscribe;
  subscribePage(bookId: string, pageId: string, cb: (event: PageRealtimeEvent) => void): Unsubscribe;

  /* presence */
  setPresence(bookId: string, entry: PresenceEntry): Promise<void>;
  listPresence(bookId: string): Promise<PresenceEntry[]>;
  clearPresence(bookId: string, sessionId: string): Promise<void>;
}
