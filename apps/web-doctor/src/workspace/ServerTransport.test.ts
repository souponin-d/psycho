import { afterEach, expect, it, vi } from "vitest";
import { login, ApiError } from "./repository";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("aborts an unresponsive API after the cold-start budget without switching to local data", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          signal!.addEventListener("abort", () =>
            reject(new DOMException("Timeout", "AbortError")),
          );
        }),
    ),
  );
  const pending = login("synthetic@example.test", "synthetic");
  const observed = pending.catch((e) => e);
  await vi.advanceTimersByTimeAsync(45000);
  const error = await observed;
  expect(signal!.aborted).toBe(true);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(0);
});
it("treats an incomplete successful HTTP body as uncertain, preserving safe command retry semantics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("truncated response");
      },
    })),
  );
  const error = await login("synthetic@example.test", "synthetic").catch(
    (e) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(0);
});
