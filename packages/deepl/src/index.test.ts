import { describe, expect, it, vi } from "vitest";
import {
  decode,
  deepl,
  deeplBatch,
  encode,
  toDeepLSource,
  toDeepLTarget,
} from "./index.js";

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/** A fake `fetch` that records each request and answers with `respond(texts, callNumber)`. */
function fakeFetch(
  respond: (texts: string[], n: number) => string[] = (texts) =>
    texts.map((text) => `T(${text})`),
  status = 200
) {
  const calls: Captured[] = [];
  const impl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(url), init: init ?? {}, body });
      if (status !== 200) {
        return new Response("quota exceeded", { status });
      }
      return Response.json({
        translations: respond(body.text as string[], calls.length).map(
          (text) => ({ text })
        ),
      });
    }
  );
  return { calls, fetch: impl as unknown as typeof fetch };
}

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => [];
const fast = { retryDelay: 0 } as const;
const bodyBytes = (call: Captured) =>
  Buffer.byteLength(JSON.stringify(call.body));

describe("language codes", () => {
  it("uppercases a target and gives EN/PT their required regional variant", () => {
    expect(toDeepLTarget("ja")).toBe("JA");
    expect(toDeepLTarget("zh-Hans")).toBe("ZH-HANS");
    expect(toDeepLTarget("en")).toBe("EN-US");
    expect(toDeepLTarget("pt")).toBe("PT-BR");
  });

  it("lets a per-locale override win", () => {
    expect(toDeepLTarget("en", { en: "EN-GB" })).toBe("EN-GB");
  });

  it("maps any BCP 47 spelling Kiritan might use to what DeepL accepts", () => {
    const cases: Record<string, string> = {
      "en-US": "EN-US",
      "en-GB": "EN-GB",
      "en-AU": "EN-US",
      "pt-PT": "PT-PT",
      pt_BR: "PT-BR",
      "zh-Hant": "ZH-HANT",
      "zh-TW": "ZH-HANT",
      "zh-CN": "ZH-HANS",
      zh: "ZH-HANS",
      no: "NB",
      nb: "NB",
      nn: "NB",
      "de-AT": "DE",
      "es-MX": "ES",
      ja: "JA",
    };
    for (const [locale, expected] of Object.entries(cases)) {
      expect(toDeepLTarget(locale), locale).toBe(expected);
    }
  });

  it("strips the region from a source", () => {
    expect(toDeepLSource("en-GB")).toBe("EN");
    expect(toDeepLSource("ja")).toBe("JA");
    expect(toDeepLSource("zh-Hant")).toBe("ZH");
    expect(toDeepLSource("no")).toBe("NB");
  });
});

describe("wire encoding", () => {
  it("escapes XML and wraps each protected token in the ignored tag", () => {
    expect(encode("a < b & c [[0]] > 1 [[12]]")).toBe(
      "a &lt; b &amp; c <x>[[0]]</x> &gt; 1 <x>[[12]]</x>"
    );
  });

  it("round-trips, tolerating the tag's case", () => {
    const text = "1 < 2 & 3 > 2 [[0]][[1]]";
    expect(decode(encode(text))).toBe(text);
    expect(decode("<X>[[0]]</X> &amp;")).toBe("[[0]] &");
  });
});

