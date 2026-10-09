import { groqProvider, openRouterProvider } from "./providers";
import { AIError, type AIProvider, type AIResult, type ChatRequest } from "./types";

/**
 * Ordered provider registry.
 *
 * Adding a provider = implement `AIProvider` and append it here. No call site
 * ever references a vendor directly.
 */
export const providers: AIProvider[] = [groqProvider, openRouterProvider];

export interface RouterOptions {
  /** Provider id to try first (user/book preference). */
  preferred?: string;
  /** Per-attempt timeout. */
  timeoutMs?: number;
}

export interface RouterOutcome extends AIResult {
  fallbacks: Array<{ provider: string; error: string }>;
}

/**
 * Runs a chat request with timeout + fallback:
 *
 *   request → preferred provider → timeout/error → next provider → error
 *
 * Throws `AIError` when no provider is configured or every attempt fails, so
 * callers can surface a real error state instead of a fabricated answer.
 */
export async function runChat(
  request: ChatRequest,
  options: RouterOptions = {},
): Promise<RouterOutcome> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const configured = providers.filter((p) => p.configured);

  if (configured.length === 0) {
    throw new AIError(
      "not_configured",
      "No AI provider is configured. Set GROQ_API_KEY or OPENROUTER_API_KEY in the environment.",
    );
  }

  const ordered = options.preferred
    ? [
        ...configured.filter((p) => p.id === options.preferred),
        ...configured.filter((p) => p.id !== options.preferred),
      ]
    : configured;

  const attempts: Array<{ provider: string; error: string }> = [];

  for (const provider of ordered) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const result = await provider.chat(request, controller.signal);
      if (!result.text.trim()) {
        throw new AIError("invalid_response", `${provider.label} returned an empty response.`);
      }
      return { ...result, fallbacks: attempts };
    } catch (error) {
      const message =
        error instanceof AIError
          ? error.message
          : error instanceof Error && error.name === "AbortError"
            ? `${provider.label} timed out after ${timeoutMs}ms.`
            : error instanceof Error
              ? error.message
              : "Unknown provider error";
      attempts.push({ provider: provider.id, error: message });
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AIError(
    "all_failed",
    "All AI providers failed. Please try again shortly.",
    attempts,
  );
}

export function configuredProviderIds(): string[] {
  return providers.filter((p) => p.configured).map((p) => p.id);
}
