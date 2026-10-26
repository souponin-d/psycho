import { expect, it } from "vitest";
import { createPatient } from "./commands";
import { demoActor } from "./seed";
import {
  evaluateSupport,
  supportCatalog,
  supportContextKey,
} from "./clinical-support-engine";
import {
  applySupportMutation,
  isSupportEvaluationCurrent,
} from "./clinical-support";
import type { SupportInput, AdverseEventInput } from "./clinical-support-types";
import type { PlanItem } from "./model";
import { assertMedicationCandidate } from "./clinical-support-engine";
it("проверяет аллергию именно выбранного МНН, не запрещая весь класс", () => {
  const p = patient();
  p.clinicalFacts = [
    {
      id: "allergy",
      versions: [
        {
          version: 1,
          content: {
            category: "allergy",
            state: "known",
            substance: "Сертралин",
            reaction: "Крапивница",
          },
          origin: {
            kind: "patient",
            reference: "",
            quote: "",
            observedAt: now,
          },
          status: "confirmed",
          changedAt: now,
          changedBy: demoActor,
          verifiedAt: now,
          verifiedBy: demoActor,
          reason: "",
        },
      ],
    },
  ];
  const candidate = {
    id: "candidate",
    kind: "medication",
    medicine: { inn: "Сертралин", tradeName: "Бренд" },
  } as PlanItem;
  expect(() => assertMedicationCandidate(p, candidate)).toThrow(/аллерг/i);
  expect(() =>
    assertMedicationCandidate(p, {
      ...candidate,
      medicine: { ...candidate.medicine!, inn: "Эсциталопрам" },
    }),
  ).not.toThrow();
});
it("новый отрицательный ответ не закрывает ранее нерассмотренную опасность", () => {
  const p = patient();
  p.workflow = {
    assessments: [
      { source: { scale: "GAD-7" }, measuredAt: now, immediateDanger: "no" },
    ],
    safety: [{ kind: "immediate-danger", status: "created" }],
  } as unknown as NonNullable<typeof p.workflow>;
  expect(
    evaluateSupport(p, input(), demoActor, now).findings.some(
      (f) => f.id === "immediate-danger" && f.priority === "urgent",
    ),
  ).toBe(true);
});
it("смена дня требует новой оценки временного среза лекарств", () => {
  const p = evaluated(),
    e = p.clinicalSupport!.evaluations[0]!;
  expect(
    isSupportEvaluationCurrent(p, e, demoActor, "2026-10-27T10:00:00.000Z"),
  ).toBe(false);
});
it("содержательное уточнение НЯ не наследует прежнее клиническое действие", () => {
  const p = patient();
  applySupportMutation(
    p,
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 0,
      input: ae(),
      reason: "",
    },
    demoActor,
    now,
  );
  p.events[0]!.status = "acted";
  p.events[0]!.assessment = "Осмотрено";
  p.events[0]!.action = "Первое действие";
  applySupportMutation(
    p,
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 1,
      input: { ...ae(), symptoms: "Повторная рвота" },
      reason: "Новые симптомы",
    },
    demoActor,
    now,
  );
  expect(p.events[0]!.status).toBe("created");
  expect(p.events[0]!.assessment).toBe("");
  expect(
    p.events[0]!.history.some((h) => h.note.includes("Первое действие")),
  ).toBe(true);
});
const now = "2026-10-26T10:00:00.000Z";
const patient = () =>
  createPatient(
    { name: "Клиническая поддержка", birthDate: "1990-01-01" },
    demoActor,
    now,
    "support-test",
  );
