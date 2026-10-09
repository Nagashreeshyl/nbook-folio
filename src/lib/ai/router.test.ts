import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { providers, runChat, configuredProviderIds } from "@/lib/ai/router";
import { AIError, parseChatCompletionBody, type AIProvider } from "@/lib/ai/types";
import { buildMessages, CODE_FEATURES, TEXT_FEATURES } from "@/lib/ai/features";

function fakeProvider(id: string, impl: AIProvider["chat"], configured = true): AIProvider {
  return {
    id,
    label: id.toUpperCase(),
    configured,
    chat: impl,
  };
}

describe("runChat", () => {
  let original: AIProvider[];

  beforeEach(() => {
    original = [...providers];
    providers.length = 0;
  });

  afterEach(() => {
    providers.length = 0;
    providers.push(...original);
  });

  it("throws not_configured when no provider is configured", async () => {
    providers.push(fakeProvider("a", async () => ({ text: "x", provider: "a", model: "m", elapsedMs: 1 }), false));
    await expect(runChat({ messages: [] })).rejects.toMatchObject({ code: "not_configured" });
  });

  it("uses the first working provider", async () => {
    providers.push(
      fakeProvider("groq", async () => ({ text: "answer", provider: "groq", model: "m1", elapsedMs: 1 })),
    );
    const outcome = await runChat({ messages: [] });
    expect(outcome.text).toBe("answer");
    expect(outcome.fallbacks).toEqual([]);
  });

  it("falls back to the next provider after a failure", async () => {
    providers.push(
      fakeProvider("groq", async () => {
        throw new Error("boom");
      }),
      fakeProvider("openrouter", async () => ({ text: "recovered", provider: "openrouter", model: "m2", elapsedMs: 1 })),
    );
    const outcome = await runChat({ messages: [] });
    expect(outcome.text).toBe("recovered");
    expect(outcome.fallbacks).toHaveLength(1);
    expect(outcome.fallbacks[0]!.provider).toBe("groq");
    expect(outcome.fallbacks[0]!.error).toContain("boom");
  });

  it("honours the preferred provider ordering", async () => {
    const order: string[] = [];
    providers.push(
      fakeProvider("first", async () => {
        order.push("first");
        throw new Error("nope");
      }),
      fakeProvider("second", async () => {
        order.push("second");
        return { text: "ok", provider: "second", model: "m", elapsedMs: 1 };
      }),
    );
    const outcome = await runChat({ messages: [] }, { preferred: "second" });
    expect(order).toEqual(["second"]);
    expect(outcome.provider).toBe("second");
  });

  it("throws all_failed when every provider errors", async () => {
    providers.push(
      fakeProvider("a", async () => {
        throw new Error("a down");
      }),
      fakeProvider("b", async () => {
        throw new Error("b down");
      }),
    );
    await expect(runChat({ messages: [] })).rejects.toMatchObject({ code: "all_failed" });
  });

  it("treats an empty completion as a failure", async () => {
    providers.push(
      fakeProvider("a", async () => ({ text: "   ", provider: "a", model: "m", elapsedMs: 1 })),
      fakeProvider("b", async () => ({ text: "good", provider: "b", model: "m", elapsedMs: 1 })),
    );
    const outcome = await runChat({ messages: [] });
    expect(outcome.text).toBe("good");
    expect(outcome.fallbacks).toHaveLength(1);
  });

  it("reports configured providers", () => {
    providers.push(
      fakeProvider("a", async () => ({ text: "x", provider: "a", model: "m", elapsedMs: 1 })),
      fakeProvider("b", async () => ({ text: "x", provider: "b", model: "m", elapsedMs: 1 }), false),
    );
    expect(configuredProviderIds()).toEqual(["a"]);
  });
});

describe("parseChatCompletionBody", () => {
  it("extracts the first choice", () => {
    expect(
      parseChatCompletionBody({ choices: [{ message: { content: "hi" } }] }, "groq", "m"),
    ).toBe("hi");
  });

  it("throws on unreadable payloads", () => {
    expect(() => parseChatCompletionBody(null, "groq", "m")).toThrow(AIError);
    expect(() => parseChatCompletionBody({}, "groq", "m")).toThrow(AIError);
    expect(() => parseChatCompletionBody({ choices: [] }, "groq", "m")).toThrow(AIError);
  });
});

describe("buildMessages", () => {
  it("always starts with the system prompt", () => {
    const messages = buildMessages({ feature: "explain", selection: "text" });
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toContain("NBOOK Assist");
  });

  it("includes the selection for text features", () => {
    const messages = buildMessages({ feature: "summarize", selection: "the quick brown fox" });
    const joined = messages.map((m) => m.content).join("\n");
    expect(joined).toContain("the quick brown fox");
  });

  it("includes notebook context when provided", () => {
    const messages = buildMessages({ feature: "ask", query: "what is a pivot?", context: "Page 1 says…" });
    const joined = messages.map((m) => m.content).join("\n");
    expect(joined).toContain("what is a pivot?");
    expect(joined).toContain("Page 1 says…");
  });

  it("covers every declared feature", () => {
    for (const feature of [...TEXT_FEATURES, ...CODE_FEATURES, "ask" as const]) {
      const messages = buildMessages({
        feature,
        ...(feature === "ask" ? { query: "q" } : { selection: "s" }),
      });
      expect(messages.length).toBeGreaterThan(1);
    }
  });

  it("asks for the target language on translate", () => {
    const messages = buildMessages({ feature: "translate", selection: "hello", language: "Kannada" });
    const joined = messages.map((m) => m.content).join("\n");
    expect(joined).toContain("Kannada");
  });
});
