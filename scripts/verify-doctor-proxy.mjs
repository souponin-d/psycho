import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "..");
const configPath =
  process.env.DOCTOR_PROXY_CONFIG ??
  path.join(root, ".cache/release-prep/proxy-fixture.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
assert.match(
  config.connectionString,
  /^Host=127\.0\.0\.1;Port=\d+;Database=syncli_proxy_checks;/,
);
const dotnet = process.env.DOCTOR_DOTNET ?? "dotnet";
const assembly =
  process.env.DOCTOR_PROXY_API_DLL ??
  path.join(root, "apps/doctor-api/bin/Release/net10.0/Doctor.Api.dll");
const apiPort = config.apiPort;
const env = {
  ...process.env,
  ConnectionStrings__Doctor: config.connectionString,
  ASPNETCORE_ENVIRONMENT: "Production",
  ASPNETCORE_URLS: "http://127.0.0.1:" + apiPort + ";http://[::1]:" + apiPort,
  ASPNETCORE_HTTPS_PORT: "443",
  AllowedHosts: "demo.example.test",
  Doctor__KeyDirectory: config.keyDirectory,
  Doctor__KeyCertificatePath: config.certificatePath,
  Doctor__KeyCertificatePassword: config.certificatePassword,
};
for (const key of [
  "ASPNETCORE_FORWARDEDHEADERS_ENABLED",
  "DOTNET_FORWARDEDHEADERS_ENABLED",
  "ForwardedHeaders_Enabled",
])
  delete env[key];
const email = "proxy-" + randomUUID() + "@example.test";
const password = randomUUID();
const provision = spawnSync(dotnet, [assembly, "--provision"], {
  cwd: path.dirname(assembly),
  env: {
    ...env,
    Provision__Id: randomUUID(),
    Provision__ClinicId: randomUUID(),
    Provision__Name: "Синтетический врач",
    Provision__Specialty: "psychiatrist",
    Provision__Email: email,
    Provision__Password: password,
  },
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(provision.status, 0, provision.stderr);
const log = fs.openSync(
  path.join(root, ".cache/release-prep/proxy-api.log"),
  "w",
);
const child = spawn(dotnet, [assembly], {
  cwd: path.dirname(assembly),
  env,
  stdio: ["ignore", log, log],
  windowsHide: true,
});
fs.closeSync(log);
let passed = 0;
function ok(name) {
  passed++;
  console.log("PASS " + name);
}
const trusted = {
  "X-Forwarded-For": "198.51.100.10",
  "X-Forwarded-Proto": "https",
};
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const body =
      options.body === undefined ? undefined : JSON.stringify(options.body);
    const req = http.request(
      {
        hostname: options.hostname ?? "127.0.0.1",
        port: apiPort,
        path: url,
        method: options.method ?? "GET",
        localAddress: options.localAddress,
        agent: false,
        headers: {
          Host: options.host ?? "demo.example.test",
          ...options.headers,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (part) => (raw += part));
        res.on("end", () => {
          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end(body);
  });
}
function cookieHeader(response) {
  return (response.headers["set-cookie"] ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function csrf(headers) {
  const response = await request("/api/csrf", { headers });
  assert.equal(response.status, 200);
  return {
    Cookie: cookieHeader(response),
    "X-CSRF-TOKEN": response.body.token,
  };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null)
      throw new Error("API exited; inspect proxy-api.log");
    try {
      await request("/api/health");
      ready = true;
      break;
    } catch {}
    await delay(250);
  }
  assert(ready, "API readiness timeout");
  assert.equal(
    (await request("/api/health", { headers: trusted })).status,
    200,
    "Trusted HTTPS proxy must reach API without redirect",
  );
  ok("trusted IPv4 proxy restores HTTPS before redirection");

  const direct = await request("/api/health");
  assert.equal(direct.status, 307);
  assert.equal(direct.headers.location, "https://demo.example.test/api/health");
  ok("direct HTTP remains redirected to HTTPS");
  assert.equal(
    (
      await request("/api/health", {
        localAddress: "127.0.0.2",
        headers: trusted,
      })
    ).status,
    307,
  );
  assert.equal(
    (await request("/api/health", { hostname: "::1", headers: trusted }))
      .status,
    307,
  );
  ok("other IPv4 loopback and IPv6 loopback are not trusted");

  for (const headers of [
    { "X-Forwarded-Proto": "https" },
    { "X-Forwarded-Proto": "https", "X-Forwarded-For": "not-an-ip" },
    {
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": "198.51.100.1, 198.51.100.2",
    },
  ])
    assert.equal((await request("/api/health", { headers })).status, 307);
  ok("missing, malformed and asymmetric forwarding does not bypass HTTPS");
  const forwardedHost = await request("/api/health", {
    headers: { "X-Forwarded-Host": "attacker.example.test" },
  });
  assert.equal(
    forwardedHost.headers.location,
    "https://demo.example.test/api/health",
  );
  assert.equal(
    (
      await request("/api/health", {
        host: "attacker.example.test",
        headers: trusted,
      })
    ).status,
    400,
  );
  ok("forwarded Host is ignored and AllowedHosts remains enforced");
  assert.equal(
    (await request("/api/not-a-route", { headers: trusted })).status,
    404,
  );
  ok("API prefix is retained and unknown API routes stay 404");

  const tokenResponse = await request("/api/csrf", { headers: trusted });
  assert.equal(tokenResponse.status, 200);
  for (const attr of ["secure", "httponly", "samesite=strict"])
    assert(
      tokenResponse.headers["set-cookie"].some((c) =>
        c.toLowerCase().includes(attr),
      ),
    );
  const csrfCookie = cookieHeader(tokenResponse);
  const login = await request("/api/login", {
    method: "POST",
    headers: {
      ...trusted,
      Cookie: csrfCookie,
      "X-CSRF-TOKEN": tokenResponse.body.token,
    },
    body: { email, password },
  });
  assert.equal(login.status, 200);
  for (const attr of ["secure", "httponly", "samesite=strict"])
    assert(
      login.headers["set-cookie"].some((c) => c.toLowerCase().includes(attr)),
    );
  const sessionHeaders = {
    ...trusted,
    Cookie: csrfCookie + "; " + cookieHeader(login),
  };
  assert.equal(
    (await request("/api/session", { headers: sessionHeaders })).status,
    200,
  );
  assert.equal(
    (await request("/api/patients", { headers: sessionHeaders })).status,
    200,
  );
  assert.equal(
    (await request("/api/logout", { method: "POST", headers: sessionHeaders }))
      .status,
    400,
  );
  const session = await request("/api/session", { headers: sessionHeaders });
  assert.equal(
    (
      await request("/api/logout", {
        method: "POST",
        headers: { ...sessionHeaders, "X-CSRF-TOKEN": session.body.csrfToken },
      })
    ).status,
    204,
  );
  ok(
    "Production login, secure cookies, authenticated reads and CSRF protection",
  );

  const clientA = {
    "X-Forwarded-For": "198.51.100.20",
    "X-Forwarded-Proto": "https",
  };
  const clientB = {
    "X-Forwarded-For": "198.51.100.21",
    "X-Forwarded-Proto": "https",
  };
  const tokenA = await csrf(clientA),
    tokenB = await csrf(clientB);
  for (let i = 0; i < 10; i++) {
    const response = await request("/api/login", {
      method: "POST",
      headers: { ...clientA, ...tokenA },
      body: { email, password: "wrong-synthetic-password" },
    });
    assert.equal(response.status, 401);
  }
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        headers: { ...clientA, ...tokenA },
        body: { email, password: "wrong-synthetic-password" },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        headers: { ...clientB, ...tokenB },
        body: { email, password: "wrong-synthetic-password" },
      })
    ).status,
    401,
  );
  ok("login limiter is partitioned by restored client IP");
  assert.equal(
    (
      await request("/api/login", {
        method: "POST",
        headers: {
          ...tokenA,
          "X-Forwarded-For": "203.0.113.90, 198.51.100.20",
          "X-Forwarded-Proto": "http, https",
        },
        body: { email, password: "wrong-synthetic-password" },
      })
    ).status,
    429,
  );
  ok(
    "only nearest proxy hop is consumed; prepended client IP cannot evade limiter",
  );

  for (const key of [
    "ASPNETCORE_FORWARDEDHEADERS_ENABLED",
    "DOTNET_FORWARDEDHEADERS_ENABLED",
    "ForwardedHeaders_Enabled",
  ]) {
    const result = spawnSync(dotnet, [assembly], {
      cwd: path.dirname(assembly),
      env: { ...env, [key]: "true" },
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /ForwardedHeaders_Enabled/);
  }
  ok("unrestricted forwarded-header environment switches fail startup");
  console.log(passed + " proxy checks passed");
} finally {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
}
