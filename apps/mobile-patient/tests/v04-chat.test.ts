import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
const now = {
  utcMs: new Date("2026-10-25T12:00:00Z").getTime(),
  zone: "Europe/Moscow",
  offsetMinutes: 180,
};
test("переписка сохраняется идемпотентно и очищается отдельно от терапии", () => {
  const s = seedScenario("2026-10-25"),
    message = { id: "u1", role: "user" as const, text: "План" };
  const a = applyPatientCommand(
    s,
    { type: "chat:append", messages: [message] },
    now,
  );
  assert.deepEqual(a.chat, [message]);
  assert.equal(
    applyPatientCommand(a, { type: "chat:append", messages: [message] }, now)
      .chat?.length,
    1,
  );
  const b = applyPatientCommand(a, { type: "chat:clear" }, now);
  assert.deepEqual(b.chat, []);
  assert.deepEqual(b.events, s.events);
});
test("некорректные сообщения не попадают в хранилище", () =>
  assert.throws(() =>
    applyPatientCommand(
      seedScenario("2026-10-25"),
      {
        type: "chat:append",
        messages: [{ id: "bad", role: "user", text: " " }],
      },
      now,
    ),
  ));
