import { z } from "zod";
import { requireSessionForBook } from "@/lib/access/session";
import { getStorageDriver } from "@/lib/storage";
import { buildMessages, CODE_FEATURES, TEXT_FEATURES, type AIFeature } from "@/lib/ai/features";
import { buildNotebookContext } from "@/lib/ai/context";
import { runChat } from "@/lib/ai/router";
import { AIError, type ChatMessage } from "@/lib/ai/types";
import { htmlToText } from "@/lib/search";
import { handleError, json, parseBody, badRequest, unavailable } from "@/lib/api/http";
import type { Block } from "@/types/models";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALL_FEATURES = [...TEXT_FEATURES, ...CODE_FEATURES, "ask"] as const;

const requestSchema = z.object({
  bookId: z.string().min(1),
  feature: z.enum(ALL_FEATURES as unknown as [AIFeature, ...AIFeature[]]),
  selection: z.string().max(60_000).optional(),
  query: z.string().max(4_000).optional(),
  language: z.string().max(40).optional(),
  pageId: z.string().min(1).optional(),
  preferredProvider: z.string().max(40).optional(),
});

function pageContext(blocks: Block[]): string {
  return blocks
    .sort((a, b) => a.order - b.order)
    .slice(0, 30)
    .map((block) => {
      const content = block.content as Record<string, unknown>;
      if (block.type === "code") {
        return `\`\`\`${content.language ?? ""}\n${content.code ?? ""}\n\`\`\``;
      }
      if (block.type === "math") return String(content.latex ?? "");
      return htmlToText(String(content.html ?? ""));
    })
    .filter((text) => text.trim())
    .join("\n\n")
    .slice(0, 6_000);
}

/**
 * Single entry point for every AI feature.
 *
 * The browser never sees a provider key: it posts here, the router picks a
 * provider, falls back on failure, and the raw completion is returned.
 */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, requestSchema);
    await requireSessionForBook(input.bookId);

    if (input.feature === "ask" && !input.query?.trim()) {
      throw badRequest("Ask NBOOK needs a question.");
    }
    if (
      (TEXT_FEATURES.includes(input.feature) || CODE_FEATURES.includes(input.feature)) &&
      !input.selection?.trim()
    ) {
      throw badRequest("Select some content on the page first.");
    }

    const driver = getStorageDriver();
    const [book, chapters, pages, blocks] = await Promise.all([
      driver.getBook(input.bookId),
      driver.listChapters(input.bookId),
      driver.listPages(input.bookId),
      driver.listBlocksForBook(input.bookId),
    ]);
    if (!book) throw badRequest("Notebook not found.");

    let context = "";
    let sources: Awaited<ReturnType<typeof buildNotebookContext>>["sources"] = [];

    if (input.feature === "ask" && input.query) {
      const retrieved = buildNotebookContext(input.query, { book, chapters, pages, blocks });
      context = retrieved.rendered;
      sources = retrieved.sources;
    } else if (input.pageId) {
      const pageBlocks = blocks.filter((b) => b.pageId === input.pageId);
      context = pageContext(pageBlocks);
    }

    const messages: ChatMessage[] = buildMessages({
      feature: input.feature,
      ...(input.selection ? { selection: input.selection } : {}),
      ...(context ? { context } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.language ? { language: input.language } : {}),
    });

    const outcome = await runChat(
      { messages, temperature: input.feature === "ask" ? 0.3 : 0.5 },
      { ...(input.preferredProvider ? { preferred: input.preferredProvider } : {}) },
    );

    return json({
      text: outcome.text,
      provider: outcome.provider,
      model: outcome.model,
      fallbacks: outcome.fallbacks,
      sources,
    });
  } catch (error) {
    if (error instanceof AIError) {
      if (error.code === "not_configured") {
        return json(
          {
            error: error.message,
            code: "ai_not_configured",
            attempts: error.attempts,
          },
          { status: 503 },
        );
      }
      if (error.code === "all_failed") {
        return json(
          {
            error: "All AI providers failed. Please try again in a moment.",
            code: "ai_unavailable",
            attempts: error.attempts,
          },
          { status: 502 },
        );
      }
      return json({ error: error.message, code: error.code }, { status: 502 });
    }
    if (error instanceof Error && error.name === "StorageError") {
      // Return, never throw: an ApiError escaping the handler bypasses
      // handleError and Next answers with a bare 500 instead of the typed 503.
      return handleError(unavailable("Notebook data is unavailable right now."));
    }
    return handleError(error);
  }
}
