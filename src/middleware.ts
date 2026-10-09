import { NextResponse, type NextRequest } from "next/server";

/**
 * `/b/[slug]` is only a landing hop — the notebook lives at `/read`.
 * Doing this in middleware guarantees a real 307; `redirect()` inside the page
 * degrades to a client-side hop once the shell has started streaming.
 */
export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL(`${request.nextUrl.pathname}/read`, request.url), 307);
}

export const config = {
  matcher: ["/b/:slug"],
};
