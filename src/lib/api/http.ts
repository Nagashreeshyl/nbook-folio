import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new ApiError(400, code, message);
export const unauthorized = (message = "Access key required.") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message = "You do not have permission to do that.") =>
  new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found.") =>
  new ApiError(404, "not_found", message);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const tooMany = (message = "Too many attempts. Try again shortly.") =>
  new ApiError(429, "rate_limited", message);
export const unavailable = (message: string, code = "unavailable") =>
  new ApiError(503, code, message);

export function json<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, init);
}

/** Parse and validate a JSON request body. Throws `ApiError(400)`. */
export async function parseBody<S>(request: Request, schema: ZodType<S>): Promise<S> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  try {
    return schema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      const first = error.issues[0];
      throw badRequest(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid payload.",
      );
    }
    throw error;
  }
}

/** Convert any thrown value into a safe JSON error response. */
export function handleError(error: unknown): NextResponse<{ error: string; code: string }> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request payload.", code: "bad_request" },
      { status: 400 },
    );
  }
  const message =
    error instanceof Error && error.name === "StorageError"
      ? error.message
      : "Something went wrong. Please try again.";
  const status =
    error instanceof Error && error.name === "StorageError"
      ? (error as unknown as { code: string }).code === "not_found"
        ? 404
        : (error as unknown as { code: string }).code === "conflict"
          ? 409
          : 500
      : 500;

  // Never leak stack traces or provider payloads to the client.
  if (process.env.NODE_ENV === "development") {
    console.error("[api]", error);
  }
  return NextResponse.json({ error: message, code: "error" }, { status });
}
