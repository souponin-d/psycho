import { test } from "node:test";
import assert from "node:assert/strict";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { latestDose } from "../src/core/questionnaires.ts";
import type { JourneyState, DoseEvent } from "../src/core/journeyModel.ts";
const day = "2026-10-25";
const clock = (minute = 0) => ({
  utcMs: Date.parse(day + "T09:" + String(minute).padStart(2, "0") + ":00Z"),
  offsetMinutes: 0,
  zone: "UTC",
});
function select(
  state: JourneyState,
  id: string,
  status: DoseEvent["status"] = "taken",
  time = "09:00",
  action: NonNullable<DoseEvent["action"]> = "select",
) {
  return applyPatientCommand(
    state,
    {
      type: "event",
      event: {
        kind: "dose",
        id,
        day,
        slotId: "morning",
        status,
        occurredAt: status === "taken" ? time : undefined,
        action,
      },
    },
    clock(time === "09:00" ? 0 : 10),
  );
}
test("повторное ручное Принял сохраняет исходное время без ложной ревизии", () => {
  const first = select(seedScenario(day), "first");
  const again = select(first, "second", "taken", "09:10");
  assert.equal(
    again.events.filter((e) => e.kind === "dose" && e.day === day).length,
    1,
  );
  assert.equal(latestDose(again, day, "morning")?.occurredAt, "09:00");
});
test("повтор Пропустил не создаёт исправления, смена решения остаётся доступна", () => {
  let s = select(seedScenario(day), "missed-1", "missed");
  s = select(s, "missed-2", "missed");
  assert.equal(
    s.events.filter((e) => e.kind === "dose" && e.day === day).length,
    1,
  );
  s = select(s, "taken-1", "taken", "09:10");
  assert.equal(latestDose(s, day, "morning")?.status, "taken");
  assert.equal(
    s.events.filter((e) => e.kind === "dose" && e.day === day).length,
    2,
  );
});
test("явное исправление времени создаёт ревизию, прежние события неизменны", () => {
  const first = select(seedScenario(day), "first");
  const fixed = select(first, "correct-time", "taken", "09:10", "correct");
  assert.equal(latestDose(fixed, day, "morning")?.occurredAt, "09:10");
  assert.equal(
    fixed.events.filter((e) => e.kind === "dose" && e.day === day).length,
    2,
  );
  assert.equal(latestDose(first, day, "morning")?.occurredAt, "09:00");
});
