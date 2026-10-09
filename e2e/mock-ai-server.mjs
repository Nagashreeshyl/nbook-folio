/**
 * OpenAI-compatible stand-in used by the Playwright suite.
 *
 * The browser never talks to this server: Next.js does, because `/api/ai`
 * calls providers server-side. Tests steer it through `POST /_control` so the
 * real router (ordering, fallback, error mapping) runs unmodified while the
 * network stays offline.
 *
 *   POST /_control  {"groq":"fail","openrouter":"ok","delayMs":0}
 *   GET  /_health
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_AI_PORT ?? 8799);

/** Per-provider behaviour: "ok" | "fail" | "slow", plus a shared delay. */
const state = {
  groq: "ok",
  openrouter: "ok",
  delayMs: 0,
};

const PROVIDER_PATHS = new Map([
  ["/openai/v1/chat/completions", "groq"],
  ["/api/v1/chat/completions", "openrouter"],
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function completion(provider, model) {
  return {
    id: `mock-${provider}`,
    object: "chat.completion",
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `Mocked ${provider} completion for ${model}.`,
        },
        finish_reason: "stop",
      },
    ],
  };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (request.method === "GET" && url.pathname === "/_health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, ...state }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/_control") {
    const body = await readJson(request);
    for (const key of ["groq", "openrouter", "delayMs"]) {
      if (key in body) state[key] = body[key];
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(state));
    return;
  }

  const provider = PROVIDER_PATHS.get(url.pathname);
  if (request.method === "POST" && provider) {
    const body = await readJson(request);
    const delay = state.delayMs > 0 ? Number(state.delayMs) : state[provider] === "slow" ? 1200 : 0;
    if (delay > 0) await sleep(delay);

    if (state[provider] === "fail") {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: `mock ${provider} is failing on purpose` }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(completion(provider, body.model ?? "mock-model")));
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  // Playwright waits on `/_health`; the log is only for manual debugging.
  console.log(`mock AI server listening on http://127.0.0.1:${PORT}`);
});
