import { test } from "node:test";
import assert from "node:assert/strict";
import { createPatientChannel } from "../src/core/patientChannel.ts";
const record = {
  patientId: "p1",
  name: "Синтетический пациент",
  messages: [
    {
      id: "m1",
      direction: "doctor",
      text: "Связь подтверждена",
      status: "recorded",
      createdAt: "2026-10-26T09:00:00Z",
    },
  ],
};
test("владелец очереди появляется только после подтверждённого входа и исчезает при блокировке", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: t.request,
  });
  assert.equal(c.owner(), null);
  await c.connect("ACCESS-CODE-12345");
  assert.deepEqual(c.owner(), {
    origin: "https://clinic.example",
    clinicId: "c1",
    patientId: "p1",
    actorId: "u1",
  });
  c.lock();
  assert.equal(c.owner(), null);
});
test("канал передаёт подтверждённый план, а неизвестный формат плана не ломает переписку", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: t.request,
  });
  const snapshot = await c.connect("ACCESS-CODE-12345");
  assert.deepEqual(snapshot.plan, { kind: "unavailable" });
  assert.equal(snapshot.messages[0]?.text, "Связь подтверждена");
});
test("канал получает несколько подтверждённых назначений из проекции сервера", async () => {
  const t = transport();
  const appointment = {
    id: "m1",
    kind: "medication",
    title: "Препарат",
    dose: "10 мг",
    schedule: "Утром",
    startDate: "2026-10-26",
    endDate: "",
    status: "confirmed",
    patientInstructions: "По назначению",
  };
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async (url, init) =>
      url.endsWith("/patient/record")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              ...record,
              plan: [appointment, { ...appointment, id: "m2" }],
            }),
          }
        : t.request(url, init),
  });
  const result = await c.connect("ACCESS-CODE-12345");
  assert.equal(result.plan.kind, "ready");
  if (result.plan.kind === "ready")
    assert.deepEqual(
      result.plan.items.map((item) => item.id),
      ["m1", "m2"],
    );
});
test("отметка передаётся с идентификатором версии и без подменяемого происхождения", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: t.request,
  });
  await c.connect("ACCESS-CODE-12345");
  const value = {
    scheduleId: "s1",
    scheduleVersion: 1,
    plannedAt: "2026-10-26T06:00:00.000Z",
    status: "taken" as const,
    reportedAt: "2026-10-26T06:10:00.000Z",
    expectedVersion: 0,
    reason: "",
  };
  await c.markDose(value, "dose-id");
  const body = JSON.parse(
    String(
      t.calls.find((call) => call.url.endsWith("/commands"))?.options.body,
    ),
  );
  assert.equal(body.commandId, "dose-id");
  assert.deepEqual(body.mutation, { type: "dose.patient", value });
  assert.ok(!("provenance" in body.mutation.value));
});
test("сообщение принимает описание на пределе формы вместе с метаданными и отклоняет превышение серверного лимита", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: t.request,
  });
  await c.connect("ACCESS-CODE-12345");
  const text = `${"а".repeat(1000)}\nНачалось: 2026-10-26. Выраженность: Лёгкая. Предпочтение: на плановом приёме.`;
  await c.send(text, "full-contact");
  assert.ok(
    t.calls.some(
      (call) =>
        call.url.endsWith("/commands") &&
        JSON.parse(String(call.options.body)).mutation.text === text,
    ),
  );
  const before = t.calls.length;
  await assert.rejects(c.send("а".repeat(20001), "too-long"));
  assert.equal(t.calls.length, before);
});
function transport() {
  const calls: { url: string; options: RequestInit }[] = [];
  return {
    calls,
    request: async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      const body = url.endsWith("/csrf")
        ? { token: "anon" }
        : url.endsWith("/access")
          ? { role: "patient" }
          : url.endsWith("/session")
            ? {
                actor: {
                  id: "u1",
                  clinicId: "c1",
                  patientId: "p1",
                  specialty: "patient",
                },
                csrfToken: "session",
              }
            : record;
      return { ok: true, status: 200, json: async () => body };
    },
  };
}
test("канал не делает запросов до ввода кода; блокировка исключает отправку демоданных", async () => {
  const t = transport(),
    c = createPatientChannel({
      baseUrl: "https://clinic.example",
      request: t.request,
    });
  assert.equal(t.calls.length, 0);
  await assert.rejects(c.send("demo", "id"), /код/);
  assert.equal(t.calls.length, 0);
  await c.connect("ACCESS-CODE-12345");
  assert(c.authorized());
  const before = t.calls.length;
  c.lock();
  await assert.rejects(c.read(), /код/);
  assert.equal(t.calls.length, before);
});
test("код, cookie/CSRF и сообщение используют существующий серверный контракт", async () => {
  const t = transport(),
    c = createPatientChannel({
      baseUrl: "https://clinic.example",
      request: t.request,
    });
  const data = await c.connect(" ACCESS-CODE-12345 ");
  assert.equal(data.patientId, "p1");
  assert.equal(data.messages[0].text, "Связь подтверждена");
  assert.deepEqual(JSON.parse(String(t.calls[1].options.body)), {
    code: "ACCESS-CODE-12345",
  });
  assert.equal(
    (t.calls[1].options.headers as Record<string, string>)["X-CSRF-TOKEN"],
    "anon",
  );
  await c.send("Проверка связи", "stable-id");
  await c.send("Проверка связи", "stable-id");
  const sent = t.calls.filter((x) => x.url.endsWith("/commands"));
  assert.deepEqual(
    sent.map((x) => JSON.parse(String(x.options.body)).commandId),
    ["stable-id", "stable-id"],
  );
  assert.equal(
    (sent[0].options.headers as Record<string, string>)["X-CSRF-TOKEN"],
    "session",
  );
  assert(t.calls.every((x) => x.options.credentials === "include"));
});
test("ошибка кода и отозванная сессия не превращаются в учебный вход", async () => {
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "secret server diagnostic" }),
    }),
  });
  await assert.rejects(
    c.connect("ACCESS-CODE-12345"),
    (e) => e instanceof Error && !e.message.includes("secret"),
  );
  assert.equal(c.authorized(), false);
});
test("отмена при переключении в деморежим исключает старый ответ", async () => {
  let resolve: (v: unknown) => void = () => {};
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async () => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((r) => {
          resolve = r;
        }),
    }),
  });
  const pending = c.connect("ACCESS-CODE-12345");
  await new Promise((r) => setTimeout(r, 0));
  c.lock();
  resolve({ token: "stale" });
  await assert.rejects(
    pending,
    (e) => e instanceof Error && e.name === "AbortError",
  );
  assert.equal(c.authorized(), false);
});
test("неверная проекция пациента не применяется после входа", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async (url, options) =>
      url.endsWith("/record")
        ? {
            ok: true,
            status: 200,
            json: async () => ({ ...record, patientId: "foreign" }),
          }
        : t.request(url, options),
  });
  await assert.rejects(c.connect("ACCESS-CODE-12345"), /пациент|формат/);
  assert.equal(c.authorized(), false);
});
test("повреждённое сообщение отвергается, секретный текст ошибки не показывается", async () => {
  const t = transport();
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async (url, options) =>
      url.endsWith("/record")
        ? {
            ok: true,
            status: 200,
            json: async () => ({
              ...record,
              messages: [{ text: { private: "raw" } }],
            }),
          }
        : t.request(url, options),
  });
  await assert.rejects(c.connect("ACCESS-CODE-12345"), /формат/);
});

test("запоздавший poll не перезаписывает результат отправки", async () => {
  const t = transport();
  let delayRead = false;
  let finish: (value: unknown) => void = () => {};
  const c = createPatientChannel({
    baseUrl: "https://clinic.example",
    request: async (url, options) =>
      delayRead && url.endsWith("/record")
        ? {
            ok: true,
            status: 200,
            json: () =>
              new Promise((resolve) => {
                finish = resolve;
              }),
          }
        : t.request(url, options),
  });
  await c.connect("ACCESS-CODE-12345");
  delayRead = true;
  const old = c.read();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await c.send("Новое сообщение", "new-command");
  finish(record);
  await assert.rejects(
    old,
    (e) => e instanceof Error && e.name === "AbortError",
  );
});
