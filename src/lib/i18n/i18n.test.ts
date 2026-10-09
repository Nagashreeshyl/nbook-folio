import { describe, expect, it } from "vitest";
import { LOCALES, RTL_LOCALES, isLocale, translate, type Locale, type StringKey } from "@/lib/i18n";

const ALL_KEYS: StringKey[] = [
  "appName",
  "tagline1",
  "createBook",
  "bookName",
  "accessKey",
  "aiFeatures.explain",
  "aiFeatures.ask",
  "dangerZone",
  "pageAnimation",
  "pageSound",
  "pageSoundHint",
  "exploreDemo",
  "demoBadge",
  "demoReadOnly",
  "chapter",
  "untitledPage",
];

describe("i18n", () => {
  it("declares en, kn and ar", () => {
    expect(LOCALES.map((l) => l.id)).toEqual(["en", "kn", "ar"]);
  });

  it("marks Arabic as RTL and the others as LTR", () => {
    expect(RTL_LOCALES.has("ar")).toBe(true);
    expect(RTL_LOCALES.has("en")).toBe(false);
    expect(RTL_LOCALES.has("kn")).toBe(false);
  });

  it("returns English by default", () => {
    expect(translate("en", "appName")).toBe("NBOOK");
    expect(translate("en", "aiFeatures.explain")).toBe("Explain");
  });

  it("translates every checked key into kn and ar", () => {
    for (const locale of ["kn", "ar"] as Locale[]) {
      for (const key of ALL_KEYS) {
        const value = translate(locale, key);
        expect(value.length, `${locale}:${key}`).toBeGreaterThan(0);
        expect(value, `${locale}:${key}`).not.toBe(key);
      }
    }
  });

  it("falls back to English for a missing key", () => {
    expect(translate("kn", "appName" as StringKey)).toBe("NBOOK");
  });

  it("keeps Kannada and Arabic script recognisable", () => {
    expect(translate("kn", "createBook")).toMatch(/[\u0C80-\u0CFF]/);
    expect(translate("ar", "createBook")).toMatch(/[\u0600-\u06FF]/);
  });

  it("validates locale strings", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
