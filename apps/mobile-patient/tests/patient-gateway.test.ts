import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPatientReader,
  PatientApiError,
} from "../src/core/patientGateway.ts";

test("gateway инертен до явного вызова и читает существующий patient API с cookies", async () => {
  const calls: { url: string; options: RequestInit }[] = [];
  const reader = createPatientReader({
    baseUrl: "https://clinic.example/",
    request: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          patientId: "p1",
          plan: [],
          reports: [],
          messages: [],
        }),
      };
    },
  });
  assert.equal(calls.length, 0);
  const record = await reader.record();
  assert.equal(record.patientId, "p1");
  assert.equal(calls[0].url, "https://clinic.example/api/patient/record");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.method, "GET");
});
test("настоящий адрес обязателен, HTTP разрешён только явно для локального стенда", () => {
  for (const baseUrl of [
    "",
    "http://clinic.example",
    "https://user:secret@clinic.example",
    "https://clinic.example/path",
  ])
    assert.throws(() => createPatientReader({ baseUrl }));
  assert.throws(() => createPatientReader({ baseUrl: "http://10.0.2.2:5080" }));
  assert.doesNotThrow(() =>
    createPatientReader({
      baseUrl: "http://10.0.2.2:5080",
      allowLocalHttp: true,
    }),
  );
  assert.throws(() =>
    createPatientReader({
      baseUrl: "http://clinic.example",
      allowLocalHttp: true,
    }),
  );
});
test("отказ доступа и конфликт не заменяются учебным планом и не повторяются скрыто", async () => {
  for (const status of [401, 403, 409, 500]) {
    let calls = 0;
    const reader = createPatientReader({
      baseUrl: "https://clinic.example",
      request: async () => {
        calls++;
        return { ok: false, status, json: async () => ({ detail: "private" }) };
      },
    });
    await assert.rejects(
      reader.record(),
      (e) =>
        e instanceof PatientApiError &&
        e.status === status &&
        !e.message.includes("private"),
    );
    assert.equal(calls, 1);
  }
});
test("некорректный JSON, сеть и отмена не превращаются в успешную запись", async () => {
  for (const response of [
    null,
    {},
    { patientId: "p1", plan: "wrong", reports: [], messages: [] },
  ]) {
    const reader = createPatientReader({
      baseUrl: "https://clinic.example",
      request: async () => ({
        ok: true,
        status: 200,
        json: async () => response,
      }),
    });
    await assert.rejects(reader.record(), /формат/);
  }
  const reader = createPatientReader({
    baseUrl: "https://clinic.example",
    request: async () => {
      throw new TypeError("network");
    },
  });
  await assert.rejects(reader.record(), /соединиться/);
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const abortable = createPatientReader({
    baseUrl: "https://clinic.example",
    request: async () => {
      called = true;
      throw Error("unexpected");
    },
  });
  await assert.rejects(
    abortable.record(controller.signal),
    (e) => e instanceof Error && e.name === "AbortError",
  );
  assert.equal(called, false);
});
