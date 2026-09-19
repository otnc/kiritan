import { describe, expect, it, vi } from "vitest";
import {
  decode,
  encode,
  googleTranslate,
  googleTranslateBatch,
  toGoogleLanguage,
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
        return new Response("API key not valid", { status });
      }
      return Response.json({
        data: {
          translations: respond(body.q as string[], calls.length).map(
            (translatedText) => ({ translatedText })
          ),
        },
      });
    }
  );
  return { calls, fetch: impl as unknown as typeof fetch };
}

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => [];
const fast = { retryDelay: 0 } as const;
const codePoints = (call: Captured) =>
  (call.body.q as string[]).reduce((sum, q) => sum + [...q].length, 0);

describe("language codes", () => {
  it("sends a locale unchanged unless overridden", () => {
    expect(toGoogleLanguage("ja")).toBe("ja");
    expect(toGoogleLanguage("zh-TW")).toBe("zh-TW");
    expect(toGoogleLanguage("zh", { zh: "zh-CN" })).toBe("zh-CN");
  });

  it("maps any BCP 47 spelling Kiritan might use to what Cloud Translation v2 accepts", () => {
    const cases: Record<string, string> = {
      "en-US": "en",
      pt_BR: "pt",
      "zh-Hans": "zh-CN",
      "zh-Hant": "zh-TW",
      "zh-HK": "zh-TW",
      zh: "zh-CN",
      nb: "no",
      nn: "no",
      fil: "tl",
      iw: "he",
    };
    for (const [locale, expected] of Object.entries(cases)) {
      expect(toGoogleLanguage(locale), locale).toBe(expected);
    }
  });

  it("puts everything that changes the output into the cache key", async () => {
    const stored = new Map<string, string>();
    const cache = {
      get: (key: string) => stored.get(key),
      set: (key: string, value: string) => void stored.set(key, value),
    };
    const { calls, fetch } = fakeFetch();
    const text = [{ text: "Hi", from: "en", to: "ja" }];
    await googleTranslate({ apiKey: "k", fetch, cache }).handle(
      text,
      async () => []
    );
    await googleTranslate({ apiKey: "k", fetch, cache }).handle(
      text,
      async () => []
    );
    expect(calls).toHaveLength(1);
    // A different `model` is a different translation, not a cache hit.
    await googleTranslate({
      apiKey: "k",
      fetch,
      cache,
      extraParams: { model: "nmt" },
    }).handle(text, async () => []);
    expect(calls).toHaveLength(2);
  });
});

describe("wire encoding", () => {
  it("escapes HTML and wraps each protected token in a translate=no span", () => {
    expect(encode("a < b & c [[0]] > 1")).toBe(
      'a &lt; b &amp; c <span translate="no">[[0]]</span> &gt; 1'
    );
  });

  it("round-trips", () => {
    const text = "Hi, 1 < 2 & 3 > 2 [[0]][[1]]";
    expect(decode(encode(text))).toBe(text);
  });

  it("decodes the extra entities Google escapes on its own", () => {
    expect(decode("it&#39;s &quot;fine&quot; &#x3053;")).toBe(
      'it\'s "fine" こ'
    );
  });

  it("decodes in a single pass, so a literal entity in the source survives", () => {
    // Source `&#39;` is sent as `&amp;#39;` and must come back as `&#39;`, not an apostrophe.
    expect(decode(encode("Type &#39; or &amp; literally"))).toBe(
      "Type &#39; or &amp; literally"
    );
  });
});

