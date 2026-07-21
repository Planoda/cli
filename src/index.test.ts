/**
 * Vitest spec for `@planoda/cli` error formatting.
 *
 * Mirrors the fetch-mock style used in `packages/sdk/src/index.test.ts`:
 * stub global `fetch` to return a canned `Response` and drive `api()`
 * through its error branch deterministically (no real network).
 *
 * `main()` only runs when this file is executed directly (see the
 * `process.argv[1] === fileURLToPath(import.meta.url)` guard at the bottom
 * of `index.ts`), so importing `api`/`CliError` here is side-effect-free.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, CliError, type Ctx } from "./index.js";

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function ctx(): Ctx {
  return { origin: "https://api.test", apiKey: undefined, json: false };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("@planoda/cli — 429 rate-limit formatting", () => {
  it("builds an actionable message from Retry-After + X-RateLimit-Limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          429,
          { error: "rate_limited" },
          { "retry-after": "31", "x-ratelimit-limit": "10" }
        )
      )
    );

    const call = api(
      ctx(),
      "POST",
      "/api/public/ai/triage",
      { tasks: "x" },
      { auth: false }
    );
    await expect(call).rejects.toBeInstanceOf(CliError);
    await expect(call).rejects.toMatchObject({
      message:
        "rate limited — the free demo endpoint allows 10 requests/min. Retry in 31s, or set PLANODA_API_KEY for higher limits.",
    });
  });

  it("degrades gracefully when neither header is present (no undefined/NaN)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(429, { error: "rate_limited" }))
    );

    const err: unknown = await api(
      ctx(),
      "POST",
      "/api/public/ai/triage",
      { tasks: "x" },
      { auth: false }
    ).catch((e) => e);

    expect(err).toBeInstanceOf(CliError);
    const message = (err as CliError).message;
    expect(message).not.toMatch(/undefined|NaN/);
    expect(message).toBe(
      "rate limited — too many requests to the free demo endpoint. Retry shortly, or set PLANODA_API_KEY for higher limits."
    );
  });

  it("omits just the missing clause when only one header is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(429, { error: "rate_limited" }, { "x-ratelimit-limit": "10" })
      )
    );
    const limitOnlyErr: unknown = await api(
      ctx(),
      "POST",
      "/api/public/ai/triage",
      { tasks: "x" },
      { auth: false }
    ).catch((e) => e);
    expect((limitOnlyErr as CliError).message).toBe(
      "rate limited — the free demo endpoint allows 10 requests/min. Retry shortly, or set PLANODA_API_KEY for higher limits."
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(429, { error: "rate_limited" }, { "retry-after": "31" })
      )
    );
    const retryOnlyErr: unknown = await api(
      ctx(),
      "POST",
      "/api/public/ai/triage",
      { tasks: "x" },
      { auth: false }
    ).catch((e) => e);
    expect((retryOnlyErr as CliError).message).toBe(
      "rate limited — too many requests to the free demo endpoint. Retry in 31s, or set PLANODA_API_KEY for higher limits."
    );
  });

  it("does not special-case a non-429 error — formats as `<status> <error>` unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(500, { error: "boom" }, { "retry-after": "31" })
      )
    );

    const call = api(ctx(), "GET", "/api/v1/users/me", undefined, {
      auth: false,
    });
    await expect(call).rejects.toBeInstanceOf(CliError);
    await expect(call).rejects.toMatchObject({ message: "500 boom" });
  });
});