const input = (): SupportInput => ({
  route: "gad",
  observations: [],
  functioning: "unknown",
  depressionSeverity: "unknown",
  response: "unknown",
  preference: "undecided",
  note: "",
});
function evaluated() {
  const p = patient();
  applySupportMutation(
    p,
    { type: "support.evaluate", id: "e1", input: input() },
    demoActor,
    now,
  );
  return p;
}
const ae = (): AdverseEventInput => ({
  symptoms: "Тошнота",
  onsetAt: now,
  suspectPlanIds: [],
  severity: "severe",
  seriousness: "unknown",
  criteria: [],
  outcome: "ongoing",
  dechallenge: "not-done",
  rechallenge: "not-done",
  causality: "unassessed",
  provenance: "patient",
  assessment: "",
});
it("клинический маршрут создаёт проект, а изменённое основание блокирует выдачу", () => {
  const p = patient(),
    v = input();
  v.observations = [
    {
      key: "suicidalIntent",
      answer: "yes",
      provenance: "patient",
      observedAt: now,
      note: "",
    },
  ];
  applySupportMutation(
    p,
    { type: "support.evaluate", id: "e1", input: v },
    demoActor,
    now,
  );
  applySupportMutation(
    p,
    {
      type: "support.route",
      id: "r1",
      evaluationId: "e1",
      findingId: "immediate-danger",
      decision: "accept",
      reason: "",
    } as never,
    demoActor,
    now,
  );
  expect(p.referrals).toHaveLength(1);
  expect(p.referrals[0]).toMatchObject({
    status: "draft",
    category: "required",
    urgency: "urgent",
  });
  expect(p.events[0]!.status).toBe("created");
});
it("не превращает отсутствие сведений в безопасную рекомендацию и не ставит диагноз", () => {
  const p = patient(),
    before = structuredClone(p);
  const result = evaluateSupport(p, input(), demoActor, now);
  expect(p).toEqual(before);
  expect(result.diagnosisConfirmed).toBe(false);
  expect(result.findings.some((f) => f.id === "allergy-unknown")).toBe(true);
  expect(
    result.options
      .filter((o) => o.kind === "medication")
      .every((o) => o.status !== "discuss"),
  ).toBe(true);
  expect(result.options.some((o) => o.kind === "psychotherapy")).toBe(true);
});
it("намерение независимо от шкалы требует срочной оценки и откладывает стандартную терапию", () => {
  const v = input();
  v.observations = [
    {
      key: "suicidalIntent",
      answer: "yes",
      provenance: "patient",
      observedAt: now,
      note: "Прямое сообщение",
    },
  ];
  const r = evaluateSupport(patient(), v, demoActor, now);
  expect(
    r.findings.some(
      (f) => f.priority === "urgent" && f.category === "required",
    ),
  ).toBe(true);
  expect(r.options.every((o) => o.status === "defer")).toBe(true);
});
it("анамнез мании препятствует предложению стандартной антидепрессивной схемы", () => {
  const v = input();
  v.route = "depression";
  v.observations = [
    {
      key: "maniaHistory",
      answer: "yes",
      provenance: "clinician",
      observedAt: now,
      note: "Из анамнеза",
    },
  ];
  const r = evaluateSupport(patient(), v, demoActor, now);
  expect(
    r.options
      .filter((o) => o.kind === "medication")
      .every((o) => o.status === "defer"),
  ).toBe(true);
  expect(r.findings.some((f) => f.id === "bipolar-assessment")).toBe(true);
});
it("изменения источника и клинического контекста блокируют старое решение без потери истории", () => {
  const p = evaluated(),
    e = p.clinicalSupport!.evaluations[0]!;
  expect(isSupportEvaluationCurrent(p, e, demoActor)).toBe(true);
  p.profile.birthDate = "1991-01-01";
  expect(isSupportEvaluationCurrent(p, e, demoActor)).toBe(false);
  expect(() =>
    applySupportMutation(
      p,
      {
        type: "support.decide",
        id: "d1",
        evaluationId: e.id,
        optionId: e.result.options[0]!.id,
        decision: "accept",
        reason: "",
      },
      demoActor,
      now,
    ),
  ).toThrow();
  expect(p.clinicalSupport!.evaluations[0]).toEqual(e);
  const old = supportCatalog.version;
  try {
    supportCatalog.version = "changed";
    expect(supportContextKey(patient(), demoActor)).not.toBe(e.contextKey);
  } finally {
    supportCatalog.version = old;
  }
});
it("принятие немедикаментозного варианта создаёт только проект и сохраняет основания", () => {
  const p = evaluated(),
    e = p.clinicalSupport!.evaluations[0]!,
    o = e.result.options.find((o) => o.kind === "psychotherapy")!;
  applySupportMutation(
    p,
    {
      type: "support.decide",
      id: "d1",
      evaluationId: e.id,
      optionId: o.id,
      decision: "accept",
      reason: "Совместно обсудили вариант",
    },
    demoActor,
    now,
  );
  expect(p.plan).toHaveLength(1);
  expect(p.plan[0]!.status).toBe("draft");
  expect(
    p.clinicalSupport!.decisions[0]!.option.sourceIds.length,
  ).toBeGreaterThan(0);
  expect(() =>
    applySupportMutation(
      p,
      {
        type: "support.decide",
        id: "d2",
        evaluationId: e.id,
        optionId: o.id,
        decision: "accept",
        reason: "",
      },
      demoActor,
      now,
    ),
  ).toThrow();
});
it("тяжесть не подменяет серьёзность, а исправление сохраняет исходное НЯ", () => {
  const p = patient();
  applySupportMutation(
    p,
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 0,
      input: ae(),
      reason: "",
    },
    demoActor,
    now,
  );
  expect(p.events[0]!.urgency).toBe("important");
  expect(
    p.clinicalSupport!.adverseEvents[0]!.versions[0]!.input.seriousness,
  ).toBe("unknown");
  applySupportMutation(
    p,
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 1,
      input: {
        ...ae(),
        severity: "mild",
        seriousness: "serious",
        criteria: ["hospitalization"],
        assessment: "Госпитализация по сообщению",
      },
      reason: "Уточнение исхода",
    },
    demoActor,
    now,
  );
  expect(p.events[0]!.urgency).toBe("urgent");
  expect(p.clinicalSupport!.adverseEvents[0]!.versions).toHaveLength(2);
  expect(p.clinicalSupport!.adverseEvents[0]!.versions[0]!.input.severity).toBe(
    "severe",
  );
});
it("отклоняет поддельные результаты, неизвестные признаки, будущие даты и неосмысленную причинность", () => {
  for (const mutation of [
    { type: "support.evaluate", id: "e1", input: input(), result: {} },
    {
      type: "support.evaluate",
      id: "e1",
      input: {
        ...input(),
        observations: [
          {
            key: "invented",
            answer: "no",
            provenance: "patient",
            observedAt: now,
            note: "",
          },
        ],
      },
    },
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 0,
      input: { ...ae(), causality: "certain" },
      reason: "",
    },
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 0,
      input: { ...ae(), onsetAt: "2027-01-01T00:00:00Z" },
      reason: "",
    },
    {
      type: "support.adverse",
      id: "ae1",
      expectedVersion: 0,
      input: { ...ae(), seriousness: "serious", criteria: [] },
      reason: "",
    },
  ])
    expect(() =>
      applySupportMutation(patient(), mutation as never, demoActor, now),
    ).toThrow();
});
it("сопоставляет взаимодействия по МНН, не угадывает неизвестный препарат", () => {
  const p = patient();
  const med = (id: string, inn: string) =>
    ({
      id,
      kind: "medication",
      status: "confirmed",
      title: inn,
      startDate: "2026-10-01",
      endDate: "",
      medicine: { inn, tradeName: inn, recordId: id, registrationNumber: id },
    }) as PlanItem;
  p.plan = [
    med("s", "Сертралин"),
    med("t", "Трамадол"),
    med("x", "Неизвестное вещество"),
  ];
  const r = evaluateSupport(p, input(), demoActor, now);
  expect(
    r.findings.some(
      (f) => f.kind === "interaction" && f.relatedIds.length === 2,
    ),
  ).toBe(true);
  expect(r.unknownMedicines).toContain("Неизвестное вещество");
});