describe("deepl()", () => {
  it("posts one authenticated request in DeepL's documented shape", async () => {
    const { calls, fetch } = fakeFetch();
    const [result] = await deepl({ apiKey: "secret", fetch }).handle(
      [ctx("Hello %{name}")],
      next
    );

    expect(result).toBe("T(Hello [[0]])".replace("[[0]]", "%{name}"));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.deepl.com/v2/translate");
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe("DeepL-Auth-Key secret");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].body).toEqual({
      text: ["Hello <x>[[0]]</x>"],
      source_lang: "EN",
      target_lang: "JA",
      tag_handling: "xml",
      ignore_tags: ["x"],
    });
  });

  it("keeps code, URLs, links, front matter and directives out of the request", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    const doc = [
      "---",
      "title: Hi",
      "---",
      "",
      ":::kiritan{locale=en}",
      "Run `npm i` and see [docs](https://example.com/a).",
      ":::",
      "",
      "```sh",
      "npm run build",
      "```",
      "",
    ].join("\n");
    const [out] = await deepl({ apiKey: "k", fetch }).handle([ctx(doc)], next);

    const sent = (calls[0].body.text as string[]).join("\n");
    for (const secret of [
      "title: Hi",
      "npm i",
      "example.com",
      "npm run build",
      "kiritan{",
    ]) {
      expect(sent).not.toContain(secret);
    }
    expect(out).toBe(doc);
  });

  it("uses the free endpoint for a key ending in :fx", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({ apiKey: "abc:fx", fetch }).handle([ctx("Hi")], next);
    expect(calls[0].url).toBe("https://api-free.deepl.com/v2/translate");
  });

  it("honors baseUrl, targetLanguages, and extraParams", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({
      apiKey: "k",
      baseUrl: "https://proxy.example",
      targetLanguages: { en: "EN-GB" },
      extraParams: { formality: "prefer_less" },
      fetch,
    }).handle([ctx("Bonjour", "fr", "en")], next);

    expect(calls[0].url).toBe("https://proxy.example/v2/translate");
    expect(calls[0].body).toMatchObject({
      source_lang: "FR",
      target_lang: "EN-GB",
      formality: "prefer_less",
    });
  });

  it("never lets extraParams override the fields the middleware depends on", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({
      apiKey: "k",
      extraParams: { tag_handling: "html", ignore_tags: [], text: ["x"] },
      fetch,
    }).handle([ctx("Hi `a`")], next);

    expect(calls[0].body).toMatchObject({
      text: ["Hi <x>[[0]]</x>"],
      tag_handling: "xml",
      ignore_tags: ["x"],
    });
  });

  it("un-escapes and un-wraps what DeepL returns", async () => {
    const { fetch } = fakeFetch(() => ["<x>[[0]]</x> &lt;3 &amp; more"]);
    const [result] = await deepl({ apiKey: "k", fetch }).handle(
      [ctx("`code` x")],
      next
    );
    expect(result).toBe("`code` <3 & more");
  });

  it("refuses a result where DeepL dropped a protected span", async () => {
    const { fetch } = fakeFetch(() => ["translated without it"]);
    await expect(
      deepl({ apiKey: "k", fetch }).handle([ctx("see `code`")], next)
    ).rejects.toThrow(/dropped 1 protected span/);
  });

  it("splits a text over the request-size limit and rejoins it", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    const paragraph = "word ".repeat(20_000).trim();
    const text = [paragraph, paragraph.replace("word", "term")].join("\n\n");
    const [out] = await deepl({ apiKey: "k", fetch }).handle([ctx(text)], next);

    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(bodyBytes(call)).toBeLessThan(128 * 1024);
    }
    expect(out).toBe(text);
  });

  it("throws a readable error on a non-OK response, without retrying a permanent one", async () => {
    const { calls, fetch } = fakeFetch(undefined, 456);
    await expect(
      deepl({ apiKey: "k", fetch, ...fast }).handle([ctx("Hi")], next)
    ).rejects.toThrow("DeepL responded 456: quota exceeded");
    expect(calls).toHaveLength(1);
  });

  it("retries a 429 and then succeeds", async () => {
    let attempts = 0;
    const flaky = (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("slow down", { status: 429 })
        : Response.json({ translations: [{ text: "ok" }] });
    }) as unknown as typeof fetch;

    const [result] = await deepl({
      apiKey: "k",
      fetch: flaky,
      ...fast,
    }).handle([ctx("Hi")], next);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("gives up after `retry` attempts and reports the last status", async () => {
    let attempts = 0;
    const down = (async () => {
      attempts += 1;
      return new Response("unavailable", { status: 503 });
    }) as unknown as typeof fetch;

    await expect(
      deepl({ apiKey: "k", fetch: down, retry: 1, ...fast }).handle(
        [ctx("Hi")],
        next
      )
    ).rejects.toThrow("DeepL responded 503: unavailable");
    expect(attempts).toBe(2);
  });

  it("wraps a network failure with a readable message", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(
      deepl({ apiKey: "k", fetch: offline, retry: 0 }).handle([ctx("Hi")], next)
    ).rejects.toThrow("request to DeepL failed");
  });

  it("throws if the number of translations doesn't match", async () => {
    const { fetch } = fakeFetch(() => []);
    await expect(
      deepl({ apiKey: "k", fetch, retry: 0 }).handle([ctx("Hi")], next)
    ).rejects.toThrow("expected 1 translation(s), got 0");
  });

  it("sends each text in its own request", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({ apiKey: "k", fetch }).handle([ctx("a"), ctx("b")], next);
    expect(calls.map((c) => (c.body.text as string[]).length)).toEqual([1, 1]);
  });
});

