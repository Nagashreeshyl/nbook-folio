import { randomUUID } from "crypto";
import { requirePermission } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, badRequest, tooMany } from "@/lib/api/http";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Without a Firebase Storage bucket, file bytes live in a Firestore document
// (free Spark plan). Firestore caps a doc at ~1 MiB and base64 inflates by
// ~33%, so the raw payload must stay under ~700 KB.
const FIRESTORE_BLOB_CAP = 700 * 1024;

function effectiveLimit(base: number): number {
  const usingFirestoreBlobs =
    !process.env.FIREBASE_STORAGE_BUCKET &&
    Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.FIRESTORE_EMULATOR_HOST,
    );
  return usingFirestoreBlobs ? Math.min(base, FIRESTORE_BLOB_CAP) : base;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
const FILE_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/json",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

function sanitiseFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\p{Letter}\p{Number}._-]+/gu, "_")
      .slice(-80) || "file"
  );
}

/**
 * Uploads an image or attachment and returns the storage path + URL.
 *
 * Storage backend (chosen by env): Firebase Storage when FIREBASE_STORAGE_BUCKET
 * is set, otherwise the bytes are kept in a Firestore document as base64 so the
 * feature works on the free Spark plan (capped at ~700 KB), or the local file
 * store when Firebase is not configured at all.
 */
export async function POST(request: Request, ctx: { params: Promise<{ bookId: string }> }) {
  try {
    const { bookId } = await ctx.params;
    const session = await requirePermission(bookId, "write");

    const driver = getStorageDriver();
    const book = await driver.getBook(bookId);
    if (!book) throw badRequest("Notebook not found.");
    if (!book.settings.allowStorage) {
      throw badRequest("File uploads are disabled for this notebook.");
    }

    // formData() buffers the whole body, so the length must be known *before*
    // it runs: a chunked/length-less request would otherwise be read into
    // memory unbounded. Browsers and curl always send it for FormData.
    const rawLength = request.headers.get("content-length");
    const declared = rawLength === null ? Number.NaN : Number(rawLength);
    if (!Number.isFinite(declared)) {
      throw badRequest("Upload must declare its content length.");
    }
    if (declared > MAX_FILE_BYTES + 64_000) throw tooMany("File is too large.");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("Attach a file field.");

    const isImage = IMAGE_TYPES.has(file.type);
    const isAllowedFile = FILE_TYPES.has(file.type);
    if (!isImage && !isAllowedFile) {
      throw badRequest(`Unsupported file type: ${file.type || "unknown"}.`);
    }
    const limit = effectiveLimit(isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES);
    if (file.size > limit) {
      const mb = limit >= 1024 * 1024 ? `${Math.round(limit / 1024 / 1024)} MB` : `${Math.round(limit / 1024)} KB`;
      throw badRequest(`File exceeds the ${mb} limit.`);
    }
    if (file.size === 0) throw badRequest("File is empty.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = sanitiseFilename(file.name);
    const storagePath = `${bookId}/${randomUUID()}-${filename}`;
    const stored = await driver.putFile(storagePath, { data: buffer, mime: file.type });

    return json(
      {
        storagePath: stored.path,
        // Always served through our authenticated route so access is checked.
        url: `/api/files/${stored.path.split("/").map(encodeURIComponent).join("/")}`,
        name: filename,
        size: stored.size,
        mime: stored.mime,
        sessionId: session.sessionId,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
