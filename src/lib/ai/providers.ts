import {
  AIError,
  parseChatCompletionBody,
  type AIProvider,
  type ChatRequest,
} from "./types";

interface OpenAICompatConfig {
  id: string;
  label: string;
  url: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
}

/** Shared implementation for OpenAI-compatible chat-completion APIs. */
function createOpenAICompatProvider(config: OpenAICompatConfig): AIProvider {
  return {
    id: config.id,
    label: config.label,
    get configured() {
      return Boolean(process.env[config.apiKeyEnv]);
    },
    async chat(request: ChatRequest, signal?: AbortSignal) {
      const apiKey = process.env[config.apiKeyEnv];
      if (!apiKey) {
        throw new AIError("not_configured", `${config.label} is not configured.`);
      }
      const model = process.env[config.modelEnv] ?? config.defaultModel;
      const started = Date.now();

      const response = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...config.extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.4,
          max_tokens: request.maxTokens ?? 1200,
        }),
        ...(signal ? { signal } : {}),
      });

      if (response.status === 429) {
        throw new AIError("rate_limited", `${config.label} rate limited the request.`);
      }
      if (!response.ok) {
        throw new AIError(
          "all_failed",
          `${config.label} responded with HTTP ${response.status}.`,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AIError("invalid_response", `${config.label} returned malformed JSON.`);
      }

      const text = parseChatCompletionBody(body, config.label, model);
      return { text, provider: config.id, model, elapsedMs: Date.now() - started };
    },
  };
}

/**
 * Endpoint overrides exist for two legitimate cases: a corporate proxy and
 * the browser test suite's local mock. They never change what a provider
 * returns, only where it is asked.
 */
function baseUrl(envName: string, fallback: string): string {
  const configured = process.env[envName]?.trim();
  if (!configured) return fallback;
  return configured.replace(/\/+$/, "");
}

export const groqProvider = createOpenAICompatProvider({
  id: "groq",
  label: "Groq",
  url: `${baseUrl("GROQ_BASE_URL", "https://api.groq.com")}/openai/v1/chat/completions`,
  apiKeyEnv: "GROQ_API_KEY",
  modelEnv: "GROQ_MODEL",
  // Free model on Groq's OpenAI-compatible endpoint.
  defaultModel: "openai/gpt-oss-20b",
});

export const cerebrasProvider = createOpenAICompatProvider({
  id: "cerebras",
  label: "Cerebras",
  url: `${baseUrl("CEREBRAS_BASE_URL", "https://api.cerebras.ai")}/v1/chat/completions`,
  apiKeyEnv: "CEREBRAS_API_KEY",
  modelEnv: "CEREBRAS_MODEL",
  // Free-tier model on Cerebras' OpenAI-compatible endpoint.
  defaultModel: "gpt-oss-120b",
});

export const openRouterProvider = createOpenAICompatProvider({
  id: "openrouter",
  label: "OpenRouter",
  url: `${baseUrl("OPENROUTER_BASE_URL", "https://openrouter.ai")}/api/v1/chat/completions`,
  apiKeyEnv: "OPENROUTER_API_KEY",
  modelEnv: "OPENROUTER_MODEL",
  // Free model (":free" slug) on OpenRouter.
  defaultModel: "nvidia/nemotron-3-super-120b-a12b:free",
  extraHeaders: {
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "NBOOK",
  },
});
