// Explicit live verification on a synthetic VPS through this exact proxy module.
// NODE_USE_ENV_PROXY/HTTPS_PROXY may be used only for the owner's authorized network route.
import fs from "node:fs";
import http from "node:http";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createApiProxy } from "../deployment/layero/proxy.mjs";
import protocols from "../apps/web-doctor/src/workspace/clinical-protocols.json" with { type: "json" };
const file = process.argv[process.argv.indexOf("--config") + 1];
if (!process.argv.includes("--config") || !file)
  throw new Error("Use --config PRIVATE_SYNTHETIC_CREDENTIALS_JSON");
const config = JSON.parse(fs.readFileSync(file, "utf8"));
for (const key of ["doctorEmail", "doctorPassword", "accessCode", "patientId"])
  assert.equal(typeof config[key], "string", `Missing private setting ${key}`);
const upstream = process.env.SYNCLI_API_UPSTREAM ?? "https://176.32.37.10";
const proxy = createApiProxy({
  upstream,
  publicOrigins: ["https://syncli-main.layero.app"],
  timeoutMs: 20000,
});
proxy.listen(0, "127.0.0.1");
await once(proxy, "listening");
const port = proxy.address().port;
function client() {
  const cookies = new Map();
  let csrf = "";
  return {
    async call(path, method = "GET", body, expected = 200) {
      const payload =
        body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const result = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: "/api" + path,
            method,
            headers: {
              accept: "application/json",
              origin: "https://syncli-main.layero.app",
              ...(payload
                ? {
                    "content-type": "application/json",
                    "content-length": payload.length,
                  }
                : {}),
              ...(csrf ? { "x-csrf-token": csrf } : {}),
              ...(cookies.size
                ? {
                    cookie: [...cookies]
                      .map(([k, v]) => `${k}=${v}`)
                      .join("; "),
                  }
                : {}),
            },
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("error", reject);
            res.on("end", () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                raw: Buffer.concat(chunks).toString(),
              }),
            );
          },
        );
        req.on("error", reject);
        req.end(payload);
      });
      assert.equal(
        result.status,
        expected,
        `${method} ${path}: unexpected HTTP status`,
      );
      assert.ok(result.headers["cache-control"].includes("no-store"));
      for (const header of result.headers["set-cookie"] ?? []) {
        assert.match(header, /;\s*secure(?:;|$)/i);
        assert.match(header, /httponly/i);
        assert.doesNotMatch(header, /;\s*domain=/i);
        const pair = header.split(";", 1)[0],
          equal = pair.indexOf("=");
        cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
      }
      const value = result.raw ? JSON.parse(result.raw) : null;
      if (value?.token || value?.csrfToken)
        csrf = value.csrfToken ?? value.token;
      return value;
    },
  };
}
let passed = 0;
const ok = (text) => {
  passed++;
  console.log("PASS " + text);
};
try {
  const anon = client(),
    doctor = client(),
    patient = client();
  const health = await anon.call("/health");
  assert.equal(health.storage, "postgresql");
  assert.equal(health.contractVersion, "doctor-api-2026-10-26");
  assert.ok(health.release && health.release !== "unversioned");
  ok(
    "new versioned API is reachable through Node proxy over verified upstream HTTPS",
  );
  await doctor.call("/csrf");
  await doctor.call(
    "/login",
    "POST",
    { email: config.doctorEmail, password: config.doctorPassword },
    200,
  );
  await doctor.call("/session");
  const records = await doctor.call("/patients");
  const shared = records.find((p) => p.id === config.patientId);
  assert.ok(shared);
  const originalIds = shared.messages.map((m) => m.id);
  await doctor.call("/terminology/icd10?q=F41.1");
  await doctor.call("/terminology/grls?q=sertraline");
  ok(
    "doctor login/session, bound chart and both current terminology endpoints work through the proxy",
  );
  const testId = randomUUID();
  let chart = await doctor.call(
    "/patients",
    "POST",
    {
      id: testId,
      profile: { name: "Проверка связи Layero", birthDate: "1995-01-01" },
    },
    201,
  );
  const command = async (mutation) => {
    chart = await doctor.call(`/patients/${testId}/commands`, "POST", {
      commandId: randomUUID(),
      expectedRevision: chart.revision,
      mutation,
    });
  };
  const protocol = protocols.find((p) => p.scale === "GAD-7");
  await command({
    type: "workflow.submit",
    value: {
      id: "layero-workflow-" + Date.now(),
      protocolVersion: protocol.version,
      measuredAt: new Date().toISOString(),
      answers: Array(7).fill(0),
      state: "completed",
      safety: "no",
      immediateDanger: "no",
      note: "Техническая проверка API на отдельной синтетической карте",
      assignmentId: "",
    },
  });
  const evaluationId = "layero-support-" + Date.now();
  await command({
    type: "support.evaluate",
    id: evaluationId,
    input: {
      route: "gad",
      observations: [],
      functioning: "unknown",
      depressionSeverity: "unknown",
      response: "unknown",
      preference: "undecided",
      note: "Проверка сохранения синтетического клинического контекста",
    },
  });
  assert.equal(chart.clinicalSupport.evaluations.at(-1).id, evaluationId);
  const reread = (await doctor.call("/patients")).find((p) => p.id === testId);
  assert.equal(reread.clinicalSupport.evaluations.at(-1).id, evaluationId);
  ok(
    "Production synthetic workflow and clinical support persist on a separate test chart",
  );
  await patient.call("/csrf");
  await patient.call("/patient/access", "POST", { code: config.accessCode });
  const session = await patient.call("/patient/session");
  assert.equal(session.actor.patientId, config.patientId);
  await patient.call("/patients", "GET", undefined, 403);
  const messageId = randomUUID(),
    message = {
      commandId: messageId,
      mutation: {
        type: "message.patient",
        text: "Проверка связи Layero: обращение из пациентского канала",
      },
    };
  await patient.call("/patient/commands", "POST", message);
  const repeated = await patient.call("/patient/commands", "POST", message);
  assert.equal(repeated.messages.filter((m) => m.id === messageId).length, 1);
  const refreshed = (await doctor.call("/patients")).find(
    (p) => p.id === config.patientId,
  );
  assert.ok(refreshed.messages.some((m) => m.id === messageId));
  const reply = "Проверка связи Layero: обращение получено врачом";
  await doctor.call(`/patients/${config.patientId}/commands`, "POST", {
    commandId: randomUUID(),
    expectedRevision: refreshed.revision,
    mutation: { type: "message.send", text: reply },
  });
  const received = await patient.call("/patient/record");
  assert.ok(received.messages.some((m) => m.text === reply));
  assert.ok(
    originalIds.every((id) => received.messages.some((m) => m.id === id)),
  );
  assert.equal(received.clinicalSupport, undefined);
  ok(
    "patient message, idempotent retry and doctor reply preserve existing history and patient projection",
  );
  await doctor.call("/logout", "POST", undefined, 204);
  await doctor.call("/session", "GET", undefined, 401);
  await patient.call("/patient/session");
  ok(
    "logout clears only the doctor session; independent patient session stays valid",
  );
  console.log(JSON.stringify({ passed, release: health.release }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Verification failed");
  process.exitCode = 1;
} finally {
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
}
