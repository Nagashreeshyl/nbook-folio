"use client";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "unknown") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, signal } = options;
  // A payload implies a mutation: `fetch` rejects a body on GET/HEAD, so
  // defaulting to GET here would turn a forgotten `method` into a runtime
  // error instead of the POST the caller meant.
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    // The server contract is `{error, code}` (see `handleError`); `message`
    // is kept for older payloads. Without this every failure surfaced to the
    // user as the generic "Request failed (500)".
    const record = (payload ?? {}) as { error?: string; message?: string; code?: string };
    throw new ApiClientError(
      response.status,
      record.error ?? record.message ?? `Request failed (${response.status})`,
      record.code ?? "unknown",
    );
  }

  return payload as T;
}

/**
 * Subscribe to a server-sent-events stream.
 *
 * The server sends every payload as a default `message` frame whose JSON body
 * carries its own discriminating `type` field, so a single handler suffices.
 * Returns an unsubscribe function.
 */
export function subscribe<T>(path: string, onEvent: (event: T) => void): () => void {
  const source = new EventSource(path, { withCredentials: true });
  source.onmessage = (event: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(event.data) as T);
    } catch {
      /* ignore malformed frames (heartbeats are comments, not data) */
    }
  };
  return () => source.close();
}
