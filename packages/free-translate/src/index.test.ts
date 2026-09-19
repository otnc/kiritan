import { describe, expect, it } from "vitest";
import { tuning } from "./http.js";
import { googleFree, myMemory } from "./index.js";

interface Call {
  url: URL;
  method: string;
  body: URLSearchParams | Record<string, unknown> | undefined;
}

/** A fake `fetch` answering each request with `respond(call)`; a string body is sent as text, anything else as JSON. */
function fakeFetch(respond: (call: Call, n: number) => unknown, status = 200) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const raw = init?.body;
    let body: Call["body"];
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = new URLSearchParams(raw);
      }
    } else if (raw instanceof URLSearchParams) {
      body = raw;
    }
    const call: Call = {
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      body,
    };
    calls.push(call);
    const out = respond(call, calls.length);
    const code =
      typeof out === "object" && out !== null && "__status" in out
        ? (out as { __status: number }).__status
        : status;
    const payload =
      typeof out === "object" && out !== null && "__status" in out
        ? (out as unknown as { body: unknown }).body
        : out;
    return typeof payload === "string"
      ? new Response(payload, { status: code })
      : Response.json(payload, { status: code });
  };
  return { calls, fetch: impl as unknown as typeof fetch };
}

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => [];
const fast = { retry: { delay: 0 }, minInterval: 0 } as const;

describe("tuning", () => {
  it("drops unset options so a provider's own defaults survive", () => {
    expect(tuning({})).toEqual({});
    expect(tuning({ concurrency: 3, minInterval: undefined })).toEqual({
      concurrency: 3,
    });
  });
});

describe("myMemory", () => {
  const ok = (text: string) => ({
    responseData: { translatedText: text },
    responseStatus: 200,
  });

  it("sends langpair and email in MyMemory's documented shape", async () => {
    const { calls, fetch } = fakeFetch(() => ok("こんにちは"));
    const [out] = await myMemory({
      fetch,
      email: "me@example.com",
      ...fast,
    }).handle([ctx("Hello")], next);

    expect(out).toBe("こんにちは");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.origin + calls[0].url.pathname).toBe(
      "https://api.mymemory.translated.net/get"
    );
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      q: "Hello",
      langpair: "en|ja",
      de: "me@example.com",
    });
  });

  it("maps Chinese locales and honors languageCodes", async () => {
    const { calls, fetch } = fakeFetch(() => ok("x"));
    const mw = myMemory({ fetch, languageCodes: { pt: "pt-BR" }, ...fast });
    await mw.handle([ctx("a", "en", "zh-Hant"), ctx("b", "en", "pt")], next);
    expect(calls.map((c) => c.url.searchParams.get("langpair"))).toEqual([
      "en|zh-TW",
      "en|pt-BR",
    ]);
  });

  it("splits by bytes, so a long Japanese text stays under MyMemory's 500-byte limit", async () => {
    const { calls, fetch } = fakeFetch((call) =>
      ok(call.url.searchParams.get("q")!)
    );
    const paragraphs = ["猫", "犬", "鳥"].map((animal) =>
      `${animal}が好きです。`.repeat(15)
    );
    const text = paragraphs.join("\n\n");
    const [out] = await myMemory({ fetch, ...fast }).handle(
      [ctx(text, "ja", "en")],
      next
    );

    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(
        Buffer.byteLength(call.url.searchParams.get("q")!)
      ).toBeLessThanOrEqual(500);
    }
    expect(out).toBe(text);
  });

  it("throws on an error MyMemory reports as HTTP 200, without retrying", async () => {
    const { calls, fetch } = fakeFetch(() => ({
      responseData: { translatedText: "'ZZ' IS AN INVALID TARGET LANGUAGE" },
      responseStatus: "403",
      responseDetails: "'ZZ' IS AN INVALID TARGET LANGUAGE",
    }));
    await expect(
      myMemory({ fetch, ...fast }).handle([ctx("Hello", "en", "zz")], next)
    ).rejects.toThrow(
      "MyMemory responded 403: 'ZZ' IS AN INVALID TARGET LANGUAGE"
    );
    expect(calls).toHaveLength(1);
  });

  it("explains a used-up daily allowance", async () => {
    const { fetch } = fakeFetch(() => ({
      responseData: {
        translatedText:
          "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY",
      },
      responseStatus: 429,
      quotaFinished: true,
    }));
    await expect(
      myMemory({ fetch, ...fast }).handle([ctx("Hello")], next)
    ).rejects.toThrow(/allowance is used up/);
  });

  it("decodes the entities MyMemory adds, but keeps a literal one from the source", async () => {
    const { fetch } = fakeFetch((call) =>
      ok(
        call.url.searchParams
          .get("q")!
          .replace("Tom & Jerry", "Tom &amp; Jerry")
      )
    );
    const [out] = await myMemory({ fetch, ...fast }).handle(
      [ctx("Tom & Jerry and &amp; and it&#39;s")],
      next
    );
    expect(out).toBe("Tom & Jerry and &amp; and it&#39;s");
  });

  it("keeps code and placeholders out of the request", async () => {
    const { calls, fetch } = fakeFetch((call) =>
      ok(call.url.searchParams.get("q")!.toUpperCase())
    );
    const [out] = await myMemory({ fetch, ...fast }).handle(
      [ctx("Run `npm i` for %{name}")],
      next
    );
    expect(calls[0].url.searchParams.get("q")).not.toMatch(/npm|name/);
    expect(out).toBe("RUN `npm i` FOR %{name}");
  });

  it("retries a 5xx, then succeeds", async () => {
    const { calls, fetch } = fakeFetch((_c, n) =>
      n === 1 ? { __status: 503, body: "busy" } : ok("ok")
    );
    const [out] = await myMemory({ fetch, ...fast }).handle(
      [ctx("Hello")],
      next
    );
    expect(out).toBe("ok");
    expect(calls).toHaveLength(2);
  });
});