describe("deeplBatch()", () => {
  it("sends contexts sharing a language pair in one request, keeping order", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await deeplBatch({ apiKey: "k", fetch }).handle(
      [ctx("one"), ctx("two"), ctx("three")],
      next
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toEqual(["one", "two", "three"]);
    expect(results).toEqual(["T(one)", "T(two)", "T(three)"]);
  });

  it("splits different language pairs into separate requests, keeping each result in place", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await deeplBatch({ apiKey: "k", fetch }).handle(
      [ctx("a", "en", "ja"), ctx("b", "en", "fr"), ctx("c", "en", "ja")],
      next
    );
    expect(calls.map((call) => call.body.target_lang).sort()).toEqual([
      "FR",
      "JA",
    ]);
    const ja = calls.find((c) => c.body.target_lang === "JA")!;
    expect(ja.body.text).toEqual(["a", "c"]);
    expect(results).toEqual(["T(a)", "T(b)", "T(c)"]);
  });

  it("chunks at DeepL's 50 texts per request", async () => {
    const { calls, fetch } = fakeFetch();
    const many = Array.from({ length: 120 }, (_, i) => ctx(`t${i}`));
    const results = await deeplBatch({ apiKey: "k", fetch }).handle(many, next);

    expect(
      calls
        .map((call) => (call.body.text as string[]).length)
        .sort((a, b) => b - a)
    ).toEqual([50, 50, 20]);
    expect(results[0]).toBe("T(t0)");
    expect(results[119]).toBe("T(t119)");
  });

  it("also chunks by the size of the request body", async () => {
    const { calls, fetch } = fakeFetch();
    const big = "x".repeat(70 * 1024);
    const results = await deeplBatch({ apiKey: "k", fetch }).handle(
      [ctx(big), ctx(big + "y"), ctx("small")],
      next
    );

    for (const call of calls) {
      expect(bodyBytes(call)).toBeLessThan(128 * 1024);
    }
    expect(calls.length).toBeGreaterThan(1);
    expect(results.map((r) => r?.length)).toEqual([
      big.length + 3,
      big.length + 4,
      "T(small)".length,
    ]);
  });

  it("counts bytes and the wrapped, escaped form, not characters", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    await deeplBatch({ apiKey: "k", fetch }).handle(
      [ctx("&".repeat(15_000)), ctx("あ".repeat(15_000)), ctx("a")],
      next
    );
    for (const call of calls) {
      expect(bodyBytes(call)).toBeLessThan(128 * 1024);
    }
  });

  it("makes no request for no contexts", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await deeplBatch({ apiKey: "k", fetch }).handle([], next)).toEqual(
      []
    );
    expect(calls).toHaveLength(0);
  });
});
