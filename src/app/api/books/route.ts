import { z } from "zod";
import { NextResponse } from "next/server";
import { generateAccessKey, hashAccessKey } from "@/lib/access/keys";
import { getStorageDriver } from "@/lib/storage";
import { handleError, json, parseBody } from "@/lib/api/http";

export const runtime = "nodejs";

const createBookSchema = z.object({
  name: z.string().trim().min(1, "Give your notebook a name.").max(120),
  description: z.string().trim().max(2000).optional().default(""),
  /** Optional localised seed titles — a fresh notebook opens ready to write. */
  chapterTitle: z.string().trim().min(1).max(200).optional(),
  pageTitle: z.string().trim().min(1).max(200).optional(),
});

/**
 * Creates a notebook and its single owner access key.
 *
 * No account is involved: the plaintext owner key is returned exactly once and
 * only its SHA-256 hash is persisted.
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, createBookSchema);
    const driver = getStorageDriver();

    const book = await driver.createBook({
      name: input.name,
      description: input.description,
    });

    // Seed the first chapter and page so the notebook is never an empty shell.
    const chapter = await driver.createChapter(book.id, {
      title: input.chapterTitle?.trim() || "Chapter 1",
    });
    const page = await driver.createPage(book.id, chapter.id, {
      title: input.pageTitle?.trim() || "Untitled page",
    });

    const plaintext = generateAccessKey("owner");
    const keyRecord = await driver.createAccessKey({
      bookId: book.id,
      role: "owner",
      label: "Owner key",
      keyHash: hashAccessKey(plaintext),
    });

    return json(
      {
        book,
        chapter,
        page,
        ownerKey: { id: keyRecord.id, plaintext, role: "owner" as const },
      },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function GET() {
  try {
    const driver = getStorageDriver();
    const books = await driver.listBooks();
    return json({ books });
  } catch (error) {
    return handleError(error);
  }
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