describe("googleFree", () => {
  it("sends every text in one POST with the documented query", async () => {
    const { calls, fetch } = fakeFetch((call) =>
      (call.body as URLSearchParams).getAll("q").map((q) => `T:${q}`)
    );
    const out = await googleFree({ fetch, ...fast }).handle(
      [ctx("one"), ctx("two"), ctx("three")],
      next
    );

    expect(out).toEqual(["T:one", "T:two", "T:three"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url.origin + calls[0].url.pathname).toBe(
      "https://clients5.google.com/translate_a/t"
    );
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({
      client: "dict-chrome-ex",
      sl: "en",
      tl: "ja",
    });
  });

  it("maps locales to Google's codes", async () => {
    const { calls, fetch } = fakeFetch((call) =>
      (call.body as URLSearchParams).getAll("q")
    );
    await googleFree({ fetch, ...fast }).handle(
      [
        ctx("a", "en-US", "zh-Hans"),
        ctx("b", "en", "zh-Hant"),
        ctx("c", "en", "nb"),
      ],
      next
    );
    expect(calls.map((c) => c.url.searchParams.get("tl"))).toEqual([
      "zh-CN",
      "zh-TW",
      "no",
    ]);
    expect(calls[0].url.searchParams.get("sl")).toBe("en");
  });

  it("rejects an unknown language instead of returning the source unchanged", async () => {
    const { calls, fetch } = fakeFetch(() => []);
    await expect(
      googleFree({ fetch, ...fast }).handle([ctx("Hi", "en", "zz")], next)
    ).rejects.toThrow(/isn't a language code Google Translate accepts/);
    expect(calls).toHaveLength(0);
    // ...but an explicit override is trusted.
    const ok = fakeFetch((call) => (call.body as URLSearchParams).getAll("q"));
    await googleFree({
      fetch: ok.fetch,
      languageCodes: { zz: "yi" },
      ...fast,
    }).handle([ctx("Hi", "en", "zz")], next);
    expect(ok.calls[0].url.searchParams.get("tl")).toBe("yi");
  });

  it("accepts the [text, lang] pair shape", async () => {
    const { fetch } = fakeFetch(() => [["こんにちは", "en"]]);
    expect(
      await googleFree({ fetch, ...fast }).handle([ctx("Hello")], next)
    ).toEqual(["こんにちは"]);
  });

  it("throws if the response isn't what the endpoint used to return", async () => {
    const { fetch } = fakeFetch(() => ({ unexpected: true }));
    await expect(
      googleFree({ fetch, ...fast }).handle([ctx("Hello")], next)
    ).rejects.toThrow(/unexpected response/);
  });

  it("retries the CAPTCHA page (HTTP 429) and then reports it plainly", async () => {
    const { calls, fetch } = fakeFetch(() => ({
      __status: 429,
      body: "<html><title>Sorry...</title><body>unusual traffic</body></html>",
    }));
    await expect(
      googleFree({
        fetch,
        retry: { retries: 1, delay: 0 },
        minInterval: 0,
      }).handle([ctx("Hello")], next)
    ).rejects.toThrow(
      /Google Translate \(keyless\) responded 429: Sorry\.\.\. unusual traffic/
    );
    expect(calls).toHaveLength(2);
  });

  it("packs many segments into batches of at most 20", async () => {
    const { calls, fetch } = fakeFetch((call) =>
      (call.body as URLSearchParams).getAll("q")
    );
    await googleFree({ fetch, ...fast }).handle(
      Array.from({ length: 45 }, (_, i) => ctx(`text ${i}`)),
      next
    );
    expect(
      calls.map((c) => (c.body as URLSearchParams).getAll("q").length)
    ).toEqual([20, 20, 5]);
  });
});
