import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Disallow rendering in a frame from foreign origins (clickjacking)
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Restrict referrer to same-origin only
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Block access to device features that NBOOK doesn't need
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Only serve over HTTPS once deployed (safe to send in dev too — ignored
  // by browsers on plain HTTP)
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Content Security Policy.
  //
  // Intentionally permissive for script-src/style-src because:
  //   - Next.js injects inline scripts for hydration (requires 'unsafe-inline'
  //     or a nonce, and nonces require middleware rewriting every response)
  //   - Tailwind v4 generates inline styles
  //   - tldraw ships its own CSS-in-JS
  //
  // The meaningful protections here are frame-ancestors, object-src, and
  // restricting base-uri (mitigates subdomain takeover via <base>).
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: Next.js + Excalidraw web workers (blob:)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      // Styles: inline (Tailwind/Excalidraw) + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts: local + Google Fonts + Excalidraw's font CDN (esm.sh)
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com https://esm.sh",
      // Images: same-origin, data URIs (canvas export), blob URLs
      "img-src 'self' data: blob:",
      // Media/files served via the /api/files proxy
      "media-src 'self' blob:",
      // SSE back to the same origin + Excalidraw font fetches from esm.sh
      "connect-src 'self' https://esm.sh",
      // Excalidraw spins up web workers from blob URLs
      "worker-src 'self' blob:",
      // No plugins ever
      "object-src 'none'",
      // Prevent <base> injection
      "base-uri 'self'",
      // Block embedding in foreign frames
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // tldraw ships untranspiled ESM; allow it through the bundler.
  transpilePackages: ["tldraw"],
  eslint: {
    dirs: ["src"],
  },
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
