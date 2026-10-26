import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { createPatientReader } from "../src/core/patientGateway.ts";

test("reader использует реальные read-only операции OpenAPI, а не придуманные маршруты", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../../../docs/contracts/doctor.openapi.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(
    spec.paths["/api/patient/session"].get.operationId,
    "patientSession",
  );
  assert.equal(
    spec.paths["/api/patient/record"].get.operationId,
    "patientRecord",
  );
});
test("сессия принимает csrf только с actor, повреждённая сессия отвергается", async () => {
  for (const body of [
    { actor: { id: "p" }, csrfToken: "token" },
    { actor: null, csrfToken: "token" },
    { actor: {}, csrfToken: "" },
  ]) {
    const reader = createPatientReader({
      baseUrl: "https://clinic.example",
      request: async (url) => {
        assert.equal(url, "https://clinic.example/api/patient/session");
        return { ok: true, status: 200, json: async () => body };
      },
    });
    if (body.actor && body.csrfToken)
      assert.equal((await reader.session()).csrfToken, "token");
    else await assert.rejects(reader.session(), /формат/);
  }
});
test("поздняя отмена чтения исключает применение ответа старого аккаунта", async () => {
  const controller = new AbortController();
  const reader = createPatientReader({
    baseUrl: "https://clinic.example",
    request: async () => {
      controller.abort();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          patientId: "old",
          plan: [],
          reports: [],
          messages: [],
        }),
      };
    },
  });
  await assert.rejects(
    reader.record(controller.signal),
    (e) => e instanceof Error && e.name === "AbortError",
  );
});

test("отмена совместима с AbortController, установленным в React Native", async () => {
  const { AbortController: NativeAbortController } =
    await import("abort-controller");
  const controller = new NativeAbortController();
  const signal = controller.signal as unknown as AbortSignal;
  const reader = createPatientReader({
    baseUrl: "https://clinic.example",
    request: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ actor: {}, csrfToken: "token" }),
    }),
  });
  assert.equal((await reader.session(signal)).csrfToken, "token");
  controller.abort();
  await assert.rejects(
    reader.session(signal),
    (e) => e instanceof Error && e.name === "AbortError",
  );
});
