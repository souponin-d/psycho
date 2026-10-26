import { afterEach, expect, it } from "vitest";
import http from "node:http";
import { once } from "node:events";
import { createApiProxy, proxyConfig } from "../deployment/layero/proxy.mjs";
const servers: http.Server[] = [];
async function listen(server: http.Server) {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((r) => {
          s.closeAllConnections();
          s.close(() => r());
        }),
    ),
  );
});
async function fixture(
  handler: http.RequestListener,
  options: Record<string, unknown> = {},
) {
  const upstream = await listen(http.createServer(handler));
  const proxy = await listen(
    createApiProxy({
      upstream,
      allowLocalHttp: true,
      publicOrigins: ["https://syncli-main.layero.app"],
      timeoutMs: 1000,
      ...options,
    }),
  );
  return { upstream, proxy };
}
async function request(
  origin: string,
  path: string,
  options: {
    method?: string;
    headers?: http.OutgoingHttpHeaders;
    body?: string | Buffer;
  } = {},
) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const req = http.request(
      new URL(origin),
      { path, method: options.method ?? "GET", headers: options.headers },
      (res) => {
        const data: Buffer[] = [];
        res.on("data", (c) => data.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(data),
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}
const json = (res: http.ServerResponse, value: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
it("validates a fixed HTTPS upstream and runtime limits without accepting a destination from the browser", () => {
  expect(proxyConfig({}).upstream).toBe("https://176.32.37.10");
  for (const value of [
    "http://176.32.37.10",
    "https://user:pass@example.test",
    "https://example.test/api",
    "https://example.test?url=other",
    "https://example.test#fragment",
  ])
    expect(() => proxyConfig({ SYNCLI_API_UPSTREAM: value })).toThrow();
  expect(() => proxyConfig({ PORT: "NaN" })).toThrow();
  expect(() => proxyConfig({ SYNCLI_API_TIMEOUT_MS: "60000" })).toThrow();
});
it("preserves the exact command, query, cookie and CSRF while stripping untrusted forwarding and hop headers", async () => {
  let observed: any;
  const f = await fixture(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    observed = {
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    };
    json(res, { revision: 2 });
  });
  const body = JSON.stringify({
    commandId: "synthetic-command",
    mutation: { type: "message.send", text: "Синтетический текст" },
  });
  const r = await request(f.proxy, "/api/patients/synthetic/commands?q=a%2Bb", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "syncli-doctor-session=one",
      "x-csrf-token": "token",
      origin: "https://syncli-main.layero.app",
      "x-forwarded-for": "203.0.113.7",
      forwarded: "for=forged",
      connection: "x-remove",
      "x-remove": "private",
    },
    body,
  });
  expect(r.status).toBe(200);
  expect(observed).toMatchObject({
    url: "/api/patients/synthetic/commands?q=a%2Bb",
    method: "POST",
    body,
  });
  expect(observed.headers.cookie).toBe("syncli-doctor-session=one");
  expect(observed.headers["x-csrf-token"]).toBe("token");
  expect(observed.headers["x-forwarded-for"]).toBeUndefined();
  expect(observed.headers.forwarded).toBeUndefined();
  expect(observed.headers["x-remove"]).toBeUndefined();
  expect(observed.headers.host).toBe(new URL(f.upstream).host);
});
it("supports both Layero prefix-preserving and stripped API routing without duplicate /api", async () => {
  const f = await fixture((req, res) => json(res, { url: req.url }));
  for (const path of ["/api/health", "/health"])
    expect(JSON.parse((await request(f.proxy, path)).body.toString()).url).toBe(
      "/api/health",
    );
  expect((await request(f.proxy, "/")).status).toBe(200);
});
it("keeps multiple Set-Cookie headers independent and removes only the fixed upstream cookie domain", async () => {
  const f = await fixture((_req, res) => {
    res.setHeader("set-cookie", [
      "syncli-doctor-session=synthetic; Domain=127.0.0.1; Path=/; HttpOnly; Secure; SameSite=Strict",
      "syncli-csrf=synthetic; Path=/; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly; Secure; SameSite=Strict",
    ]);
    json(res, { ok: true });
  });
  const r = await request(f.proxy, "/api/csrf");
  expect(r.headers["set-cookie"]).toHaveLength(2);
  expect(r.headers["set-cookie"]![0]).not.toMatch(/domain=/i);
  expect(r.headers["set-cookie"]![0]).toContain(
    "HttpOnly; Secure; SameSite=Strict",
  );
  expect(r.headers["set-cookie"]![1]).toContain("Wed, 21 Oct 2037");
});
it("never stores one user's cookies for another and forbids caching even on authentication errors", async () => {
  const f = await fixture((req, res) =>
    json(res, { cookie: req.headers.cookie ?? null }, 401),
  );
  const one = await request(f.proxy, "/api/session", {
    headers: { cookie: "syncli-doctor-session=one" },
  });
  const two = await request(f.proxy, "/api/session", {
    headers: { cookie: "syncli-doctor-session=two" },
  });
  const none = await request(f.proxy, "/api/session");
  expect(JSON.parse(one.body.toString()).cookie).toContain("one");
  expect(JSON.parse(two.body.toString()).cookie).toContain("two");
  expect(JSON.parse(none.body.toString()).cookie).toBeNull();
  for (const r of [one, two, none]) {
    expect(r.status).toBe(401);
    expect(r.headers["cache-control"]).toContain("no-store");
    expect(r.headers["surrogate-control"]).toBe("no-store");
    expect(r.headers.vary).toContain("Cookie");
  }
});
it("rejects foreign browser origins before sending a command", async () => {
  let count = 0;
  const f = await fixture((_req, res) => {
    count++;
    json(res, { ok: true });
  });
  const r = await request(f.proxy, "/api/login", {
    method: "POST",
    headers: { origin: "https://other.example" },
    body: "{}",
  });
  expect(r.status).toBe(403);
  expect(count).toBe(0);
});
it.each([400, 401, 403, 404, 409, 429, 500])(
  "preserves API status %s and JSON body",
  async (status) => {
    const f = await fixture((_req, res) =>
      json(res, { detail: "Синтетическая ошибка" }, status),
    );
    const r = await request(f.proxy, "/api/patients");
    expect(r.status).toBe(status);
    expect(JSON.parse(r.body.toString()).detail).toBe("Синтетическая ошибка");
  },
);
it("enforces body limits before forwarding known oversized payloads", async () => {
  let count = 0;
  const f = await fixture(
    (_req, res) => {
      count++;
      json(res, {});
    },
    { maxBodyBytes: 8 },
  );
  const r = await request(f.proxy, "/api/login", {
    method: "POST",
    headers: { "content-length": "9" },
    body: "123456789",
  });
  expect(r.status).toBe(413);
  expect(count).toBe(0);
});
it("limits chunked bodies and does not retry timed-out POST requests", async () => {
  let count = 0;
  const f = await fixture(
    (req, _res) => {
      count++;
      req.resume();
    },
    { timeoutMs: 60, maxBodyBytes: 8 },
  );
  const big = await request(f.proxy, "/api/login", {
    method: "POST",
    headers: { "transfer-encoding": "chunked" },
    body: "123456789",
  });
  expect(big.status).toBe(413);
  const before = count;
  const timeout = await request(f.proxy, "/api/login", {
    method: "POST",
    body: "{}",
  });
  expect(timeout.status).toBe(504);
  expect(count - before).toBe(1);
  expect(timeout.headers["content-type"]).toContain("application/json");
});
it("streams binary source files before the upstream completes", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const f = await fixture(async (_req, res) => {
    res.writeHead(200, { "content-type": "application/pdf" });
    res.write(Buffer.from([0, 1, 2, 255]));
    await gate;
    res.end(Buffer.from([7, 8]));
  });
  const r = await new Promise<Buffer>((resolve, reject) => {
    http
      .get(f.proxy + "/api/sources/synthetic/file", (res) => {
        const data: Buffer[] = [];
        res.once("data", () => release());
        res.on("data", (c) => data.push(c));
        res.on("end", () => resolve(Buffer.concat(data)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
  expect([...r]).toEqual([0, 1, 2, 255, 7, 8]);
});
it("rejects HTML fallback and foreign cookie domains with a safe JSON error", async () => {
  const html = await fixture((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>fallback</html>");
  });
  expect((await request(html.proxy, "/api/health")).status).toBe(502);
  const cookie = await fixture((_req, res) => {
    res.setHeader("set-cookie", "session=private; Domain=other.example");
    json(res, {});
  });
  const r = await request(cookie.proxy, "/api/session");
  expect(r.status).toBe(502);
  expect(r.body.toString()).not.toContain("private");
});
it("normalizes only same-upstream redirects and blocks invalid proxy paths", async () => {
  let root = "";
  const f = await fixture((_req, res) => {
    res.writeHead(307, { location: root + "/api/session" });
    res.end();
  });
  root = f.upstream;
  expect((await request(f.proxy, "/api/login")).headers.location).toBe(
    "/api/session",
  );
  for (const path of [
    "//other.example/api",
    "/api/../session",
    "/api/%2e%2e/session",
    "/api/%2f%2fother.example",
  ]) {
    expect((await request(f.proxy, path)).status).toBe(400);
  }
});