describe("googleTranslate()", () => {
  it("posts one authenticated request in Cloud Translation v2's documented shape", async () => {
    const { calls, fetch } = fakeFetch();
    const [result] = await googleTranslate({ apiKey: "secret", fetch }).handle(
      [ctx("Hello %{name}")],
      next
    );

    expect(result).toBe("T(Hello [[0]])".replace("[[0]]", "%{name}"));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://translation.googleapis.com/language/translate/v2"
    );
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("X-goog-api-key")).toBe("secret");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].body).toEqual({
      q: ['Hello <span translate="no">[[0]]</span>'],
      source: "en",
      target: "ja",
      format: "html",
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
    const [out] = await googleTranslate({ apiKey: "k", fetch }).handle(
      [ctx(doc)],
      next
    );

    const sent = (calls[0].body.q as string[]).join("\n");
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

  it("honors baseUrl, languageCodes, and extraParams", async () => {
    const { calls, fetch } = fakeFetch();
    await googleTranslate({
      apiKey: "k",
      baseUrl: "https://proxy.example",
      languageCodes: { zh: "zh-CN" },
      extraParams: { model: "nmt" },
      fetch,
    }).handle([ctx("Hello", "en", "zh")], next);

    expect(calls[0].url).toBe("https://proxy.example/language/translate/v2");
    expect(calls[0].body).toMatchObject({ target: "zh-CN", model: "nmt" });
  });

  it("never lets extraParams override the fields the middleware depends on", async () => {
    const { calls, fetch } = fakeFetch();
    await googleTranslate({
      apiKey: "k",
      extraParams: { format: "text", q: ["x"], model: "nmt" },
      fetch,
    }).handle([ctx("Hi `a`")], next);

    expect(calls[0].body).toMatchObject({
      q: ['Hi <span translate="no">[[0]]</span>'],
      format: "html",
      model: "nmt",
    });
  });

  it("round-trips source text that itself contains entity-like sequences", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    const source = "Type &#39; or &amp; literally";
    const [result] = await googleTranslate({ apiKey: "k", fetch }).handle(
      [ctx(source)],
      next
    );
    // The parser reads both as entities, so they never reach Google as text at all.
    expect(calls[0].body.q).toEqual([
      'Type <span translate="no">[[0]]</span> or <span translate="no">[[1]]</span> literally',
    ]);
    expect(result).toBe(source);
  });

  it("un-escapes and un-wraps what Google returns", async () => {
    const { fetch } = fakeFetch(() => [
      '<span translate="no">[[0]]</span> &lt;3 it&#39;s &amp; more',
    ]);
    const [result] = await googleTranslate({ apiKey: "k", fetch }).handle(
      [ctx("`code` x")],
      next
    );
    expect(result).toBe("`code` <3 it's & more");
  });

  it("refuses a result where Google dropped a protected span", async () => {
    const { fetch } = fakeFetch(() => ["translated without it"]);
    await expect(
      googleTranslate({ apiKey: "k", fetch }).handle([ctx("see `code`")], next)
    ).rejects.toThrow(/dropped 1 protected span/);
  });

  it("splits a text over the 30k code-point limit and rejoins it", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    const paragraph = "word ".repeat(7_000).trim();
    const text = [paragraph, paragraph.replace("word", "term")].join("\n\n");
    const [out] = await googleTranslate({ apiKey: "k", fetch }).handle(
      [ctx(text)],
      next
    );

    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(codePoints(call)).toBeLessThanOrEqual(30_000);
    }
    expect(out).toBe(text);
  });

  it("throws a readable error on a non-OK response, without retrying a permanent one", async () => {
    const { calls, fetch } = fakeFetch(undefined, 400);
    await expect(
      googleTranslate({ apiKey: "k", fetch, ...fast }).handle([ctx("Hi")], next)
    ).rejects.toThrow("Google responded 400: API key not valid");
    expect(calls).toHaveLength(1);
  });

  it("retries a 429 and then succeeds", async () => {
    let attempts = 0;
    const flaky = (async () => {
      attempts += 1;
      return attempts === 1
        ? new Response("slow down", { status: 429 })
        : Response.json({ data: { translations: [{ translatedText: "ok" }] } });
    }) as unknown as typeof fetch;

    const [result] = await googleTranslate({
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
      googleTranslate({ apiKey: "k", fetch: down, retry: 1, ...fast }).handle(
        [ctx("Hi")],
        next
      )
    ).rejects.toThrow("Google responded 503: unavailable");
    expect(attempts).toBe(2);
  });

  it("wraps a network failure with a readable message", async () => {
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(
      googleTranslate({ apiKey: "k", fetch: offline, retry: 0 }).handle(
        [ctx("Hi")],
        next
      )
    ).rejects.toThrow("request to Google failed");
  });

  it("throws if the number of translations doesn't match", async () => {
    const { fetch } = fakeFetch(() => []);
    await expect(
      googleTranslate({ apiKey: "k", fetch, retry: 0 }).handle(
        [ctx("Hi")],
        next
      )
    ).rejects.toThrow("expected 1 translation(s), got 0");
  });
});

describe("googleTranslateBatch()", () => {
  it("sends contexts sharing a language pair in one request, keeping order", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await googleTranslateBatch({ apiKey: "k", fetch }).handle(
      [ctx("one"), ctx("two"), ctx("three")],
      next
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].body.q).toEqual(["one", "two", "three"]);
    expect(results).toEqual(["T(one)", "T(two)", "T(three)"]);
  });

  it("splits different language pairs into separate requests, keeping each result in place", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await googleTranslateBatch({ apiKey: "k", fetch }).handle(
      [ctx("a", "en", "ja"), ctx("b", "en", "fr"), ctx("c", "en", "ja")],
      next
    );
    expect(calls.map((call) => call.body.target).sort()).toEqual(["fr", "ja"]);
    expect(calls.find((c) => c.body.target === "ja")!.body.q).toEqual([
      "a",
      "c",
    ]);
    expect(results).toEqual(["T(a)", "T(b)", "T(c)"]);
  });

  it("chunks at 128 strings per request", async () => {
    const { calls, fetch } = fakeFetch();
    const many = Array.from({ length: 300 }, (_, i) => ctx(`t${i}`));
    const results = await googleTranslateBatch({ apiKey: "k", fetch }).handle(
      many,
      next
    );

    expect(
      calls
        .map((call) => (call.body.q as string[]).length)
        .sort((a, b) => b - a)
    ).toEqual([128, 128, 44]);
    expect(results[0]).toBe("T(t0)");
    expect(results[299]).toBe("T(t299)");
  });

  it("chunks at 30k code points per request, counting the wrapped and escaped form", async () => {
    const { calls, fetch } = fakeFetch((texts) => texts);
    await googleTranslateBatch({ apiKey: "k", fetch }).handle(
      [
        ctx("x".repeat(20_000)),
        ctx("y".repeat(20_000)),
        ctx("&".repeat(6_000)),
        ctx("small"),
      ],
      next
    );

    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(codePoints(call)).toBeLessThanOrEqual(30_000);
    }
  });

  it("makes no request for no contexts", async () => {
    const { calls, fetch } = fakeFetch();
    expect(
      await googleTranslateBatch({ apiKey: "k", fetch }).handle([], next)
    ).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
