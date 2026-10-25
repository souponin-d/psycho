import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { createPatientRepository } from "../src/storage/database.ts";
import type { ContactEvent } from "../src/core/journeyModel.ts";
const day = "2026-10-25",
  now = {
    utcMs: Date.parse(day + "T12:00:00Z"),
    offsetMinutes: 0,
    zone: "UTC",
  };
const event: Omit<ContactEvent, "at" | "recordedDay"> = {
  id: "contact-new",
  kind: "contact",
  day,
  onset: "2026-10-24",
  description: "Трудность появилась вчера",
  severity: "Заметная",
  preference: "earlier",
};
test("обращение без выбранной выраженности или способа связи не принимается", () => {
  for (const field of ["severity", "preference"] as const) {
    const input: Partial<typeof event> = { ...event };
    delete input[field];
    assert.throws(
      () =>
        applyPatientCommand(
          seedScenario(day),
          { type: "event", event: input as typeof event },
          now,
        ),
      /выберите|Выберите/,
    );
  }
});
test("невалидная, будущая дата начала и пустое описание не сохраняются", () => {
  for (const patch of [
    { onset: "2026-02-30" },
    { onset: "2026-10-26" },
    { description: "   " },
  ])
    assert.throws(() =>
      applyPatientCommand(
        seedScenario(day),
        { type: "event", event: { ...event, ...patch } },
        now,
      ),
    );
});
test("начало вчера сохраняется отдельно от даты записи; сохранение очищает черновик", () => {
  let s = applyPatientCommand(
    seedScenario(day),
    {
      type: "draft",
      draft: {
        id: "contact:" + day,
        day,
        kind: "contact",
        contact: {
          description: event.description,
          onset: event.onset,
          severity: "Заметная",
          preference: "earlier",
        },
      },
    },
    now,
  );
  s = applyPatientCommand(s, { type: "event", event }, now);
  const saved = s.events.find((e) => e.id === event.id);
  assert.equal(saved?.kind, "contact");
  if (saved?.kind !== "contact") throw Error("Нет обращения");
  assert.equal(saved.onset, "2026-10-24");
  assert.equal(saved.recordedDay, day);
  assert.equal(s.drafts["contact:" + day], undefined);
});
test("незавершённый контакт восстанавливается после перезапуска repository без предвыбора", async () => {
  let raw = JSON.stringify(seedScenario(day));
  const port = {
    read: async () => raw,
    write: async (v: string) => {
      raw = v;
    },
  };
  let repo = createPatientRepository(
    port,
    async () => null,
    () => now,
  );
  await repo.saveDraft({
    id: "contact:" + day,
    day,
    kind: "contact",
    contact: { description: "Пишу обращение", onset: "2026-10-24" },
  });
  repo = createPatientRepository(
    port,
    async () => null,
    () => now,
  );
  const restored = (await repo.load()).drafts["contact:" + day].contact!;
  assert.equal(restored.description, "Пишу обращение");
  assert.equal(restored.onset, "2026-10-24");
  assert.equal(restored.severity, undefined);
  assert.equal(restored.preference, undefined);
});
