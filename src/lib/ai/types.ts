export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIResult {
  text: string;
  provider: string;
  model: string;
  elapsedMs: number;
}

export type AIErrorCode =
  | "not_configured"
  | "all_failed"
  | "invalid_response"
  | "timeout"
  | "rate_limited";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly attempts: Array<{ provider: string; error: string }>;
  constructor(
    code: AIErrorCode,
    message: string,
    attempts: Array<{ provider: string; error: string }> = [],
  ) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.attempts = attempts;
  }
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  readonly configured: boolean;
  chat(request: ChatRequest, signal?: AbortSignal): Promise<AIResult>;
}

export function parseChatCompletionBody(body: unknown, provider: string, _model: string): string {
  if (typeof body !== "object" || body === null) {
    throw new AIError("invalid_response", `${provider} returned an unreadable response.`);
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIError("invalid_response", `${provider} returned no choices.`);
  }
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AIError("invalid_response", `${provider} returned an empty completion.`);
  }
  return content.trim();
}
