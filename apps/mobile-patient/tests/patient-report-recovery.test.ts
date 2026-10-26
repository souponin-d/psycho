import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePatientReports } from "../src/core/patientReportRecovery.ts";
import { createServerJourney } from "../src/core/serverJourney.ts";
import { applyPatientCommand } from "../src/core/patientCommands.ts";
import { latestReports } from "../src/core/questionnaires.ts";
import { projectHistory } from "../src/core/history.ts";

const when = "2026-10-26T12:00:00.000Z";
const now = { utcMs: Date.parse(when), zone: "UTC", offsetMinutes: 0 };
const mobile = {
  id: "report-1",
  entityId: "report:2026-10-25",
  day: "2026-10-25",
  formVersion: "syncli-report-v1",
  reportedAt: when,
  fields: {
    feeling: { valence: 4, energy: 2 },
    sleep: "Обычно",
    anxiety: 3,
    functioning: 7,
    tolerability: "Без трудностей",
  },
  note: "Тест",
  label: "Ровно",
};

test("серверный самоотчёт восстанавливается в истории без игровых наград и дублей", () => {
  const decoded = decodePatientReports([
    { id: mobile.id, provenance: "patient", mobile },
    { id: "clinician", provenance: "clinician" },
  ]);
  assert.equal(decoded.kind, "ready");
  if (decoded.kind !== "ready") return;
  const initial = createServerJourney("2026-10-26");
  const restored = applyPatientCommand(
    initial,
    { type: "server:reports", reports: decoded.reports },
    now,
  );
  assert.deepEqual(latestReports(restored)[0]?.fields, mobile.fields);
  assert.deepEqual(restored.rewards, []);
  assert.equal(
    projectHistory(restored, { from: mobile.day, to: mobile.day }).days[0]
      ?.reports[0]?.edited,
    false,
  );
  const again = applyPatientCommand(
    restored,
    { type: "server:reports", reports: decoded.reports },
    now,
  );
  assert.equal(again.events.length, 1);
});
test("неподдерживаемая запись не скрывает корректные записи и явно отмечает частичное восстановление", () => {
  const result = decodePatientReports([
    {
      id: "other",
      provenance: "patient",
      mobile: { ...mobile, id: "other", formVersion: "unknown" },
    },
    { id: mobile.id, provenance: "patient", mobile },
  ]);
  assert.equal(result.kind, "partial");
  if (result.kind === "partial")
    assert.deepEqual(
      result.reports.map((r) => r.id),
      [mobile.id],
    );
  assert.equal(decodePatientReports(undefined).kind, "unavailable");
});
test("повторная загрузка не восстанавливает локально удалённую запись и удаляет сохранённый черновик при гонке", () => {
  const decoded = decodePatientReports([
    { id: mobile.id, provenance: "patient", mobile },
  ]);
  assert.equal(decoded.kind, "ready");
  if (decoded.kind !== "ready") return;
  const initial = createServerJourney("2026-10-26");
  initial.drafts["draft-1"] = {
    id: "draft-1",
    kind: "report",
    day: mobile.day,
  };
  const restored = applyPatientCommand(
    initial,
    { type: "server:reports", reports: decoded.reports },
    now,
  );
  const saved = applyPatientCommand(
    restored,
    {
      type: "event",
      draftId: "draft-1",
      event: {
        id: mobile.id,
        entityId: mobile.entityId,
        kind: "report",
        day: mobile.day,
        fields: mobile.fields,
        note: mobile.note,
        label: mobile.label,
        required: true,
      },
    },
    now,
  );
  assert.equal(saved.drafts["draft-1"], undefined);
  const removed = applyPatientCommand(
    saved,
    {
      type: "event",
      event: {
        id: "delete-1",
        entityId: mobile.entityId,
        kind: "report",
        day: mobile.day,
        fields: {},
        note: "",
        required: true,
        deleted: true,
      },
    },
    now,
  );
  const repeated = applyPatientCommand(
    removed,
    { type: "server:reports", reports: decoded.reports },
    now,
  );
  assert.equal(latestReports(repeated).length, 0);
});
