import http from "node:http";
import https from "node:https";

const DEFAULT_ORIGIN = "https://syncli-main.layero.app";
const HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const READ_METHODS = new Set(["GET", "HEAD"]);
const METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const noCache = {
  "cache-control": "private, no-store, max-age=0",
  "surrogate-control": "no-store",
  "cdn-cache-control": "no-store",
  pragma: "no-cache",
  expires: "0",
  "x-content-type-options": "nosniff",
};
function origin(value, allowLocalHttp = false) {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (allowLocalHttp && local && url.protocol === "http:")
    )
  )
    throw new Error("Нужен фиксированный HTTPS origin без пути и реквизитов.");
  return url.origin;
}
function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error("Некорректный лимит proxy runtime.");
  return number;
}
export function proxyConfig(env = process.env) {
  return {
    upstream: origin(env.SYNCLI_API_UPSTREAM ?? "https://176.32.37.10"),
    publicOrigins: (env.SYNCLI_WEB_ORIGINS ?? DEFAULT_ORIGIN)
      .split(",")
      .map((v) => origin(v.trim())),
    port: integer(env.PORT, 3000, 1, 65535),
    timeoutMs: integer(env.SYNCLI_API_TIMEOUT_MS, 20000, 100, 45000),
    maxBodyBytes: 2_000_000,
  };
}
function filtered(headers) {
  const omit = new Set([
    ...HOP,
    ...String(headers.connection ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !omit.has(key.toLowerCase())),
  );
}
function apiPath(raw) {
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\")
  )
    throw new Error("path");
  const path = raw.split("?")[0];
  const decoded = decodeURIComponent(path);
  if (
    /[\0\r\n\\]/.test(decoded) ||
    /%(?:2f|5c|00|0d|0a)/i.test(path) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(decoded)
  )
    throw new Error("path");
  // Layero fullstack may pass the prefix or strip it; upstream always gets one /api.
  return raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")
    ? raw
    : "/api" + raw;
}
function cookie(value, hostname) {
  const pieces = value.split(";");
  return pieces
    .filter((piece, index) => {
      if (!index || !/^\s*domain\s*=/i.test(piece)) return true;
      const domain = piece
        .slice(piece.indexOf("=") + 1)
        .trim()
        .replace(/^\./, "")
        .toLowerCase();
      if (domain !== hostname.toLowerCase()) throw new Error("cookie domain");
      return false;
    })
    .join(";");
}
function responseHeaders(headers, upstream) {
  const result = { ...filtered(headers), ...noCache };
  result.vary = [
    ...new Set([
      ...String(headers.vary ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      "Cookie",
      "Origin",
    ]),
  ].join(", ");
  delete result.etag;
  delete result["last-modified"];
  if (headers["set-cookie"])
    result["set-cookie"] = headers["set-cookie"].map((value) =>
      cookie(value, upstream.hostname),
    );
  if (headers.location) {
    const target = new URL(headers.location, upstream);
    if (target.origin !== upstream.origin) throw new Error("external redirect");
    result.location = target.pathname + target.search + target.hash;
  }
  return result;
}
/** The only state is configuration. Cookies travel per-request, never in a shared jar. */
export function createApiProxy(options) {
  const upstream = new URL(origin(options.upstream, options.allowLocalHttp));
  const publicOrigins = new Set(options.publicOrigins ?? [DEFAULT_ORIGIN]);
  const timeoutMs = integer(options.timeoutMs, 20000, 1, 45000);
  const maxBodyBytes = integer(options.maxBodyBytes, 2_000_000, 1, 2_000_000);
  const transport = upstream.protocol === "https:" ? https : http;
  const server = http.createServer((req, res) => {
    let ended = false;
    let outgoing;
    let deadline;
    const fail = (status, detail) => {
      if (ended) return;
      ended = true;
      clearTimeout(deadline);
      if (outgoing) {
        req.unpipe(outgoing);
        outgoing.destroy();
      }
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const body = Buffer.from(
        JSON.stringify({ title: "Запрос не выполнен", detail }),
      );
      res.writeHead(status, {
        ...noCache,
        vary: "Cookie, Origin",
        "content-type": "application/json; charset=utf-8",
        "content-length": body.length,
      });
      res.end(body);
      req.resume();
    };
    if (!METHODS.has(req.method)) {
      fail(405, "Метод не поддерживается.");
      return;
    }
    if (req.url === "/" && READ_METHODS.has(req.method)) {
      res.writeHead(200, { ...noCache, "content-type": "application/json" });
      res.end(
        req.method === "HEAD"
          ? undefined
          : JSON.stringify({ status: "ready", service: "syncli-api-proxy" }),
      );
      return;
    }
    let path;
    try {
      path = apiPath(req.url);
    } catch {
      fail(400, "Некорректный путь API.");
      return;
    }
    if (
      !READ_METHODS.has(req.method) &&
      req.headers.origin &&
      !publicOrigins.has(req.headers.origin)
    ) {
      fail(403, "Источник запроса не разрешён.");
      return;
    }
    if (
      req.headers["content-length"] &&
      (!/^\d+$/.test(req.headers["content-length"]) ||
        Number(req.headers["content-length"]) > maxBodyBytes)
    ) {
      fail(413, "Превышен допустимый размер запроса.");
      return;
    }
    const headers = filtered(req.headers);
    for (const key of Object.keys(headers))
      if (
        key === "host" ||
        key === "forwarded" ||
        key === "x-real-ip" ||
        key.startsWith("x-forwarded-") ||
        key === "if-none-match" ||
        key === "if-modified-since"
      )
        delete headers[key];
    headers.host = upstream.host;
    headers["cache-control"] = "no-store";
    outgoing = transport.request(
      new URL(path, upstream),
      { method: req.method, headers, rejectUnauthorized: true },
      (incoming) => {
        if (ended) {
          incoming.destroy();
          return;
        }
        try {
          if (
            String(incoming.headers["content-type"] ?? "")
              .toLowerCase()
              .includes("text/html")
          )
            throw new Error("HTML fallback");
          const outgoingHeaders = responseHeaders(incoming.headers, upstream);
          res.writeHead(incoming.statusCode ?? 502, outgoingHeaders);
        } catch {
          incoming.destroy();
          fail(502, "Сервер вернул некорректный ответ API.");
          return;
        }
        incoming.on("error", () =>
          fail(
            502,
            "Ответ сервера получен не полностью. Повторите то же действие.",
          ),
        );
        incoming.pipe(res);
      },
    );
    outgoing.on("error", () =>
      fail(502, "Сервер недоступен. Результат сохранения не подтверждён."),
    );
    deadline = setTimeout(
      () => fail(504, "Сервер не ответил вовремя. Повторите то же действие."),
      timeoutMs,
    );
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBodyBytes)
        fail(413, "Превышен допустимый размер запроса.");
    });
    req.on("aborted", () => {
      ended = true;
      clearTimeout(deadline);
      outgoing.destroy();
    });
    res.on("finish", () => {
      ended = true;
      clearTimeout(deadline);
    });
    res.on("close", () => {
      clearTimeout(deadline);
      if (!res.writableFinished) {
        ended = true;
        outgoing.destroy();
      }
    });
    req.pipe(outgoing);
  });
  server.headersTimeout = 10000;
  server.requestTimeout = timeoutMs + 5000;
  server.keepAliveTimeout = 5000;
  return server;
}
