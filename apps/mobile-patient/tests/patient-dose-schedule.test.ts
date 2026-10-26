import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodePatientDoses,
  doseSlotsForDay,
  doseSlotsForLocalDay,
  localDayBounds,
} from "../src/core/patientDoseSchedule.ts";

const schedule = {
  id: "s1",
  version: 1,
  planId: "p1",
  times: ["09:00", "21:00"],
  offsetMinutes: 180,
  effectiveFrom: "2026-10-26T00:00:00.000Z",
  effectiveUntil: "",
  endDate: "2026-10-30",
  medication: {
    id: "p1",
    title: "Препарат",
    dose: "10 мг",
    schedule: "Два раза",
    patientInstructions: "По плану",
  },
};
test("точные слоты привязаны к расписанию врача, часовому поясу и отметкам", () => {
  const data = decodePatientDoses(
    [schedule],
    [
      {
        id: "r1",
        scheduleId: "s1",
        scheduleVersion: 1,
        plannedAt: "2026-10-26T06:00:00.000Z",
        version: 1,
        status: "taken",
        reportedAt: "2026-10-26T06:05:00.000Z",
        provenance: "patient",
      },
    ],
  );
  assert.equal(data.kind, "ready");
  if (data.kind !== "ready") return;
  const slots = doseSlotsForDay(
    data,
    "2026-10-26",
    Date.parse("2026-10-26T12:00:00Z"),
  );
  assert.deepEqual(
    slots.map((s) => [s.time, s.plannedAt, s.status, s.available]),
    [
      ["09:00", "2026-10-26T06:00:00.000Z", "taken", true],
      ["21:00", "2026-10-26T18:00:00.000Z", "unknown", false],
    ],
  );
});
test("местный день телефона выбирает фактические моменты при несовпадении часовых поясов", () => {
  const data = decodePatientDoses(
    [
      {
        ...schedule,
        times: ["00:01"],
        effectiveFrom: "2026-10-25T00:00:00.000Z",
      },
    ],
    [],
  );
  assert.equal(data.kind, "ready");
  if (data.kind !== "ready") return;
  const slots = doseSlotsForLocalDay(
    data,
    "2026-10-26",
    Date.parse("2026-10-26T00:00:00Z"),
    Date.parse("2026-10-27T00:00:00Z"),
    Date.parse("2026-10-26T22:00:00Z"),
  );
  assert.deepEqual(
    slots.map((s) => s.plannedAt),
    ["2026-10-26T21:01:00.000Z"],
  );
});
test("пропущенная полночь при переходе DST не прибавляет час следующего дня", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/Havana";
    const bounds = localDayBounds("2026-03-08");
    assert.ok(bounds);
    assert.equal(new Date(bounds.end).getHours(), 0);
    assert.equal(new Date(bounds.end).getDate(), 9);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
test("неизвестный или повреждённый формат не превращается в план с выдуманным временем", () => {
  for (const value of [
    null,
    [{ ...schedule, times: ["утром"] }],
    [{ ...schedule, offsetMinutes: 1000 }],
    [{ ...schedule, medication: { ...schedule.medication, id: "other" } }],
  ])
    assert.equal(decodePatientDoses(value, []).kind, "unavailable");
});
test("невозможная дата и отметка вне расписания отклоняются", () => {
  assert.equal(
    decodePatientDoses(
      [{ ...schedule, effectiveFrom: "2026-02-30T00:00:00.000Z" }],
      [],
    ).kind,
    "unavailable",
  );
  assert.equal(
    decodePatientDoses(
      [schedule],
      [
        {
          id: "r1",
          scheduleId: "s1",
          scheduleVersion: 1,
          plannedAt: "2026-10-26T06:01:00.000Z",
          version: 1,
          status: "taken",
          reportedAt: "2026-10-26T06:05:00.000Z",
          provenance: "patient",
        },
      ],
    ).kind,
    "unavailable",
  );
});
test("слоты ограничены датой и сроком действия каждой версии", () => {
  const data = decodePatientDoses(
    [{ ...schedule, effectiveUntil: "2026-10-26T12:00:00.000Z" }],
    [],
  );
  assert.equal(data.kind, "ready");
  if (data.kind !== "ready") return;
  assert.deepEqual(
    doseSlotsForDay(data, "2026-10-26", Date.parse("2026-10-27T12:00:00Z")).map(
      (s) => s.time,
    ),
    ["09:00"],
  );
  assert.deepEqual(
    doseSlotsForDay(data, "2026-10-31", Date.parse("2026-10-31T22:00:00Z")),
    [],
  );
});
test("досрочно закрытая будущая версия остаётся частью истории без активных слотов", () => {
  const data = decodePatientDoses(
    [
      {
        ...schedule,
        effectiveFrom: "2026-10-27T00:00:00.000Z",
        effectiveUntil: "2026-10-26T12:00:00.000Z",
      },
    ],
    [],
  );
  assert.equal(data.kind, "ready");
  if (data.kind !== "ready") return;
  assert.deepEqual(
    doseSlotsForDay(data, "2026-10-27", Date.parse("2026-10-27T22:00:00Z")),
    [],
  );
});
