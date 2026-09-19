import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createFileCache,
  createTranslator,
  isRetryableError,
  mask,
  PlaceholderLostError,
  splitText,
  unmask,
} from "./index.js";

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => [];
const upper = async (text: string) => text.toUpperCase();

describe("mask / unmask", () => {
  const doc = [
    "---",
    "title: Hi",
    "---",
    "",
    ":::kiritan{locale=en}",
    "Use `npm i` at https://example.com/a?b=1 now, %{name}.",
    "See [docs](./docs/README.md) and <b>bold</b>.",
    ":::",
    "",
    "```js",
    "const x = `%{keep}`;",
    "```",
    "",
  ].join("\n");

  it("hides code, URLs, links, HTML, front matter, directives and placeholders", () => {
    const { text } = mask(doc);
    for (const secret of [
      "title: Hi",
      "npm i",
      "example.com",
      "%{name}",
      "./docs/README.md",
      "<b>",
      "kiritan{locale=en}",
      "const x",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("Use");
    expect(text).toContain("See [docs]");
  });

  it("keeps line-start markers (heading, quote, bullet, number) with their space", () => {
    const md = "# Title\n\n> quote\n\n- one\n- two\n\n1. first\n";
    const { text, spans } = mask(md);
    expect(text).not.toMatch(/[#>-]/);
    expect(text).toContain("Title");
    expect(unmask(text, spans)).toBe(md);
  });

  it("round-trips exactly", () => {
    const { text, spans } = mask(doc);
    expect(unmask(text, spans)).toBe(doc);
  });

  it("tolerates spaces the engine adds inside a token", () => {
    const { text, spans } = mask("a `x` b");
    expect(unmask(text.replace("[[0]]", "[[ 0 ]]"), spans)).toBe("a `x` b");
  });

  it("refuses a result where a span was dropped", () => {
    const { spans } = mask("a `x` b");
    expect(() => unmask("a b", spans)).toThrow(PlaceholderLostError);
  });

  it("shields a literal [[0]] already in the source", () => {
    const { text, spans } = mask("wiki [[0]] link");
    expect(text).toBe("wiki [[0]] link".replace("[[0]]", "[[0]]"));
    expect(spans).toEqual(["[[0]]"]);
    expect(unmask(text, spans)).toBe("wiki [[0]] link");
  });
});

describe("splitText", () => {
  it("returns one chunk at or under the limit", () => {
    expect(splitText("short", 10)).toEqual([{ text: "short", before: "" }]);
  });

  it("splits at paragraph boundaries and keeps every chunk within the limit", () => {
    const paragraphs = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    const chunks = splitText(paragraphs.join("\n\n"), 90);
    expect(chunks.every((c) => c.text.length <= 90)).toBe(true);
    expect(chunks.map((c) => c.text).join("")).toBe(
      paragraphs.slice(0, 2).join("\n\n") + paragraphs[2]
    );
  });

  it("counts with a custom measure, e.g. bytes, and never splits a surrogate pair", () => {
    const bytes = (t: string) => Buffer.byteLength(t);
    const chunks = splitText("猫".repeat(10), 9, bytes);
    expect(chunks.every((c) => bytes(c.text) <= 9)).toBe(true);
    expect(chunks.map((c) => c.text).join("")).toBe("猫".repeat(10));
    const emoji = splitText("😀".repeat(5), 8, bytes);
    expect(emoji.map((c) => c.text).join("")).toBe("😀".repeat(5));
    expect(emoji.every((c) => !/[�-�]$/.test(c.text))).toBe(true);
  });

  it("falls back to sentences, then a hard cut", () => {
    const sentences = splitText("One. Two. Three. Four.", 10);
    expect(sentences.every((c) => c.text.length <= 10)).toBe(true);
    const hard = splitText("x".repeat(25), 10);
    expect(hard.map((c) => c.text.length)).toEqual([10, 10, 5]);
  });
});

describe("createTranslator", () => {
  it("needs a translate function", () => {
    expect(() => createTranslator({ name: "x" })).toThrow(/translate/);
  });

  it("translates around protected spans and puts them back", async () => {
    const mw = createTranslator({ name: "t", translate: upper });
    const [out] = await mw.handle(
      [ctx("Hello `code` and %{name} at https://x.dev now.")],
      next
    );
    expect(out).toBe("HELLO `code` AND %{name} AT https://x.dev NOW.");
  });

  it("keeps surrounding whitespace and skips the engine for a text that is only protected", async () => {
    const translate = vi.fn(upper);
    const mw = createTranslator({ name: "t", translate });
    const out = await mw.handle([ctx("\n\nhello\n"), ctx("`only`")], next);
    expect(out).toEqual(["\n\nHELLO\n", "`only`"]);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("splits a long text at paragraphs and rejoins it exactly", async () => {
    const seen: string[] = [];
    const mw = createTranslator({
      name: "t",
      maxChars: 50,
      translate: async (text) => {
        seen.push(text);
        return text.toUpperCase();
      },
    });
    const paragraphs = Array.from(
      { length: 6 },
      (_, i) => `para ${i} ${"w".repeat(30)}`
    );
    const [out] = await mw.handle([ctx(paragraphs.join("\n\n") + "\n")], next);

    expect(seen.length).toBeGreaterThan(1);
    expect(seen.every((s) => s.length <= 50)).toBe(true);
    expect(out).toBe(paragraphs.join("\n\n").toUpperCase() + "\n");
  });

  it("groups small texts into batches within the limits, keeping order", async () => {
    const calls: string[][] = [];
    const mw = createTranslator({
      name: "t",
      maxBatchSize: 3,
      translateBatch: async (texts) => {
        calls.push(texts);
        return texts.map((t) => t.toUpperCase());
      },
    });
    const inputs = Array.from({ length: 7 }, (_, i) => `t${i}`);
    const out = await mw.handle(
      inputs.map((t) => ctx(t)),
      next
    );

    expect(calls.map((c) => c.length)).toEqual([3, 3, 1]);
    expect(out).toEqual(inputs.map((t) => t.toUpperCase()));
  });

  it("batches per language pair", async () => {
    const calls: Array<[string[], string]> = [];
    const mw = createTranslator({
      name: "t",
      translateBatch: async (texts, pair) => {
        calls.push([texts, pair.to]);
        return texts.map((t) => `${pair.to}:${t}`);
      },
    });
    const out = await mw.handle(
      [ctx("a", "en", "ja"), ctx("b", "en", "fr"), ctx("c", "en", "ja")],
      next
    );
    expect(out).toEqual(["ja:a", "fr:b", "ja:c"]);
    expect(calls).toHaveLength(2);
  });

  it("sends identical texts once, and remembers them across calls", async () => {
    const translate = vi.fn(upper);
    const mw = createTranslator({ name: "t", translate });
    expect(await mw.handle([ctx("same"), ctx("same")], next)).toEqual([
      "SAME",
      "SAME",
    ]);
    expect(translate).toHaveBeenCalledTimes(1);
    await mw.handle([ctx("same")], next);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("caches per provider name", async () => {
    const cache = new Map<string, string>();
    const store = {
      get: (k: string) => cache.get(k),
      set: (k: string, v: string) => void cache.set(k, v),
    };
    const a = createTranslator({ name: "a", translate: upper, cache: store });
    const b = createTranslator({
      name: "b",
      translate: async (t) => t + "!",
      cache: store,
    });
    await a.handle([ctx("x")], next);
    expect(await b.handle([ctx("x")], next)).toEqual(["x!"]);
  });

  it("persists a file cache", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kiritan-mw-"));
    try {
      const path = join(dir, "sub", "cache.json");
      const translate = vi.fn(upper);
      await createTranslator({
        name: "t",
        translate,
        cache: createFileCache(path),
      }).handle([ctx("hi")], next);
      expect(Object.values(JSON.parse(await readFile(path, "utf8")))).toEqual([
        "HI",
      ]);

      await createTranslator({
        name: "t",
        translate,
        cache: createFileCache(path),
      }).handle([ctx("hi")], next);
      expect(translate).toHaveBeenCalledTimes(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("limits concurrency and spaces requests", async () => {
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    const mw = createTranslator({
      name: "t",
      concurrency: 2,
      minInterval: 20,
      translate: async (text) => {
        starts.push(Date.now());
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return text;
      },
    });
    await mw.handle(
      Array.from({ length: 5 }, (_, i) => ctx(`t${i}`)),
      next
    );
    expect(peak).toBeLessThanOrEqual(2);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(15);
    }
  });

  it("retries a retryable failure, but not a permanent one", async () => {
    let attempts = 0;
    const flaky = createTranslator({
      name: "t",
      retry: { delay: 0 },
      translate: async (text) => {
        attempts += 1;
        if (attempts < 3)
          throw Object.assign(new Error("busy"), { status: 429 });
        return text;
      },
    });
    expect(await flaky.handle([ctx("x")], next)).toEqual(["x"]);
    expect(attempts).toBe(3);

    let denied = 0;
    const permanent = createTranslator({
      name: "t",
      retry: { delay: 0 },
      translate: async () => {
        denied += 1;
        throw Object.assign(new Error("no"), { status: 403 });
      },
    });
    await expect(permanent.handle([ctx("x")], next)).rejects.toThrow("no");
    expect(denied).toBe(1);
  });

  it("classifies errors for retry", () => {
    expect(isRetryableError(new Error("network"))).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 404 })).toBe(false);
    expect(isRetryableError({ status: 500, retryable: false })).toBe(false);
  });

  it("throws by default when the engine drops a protected span", async () => {
    const mw = createTranslator({
      name: "t",
      translate: async (text) => text.replace(/\[\[\d+\]\]/g, ""),
    });
    await expect(mw.handle([ctx("a `x` b")], next)).rejects.toThrow(
      PlaceholderLostError
    );
  });

  it("with onError: skip, leaves only the failing text to the next middleware", async () => {
    const skipped: string[] = [];
    const mw = createTranslator({
      name: "t",
      onError: "skip",
      onSkip: (_e, c) => skipped.push(c.text),
      retry: false,
      translateBatch: async (texts) => {
        if (texts.includes("bad")) throw new Error("boom");
        return texts.map((t) => t.toUpperCase());
      },
    });
    const out = await mw.handle([ctx("good"), ctx("bad"), ctx("fine")], next);
    expect(out).toEqual(["GOOD", null, "FINE"]);
    expect(skipped).toEqual(["bad"]);
  });

  it("rejects a batch that returns the wrong number of results", async () => {
    const mw = createTranslator({
      name: "t",
      retry: false,
      translateBatch: async () => ["only one"],
    });
    await expect(mw.handle([ctx("a"), ctx("b")], next)).rejects.toThrow(
      "returned 1 result(s) for 2"
    );
  });

  it("wraps tokens in provider markup on the way out and unwraps them on the way back", async () => {
    const sent: string[] = [];
    const mw = createTranslator({
      name: "t",
      wire: {
        encode: (text) => text.replace(/\[\[(\d+)\]\]/g, "<x>[[$1]]</x>"),
        decode: (text) => text.replace(/<\/?x>/gi, ""),
      },
      translate: async (text) => {
        sent.push(text);
        return text.toUpperCase();
      },
    });
    const [out] = await mw.handle([ctx("hi `code` there")], next);
    expect(sent[0]).toBe("hi <x>[[0]]</x> there");
    expect(out).toBe("HI `code` THERE");
  });

  it("can turn protection off", async () => {
    const seen: string[] = [];
    const mw = createTranslator({
      name: "t",
      protect: false,
      translate: async (t) => (seen.push(t), t),
    });
    await mw.handle([ctx("a `x` b")], next);
    expect(seen).toEqual(["a `x` b"]);
  });
});
