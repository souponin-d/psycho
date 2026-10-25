import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reportSteps,
  reportStepError,
  reportDraftKey,
  sameReport,
} from "../src/core/reportFlow.ts";
import { seedScenario } from "../src/core/scenario.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import type { ReportFields, ReportEvent } from "../src/core/journeyModel.ts";
const fields: ReportFields = {
  feeling: { valence: 2, energy: 3 },
  sleep: "Обычно",
  anxiety: 4,
  functioning: 6,
  tolerability: "Без трудностей",
};
test("маршрут следует разделам назначения, личный момент не требует врачебных полей", () => {
  assert.deepEqual(reportSteps(true, ["feeling", "sleep"]), [
    "feeling",
    "details",
    "note",
  ]);
  assert.deepEqual(reportSteps(true, ["sleep"]), ["details", "note"]);
  assert.deepEqual(reportSteps(false, ["sleep"]), ["feeling", "note"]);
  assert.equal(reportStepError("note", {}, []), null);
  assert.match(reportStepError("details", {}, ["sleep"])!, /сон/i);
  assert.equal(
    reportStepError("details", fields, ["sleep", "anxiety", "tolerability"]),
    null,
  );
  assert.notEqual(
    reportDraftKey("2026-10-25", true),
    reportDraftKey("2026-10-25", false),
  );
});
test("повторное сохранение одинакового отчёта не создаёт ревизию и атомарно убирает черновик", () => {
  let s = seedScenario("2026-10-25");
  const now = {
    utcMs: Date.parse("2026-10-25T12:00:00Z"),
    offsetMinutes: 0,
    zone: "UTC",
  };
  const event = {
    id: "r1",
    entityId: "report:2026-10-25",
    kind: "report" as const,
    day: "2026-10-25",
    fields,
    note: "",
    label: "Спокойно",
    required: true,
  };
  s = applyPatientCommand(s, { type: "event", event }, now);
  s = applyPatientCommand(
    s,
    {
      type: "draft",
      draft: {
        id: "edit:report:2026-10-25",
        day: "2026-10-25",
        kind: "report",
        fields,
      },
    },
    now,
  );
  const next = applyPatientCommand(
    s,
    {
      type: "event",
      draftId: "edit:report:2026-10-25",
      event: {
        ...event,
        id: "r2",
        fields: { ...fields, feeling: { energy: 3, valence: 2 } },
      },
    },
    now,
  );
  assert.equal(
    next.events.filter((e) => e.entityId === event.entityId).length,
    1,
  );
  assert.equal(next.drafts["edit:report:2026-10-25"], undefined);
  assert(
    sameReport(
      { ...event, at: now.utcMs, recordedDay: event.day } as ReportEvent,
      { ...event, id: "different" },
    ),
  );
});
test("сохранение неполного отчёта сохраняет черновик и не выдаёт выполнение", () => {
  const s = seedScenario("2026-10-25"),
    now = {
      utcMs: Date.parse("2026-10-25T12:00:00Z"),
      offsetMinutes: 0,
      zone: "UTC",
    };
  const withDraft = {
    ...s,
    drafts: {
      "report:2026-10-25": {
        id: "report:2026-10-25",
        day: "2026-10-25",
        kind: "report" as const,
        fields: { feeling: fields.feeling },
      },
    },
  };
  assert.throws(() =>
    applyPatientCommand(
      withDraft,
      {
        type: "event",
        draftId: "report:2026-10-25",
        event: {
          id: "bad",
          kind: "report",
          day: "2026-10-25",
          fields: { feeling: fields.feeling },
          note: "",
          required: true,
        },
      },
      now,
    ),
  );
  assert(withDraft.drafts["report:2026-10-25"]);
  assert.equal(withDraft.events.length, s.events.length);
});
