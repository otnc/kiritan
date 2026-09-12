import { describe, expect, it } from "vitest";
import { createT } from "./create-t.js";

const messages = {
  submit: { en: "Submit", ja: "送信" },
  greeting: { en: "Hello, %{name}!", ja: "こんにちは、%{name}さん！" },
} as const;

describe("createT", () => {
  it("resolves the given locale", () => {
    const { t } = createT(messages, { locale: "ja" });
    expect(t("submit")).toBe("送信");
  });

  it("defaults to the first locale found when none is given", () => {
    const { t } = createT(messages);
    expect(t("submit")).toBe("Submit");
  });

  it("falls back to fallbackLocale when the current locale is missing", () => {
    const { t } = createT(
      { onlyEn: { en: "Only English" } },
      { locale: "ja", fallbackLocale: "en" }
    );
    expect(t("onlyEn")).toBe("Only English");
  });

  it("falls back to the key itself when nothing resolves", () => {
    const { t } = createT(messages, { locale: "fr" });
    expect(t("submit")).toBe("submit");
  });

  it("interpolates params", () => {
    const { t } = createT(messages, { locale: "en" });
    expect(t("greeting", { name: "World" })).toBe("Hello, World!");
  });

  it("setLocale switches the active locale", () => {
    const t1 = createT(messages, { locale: "en" });
    expect(t1.t("submit")).toBe("Submit");
    t1.setLocale("ja");
    expect(t1.locale).toBe("ja");
    expect(t1.t("submit")).toBe("送信");
  });
});
