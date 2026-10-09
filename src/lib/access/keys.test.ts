import { describe, expect, it } from "vitest";
import {
  can,
  generateAccessKey,
  hashAccessKey,
  hashPin,
  isValidEditPin,
  isValidPin,
  isValidReadPin,
  isWellFormedAccessKey,
  pinMatchesHash,
  roleAtLeast,
  roleFromAccessKey,
  roleFromPin,
  signSession,
  verifySession,
} from "@/lib/access/keys";

const ROLES = ["owner", "editor", "viewer"] as const;

describe("access keys", () => {
  it("generates a well-formed key for every role", () => {
    for (const role of ROLES) {
      const key = generateAccessKey(role);
      expect(key.startsWith(`${role.slice(0, 3) === "own" ? "nbkown" : role === "editor" ? "nbkedt" : "nbkview"}_`)).toBe(true);
      expect(isWellFormedAccessKey(key)).toBe(true);
      expect(roleFromAccessKey(key)).toBe(role);
    }
  });

  it("never repeats a key", () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateAccessKey("viewer")));
    expect(keys.size).toBe(200);
  });

  it("rejects malformed keys", () => {
    for (const bad of ["", "nbkown_", "nbkown_short", "evil_abcdefghij", "nbkown_ABCDEF", "nbkview_" + "a".repeat(65)]) {
      expect(isWellFormedAccessKey(bad)).toBe(false);
    }
  });

  it("hashes to stable 64-char sha256 hex", () => {
    const key = generateAccessKey("owner");
    const a = hashAccessKey(key);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessKey(key)).toBe(a);
    expect(hashAccessKey(key + "x")).not.toBe(a);
  });
});

describe("session tokens", () => {
  const payload = {
    bookId: "bk_1",
    keyId: "key_1",
    role: "editor" as const,
    sessionId: "sess_1",
    displayName: "Amber Scribe",
  };

  it("round-trips a signed session", () => {
    const token = signSession(payload, "secret", 60);
    const verified = verifySession(token, "secret");
    expect(verified).not.toBeNull();
    expect(verified?.bookId).toBe("bk_1");
    expect(verified?.role).toBe("editor");
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with the wrong secret", () => {
    const token = signSession(payload, "secret", 60);
    expect(verifySession(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered body", () => {
    const token = signSession(payload, "secret", 60);
    const [body, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...payload, role: "owner" }),
      "utf8",
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifySession(`${forged}.${sig}`, "secret")).toBeNull();
    expect(verifySession(`${body}.${sig}`, "secret")).not.toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSession(payload, "secret", -10);
    expect(verifySession(token, "secret")).toBeNull();
  });

  it("rejects junk", () => {
    expect(verifySession("", "secret")).toBeNull();
    expect(verifySession("a.b.c", "secret")).toBeNull();
    expect(verifySession("not-a-token", "secret")).toBeNull();
  });
});

describe("permissions", () => {
  it("grants read to everyone", () => {
    for (const role of ROLES) expect(can(role, "read")).toBe(true);
  });

  it("restricts write to editor and owner", () => {
    expect(can("viewer", "write")).toBe(false);
    expect(can("editor", "write")).toBe(true);
    expect(can("owner", "write")).toBe(true);
  });

  it("restricts manage to the owner", () => {
    expect(can("viewer", "manage")).toBe(false);
    expect(can("editor", "manage")).toBe(false);
    expect(can("owner", "manage")).toBe(true);
  });

  it("ranks roles correctly", () => {
    expect(roleAtLeast("owner", "editor")).toBe(true);
    expect(roleAtLeast("editor", "owner")).toBe(false);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });
});

describe("share PINs", () => {
  it("recognises a 4-digit read PIN", () => {
    expect(isValidReadPin("1234")).toBe(true);
    expect(isValidReadPin("0000")).toBe(true);
    expect(isValidReadPin("123")).toBe(false);
    expect(isValidReadPin("12345")).toBe(false);
    expect(isValidReadPin("12a4")).toBe(false);
  });

  it("recognises a 5-digit edit PIN", () => {
    expect(isValidEditPin("12345")).toBe(true);
    expect(isValidEditPin("1234")).toBe(false);
    expect(isValidEditPin("123456")).toBe(false);
    expect(isValidEditPin("1234x")).toBe(false);
  });

  it("accepts either length as a valid PIN", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("123456")).toBe(false);
  });

  it("maps PIN length to role: 4 → viewer, 5 → editor", () => {
    expect(roleFromPin("4821")).toBe("viewer");
    expect(roleFromPin("48217")).toBe("editor");
    expect(roleFromPin("1")).toBeNull();
    expect(roleFromPin("abcd")).toBeNull();
  });

  it("hashes to stable 64-char sha256 hex and trims", () => {
    const h = hashPin("4821");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPin("4821")).toBe(h);
    expect(hashPin(" 4821 ")).toBe(h);
    expect(hashPin("4822")).not.toBe(h);
  });

  it("matches a PIN against its stored hash in constant time", () => {
    const stored = hashPin("48217");
    expect(pinMatchesHash("48217", stored)).toBe(true);
    expect(pinMatchesHash("48216", stored)).toBe(false);
    expect(pinMatchesHash("48217", null)).toBe(false);
    expect(pinMatchesHash("48217", undefined)).toBe(false);
    expect(pinMatchesHash("48217", "")).toBe(false);
  });
});
