import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createPatient,
  createVisit,
  DomainError,
} from "./commands";
import type {
  Actor,
  Mutation,
  PatientRecord,
  Measurement,
  PlanItem,
  Referral,
} from "./model";
import sourceData from "./source-data.json";
import { ICD10_CATALOG } from "./terminology";

const actor: Actor = {
  id: "doctor-1",
  name: "Анна Лебедева",
  clinicId: "clinic-1",
  specialty: "psychiatrist",
};
const now = "2026-10-22T09:00:00.000Z";
it("keeps unapproved questionnaire responses separate and rejects approval or source tampering", () => {
  const source = sourceData.find((s) => s.id === "S23")!;
  const value = {
    id: "assessment-1",
    createdAt: "",
    author: "forged",
    sourceId: source.id,
    sourceHash: source.sha256,
    formVersion: `source-${source.sha256.slice(0, 12)}-draft-1`,
    measuredAt: now,
    assessor: "patient" as const,
    responses: { "1": 0, "2": null },
    note: "Учебная проверка версии",
    status: "unapproved" as const,
  };
  const p = run(patient(), { type: "assessment.save", value });
  expect(p.assessmentDrafts?.[0]?.responses).toEqual({ "1": 0, "2": null });
  expect(p.assessmentDrafts?.[0]?.author).toBe(actor.name);
  expect(p.measurements).toHaveLength(0);
  expect(p.events).toHaveLength(0);
  expect(p.plan).toHaveLength(0);
  expect(() =>
    run(p, {
      type: "assessment.save",
      value: { ...value, sourceHash: "wrong" },
    }),
  ).toThrow(/Версия/);
  expect(() =>
    run(p, {
      type: "assessment.save",
      value: { ...value, status: "approved" },
    } as unknown as Mutation),
  ).toThrow();
  expect(() =>
    run(p, {
      type: "assessment.save",
      value: { ...value, responses: { "1": Infinity } },
    }),
  ).toThrow();
});
it("audits printing without rewriting a completed visit, including an archived card", () => {
  let p = run(ready(), { type: "visit.complete", id: "visit-1" });
  const visit = structuredClone(p.visits[0]);
  p = run(p, {
    type: "patient.archive",
    archived: true,
    reason: "Завершено наблюдение",
  });
  p = run(p, {
    type: "visit.print",
    id: "visit-1",
    reason: "Рабочая копия врача",
  });
  expect(p.visits[0]).toEqual(visit);
  expect(p.audit.at(-1)?.action).toBe("visit.print");
});
function patient() {
  return createPatient(
    { name: "Тестовый пациент", birthDate: "1990-02-12" },
    actor,
    now,
    "patient-1",
  );
}

it("создаёт контекст пациента и приём без обязательного эпизода", () => {
  const p = patient();
  const visit = createVisit("visit-context", now, actor);
  expect(p.profile.clinicalContext).toMatchObject({
    complaints: "",
    illnessHistory: "",
    somaticConditions: [],
  });
  expect(visit).not.toHaveProperty("episodeId");
  expect(visit.diagnoses).toEqual([]);
});

it("отклоняет диагноз, которого нет в текущем учебном каталоге", () => {
  const visit = createVisit("visit-diagnosis", now, actor);
  const known = ICD10_CATALOG.find((entry) => entry.code === "F32.1")!;
  expect(
    run(patient(), {
      type: "visit.save",
      value: { ...visit, diagnoses: [{ ...known, status: "hypothesis" }] },
    }),
  ).toBeTruthy();
  expect(() =>
    run(patient(), {
      type: "visit.save",
      value: {
        ...visit,
        diagnoses: [
          { ...known, title: "Подменённое название", status: "hypothesis" },
        ],
      },
    }),
  ).toThrow(/МКБ-10/);
});
function run(p: PatientRecord, mutation: Mutation, id = crypto.randomUUID()) {
  return applyCommand(
    p,
    { commandId: id, expectedRevision: p.revision, mutation },
    actor,
    now,
  );
}
function scheduled(p: PatientRecord) {
  const v = createVisit("visit-1", now, actor);
  return run(p, { type: "visit.save", value: v });
}
function ready() {
  let p = scheduled(patient());
  const visit = structuredClone(p.visits[0]!);
  for (const key of [
    "safetyConclusion",
    "conclusion",
    "recommendations",
  ] as const)
    visit.notes[key] = "Решение врача";
  p = run(p, { type: "visit.save", value: visit });
  return run(p, {
    type: "consent.add",
    value: {
      id: "care",
      createdAt: now,
      author: "",
      purpose: "care",
      status: "documented",
      signedOn: "2026-10-22",
      documentReference: "Документ",
      person: "Пациент",
      scope: "Приём",
      informing: "Обсуждены варианты",
    },
  });
}
function plan(): PlanItem {
  return {
    id: "plan",
    createdAt: now,
    author: "",
    visitId: "visit-1",
    kind: "follow-up",
    title: "Контроль",
    details: "",
    dose: "",
    schedule: "",
    startDate: "",
    endDate: "",
    dueDate: "",
    status: "draft",
    confirmedAt: "",
    confirmedBy: "",
    changeReason: "",
    replacesId: "",
    instructionUrl: "",
    patientInstructions: "Контроль",
    sourceIds: [],
    rationale: "Решение врача",
  };
}
function referral(): Referral {
  return {
    id: "referral",
    createdAt: now,
    author: "",
    visitId: "visit-1",
    destination: "Специалист",
    urgency: "routine",
    category: "desirable",
    reason: "Оценка",
    dueDate: "",
    status: "issued",
    outcome: "",
    sourceIds: [],
    rationale: "Решение врача",
  };
}
function measurement(): Measurement {
  return {
    id: "measurement",
    author: "",
    createdAt: now,
    visitId: "visit-1",
    scale: "custom",
    title: "Внешняя оценка",
    version: "1",
    measuredAt: now,
    score: null,
    maximum: null,
    answers: [],
    completeness: "not-assessed",
    assessor: "clinician",
    window: "",
    sourceId: "",
    interpretation: "",
    provenance: "clinician",
    externalForm: "Бумажный документ",
  };
}
function communicationConsent(
  p: PatientRecord,
  status: "documented" | "refused" | "withdrawn",
) {
  return run(p, {
    type: "consent.add",
    value: {
      id: crypto.randomUUID(),
      createdAt: now,
      author: "",
      purpose: "communication",
      status,
      signedOn: "2026-10-22",
      documentReference: "Документ о связи",
      person: "Пациент",
      scope: "Сообщения",
      informing: "Обсуждены условия дистанционной связи",
    },
  });
}

describe("сохранность подтверждённых решений", () => {
  it("требует действующее согласие на связь перед исходящим сообщением врача", () => {
    const send: Mutation = {
      type: "message.send",
      text: "Контрольный контакт",
    };
    const error =
      "Сначала зафиксируйте действующее согласие на дистанционную связь";
    expect(() => run(patient(), send)).toThrow(error);
    let p = communicationConsent(patient(), "documented");
    p = run(p, send);
    expect(p.messages).toHaveLength(1);
    p = communicationConsent(p, "withdrawn");
    expect(() => run(p, send)).toThrow(error);
    p = communicationConsent(p, "refused");
    expect(() => run(p, send)).toThrow(error);
    expect(p.messages).toHaveLength(1);
    p = communicationConsent(p, "documented");
    expect(run(p, send).messages).toHaveLength(2);
  });
  it("учитывает последний отзыв согласия на дистанционную связь", () => {
    let p = ready();
    p = run(p, {
      type: "visit.save",
      value: { ...p.visits[0]!, format: "remote" },
    });
    for (const status of ["documented", "withdrawn"] as const)
      p = run(p, {
        type: "consent.add",
        value: {
          ...p.consents[0]!,
          id: status,
          purpose: "communication",
          status,
        },
      });
    expect(() => run(p, { type: "visit.complete", id: "visit-1" })).toThrow(
      /согласие|связь/i,
    );
  });
  it("сохраняет снимок подтверждённого итога при последующих изменениях карты", () => {
    let p = run(ready(), { type: "plan.save", value: plan() });
    p = run(p, { type: "plan.confirm", id: "plan" });
    p = run(p, { type: "measurement.add", value: measurement() });
    p = run(p, { type: "visit.complete", id: "visit-1" });
    p = run(p, {
      type: "plan.status",
      id: "plan",
      status: "stopped",
      reason: "Новые сведения",
    });
    p = run(p, {
      type: "profile.update",
      value: { ...p.profile, name: "Другое имя" },
    });
    expect(p.visits[0]!.completionSnapshot?.patientName).toBe(
      "Тестовый пациент",
    );
    expect(p.visits[0]!.completionSnapshot?.plan[0]?.status).toBe("confirmed");
    expect(p.visits[0]!.completionSnapshot?.measurements[0]?.id).toBe(
      "measurement",
    );
  });
  it("не добавляет план или направление в завершённый приём", () => {
    const p = run(ready(), { type: "visit.complete", id: "visit-1" });
    expect(() => run(p, { type: "plan.save", value: plan() })).toThrow(
      /завершён/i,
    );
    expect(() => run(p, { type: "referral.save", value: referral() })).toThrow(
      /завершён/i,
    );
  });
  it("не добавляет измерения в завершённый приём", () => {
    const p = run(ready(), { type: "visit.complete", id: "visit-1" });
    expect(() =>
      run(p, { type: "measurement.add", value: measurement() }),
    ).toThrow(/завершён/i);
  });
  it("не подтверждает старый черновик назначения в завершённом приёме", () => {
    let p = run(ready(), { type: "plan.save", value: plan() });
    p = run(p, { type: "visit.complete", id: "visit-1" });
    expect(() => run(p, { type: "plan.confirm", id: "plan" })).toThrow(
      /завершён/i,
    );
  });
  it("не возвращает выданное направление в черновик и сохраняет его основание после исполнения", () => {
    let p = run(ready(), { type: "referral.save", value: referral() });
    expect(() =>
      run(p, {
        type: "referral.save",
        value: { ...p.referrals[0]!, status: "draft" },
      }),
    ).toThrow(/выдан|подтверждён/i);
    p = run(p, {
      type: "referral.save",
      value: {
        ...p.referrals[0]!,
        status: "attended",
        outcome: "Обращение состоялось",
      },
    });
    expect(() =>
      run(p, {
        type: "referral.save",
        value: { ...p.referrals[0]!, reason: "Переписано" },
      }),
    ).toThrow(/основан|подтверждён/i);
  });
  it("отклоняет невозможную календарную дату и неизвестные статусы", () => {
    expect(() =>
      createPatient(
        { name: "Пациент", birthDate: "2026-02-30" },
        actor,
        now,
        "bad-date",
      ),
    ).toThrow(/дат/i);
    expect(() =>
      run(ready(), {
        type: "referral.save",
        value: { ...referral(), status: "invented" },
      } as unknown as Mutation),
    ).toThrow(/статус|значени/i);
  });
  it("не архивирует карту с назначенным приёмом и сохраняет историю после отмены", () => {
    let p = scheduled(patient());
    expect(() =>
      run(p, { type: "patient.archive", archived: true, reason: "Архив" }),
    ).toThrow(/приём/i);
    p = run(p, { type: "visit.cancel", id: "visit-1", reason: "Отмена" });
    p = run(p, { type: "patient.archive", archived: true, reason: "Архив" });
    expect(p.archived).toBe(true);
    expect(p.visits).toHaveLength(1);
  });
  it("сохраняет открытый сигнал в очереди до оценки и результата", () => {
    let p = run(patient(), {
      type: "report.add",
      value: {
        id: "report",
        createdAt: now,
        author: "",
        reportedAt: now,
        receivedAt: "",
        provenance: "clinician",
        state: "completed",
        mood: null,
        anxiety: null,
        sleepHours: null,
        functioning: "",
        medication: "no-mark",
        medicationReason: "",
        adverseEffects: "",
        note: "Сообщение пациента",
        safetyConcern: true,
        reviewedAt: "",
      },
    });
    expect(() =>
      run(p, { type: "patient.archive", archived: true, reason: "Архив" }),
    ).toThrow(/событи/i);
    for (const status of [
      "acknowledged",
      "assessed",
      "acted",
      "closed",
    ] as const)
      p = run(p, {
        type: "event.transition",
        id: p.events[0]!.id,
        status,
        note: "Действие и результат врача",
      });
    p = run(p, { type: "patient.archive", archived: true, reason: "Архив" });
    expect(p.events[0]!.history).toHaveLength(5);
    expect(p.reports).toHaveLength(1);
  });
  it("отклоняет null, пропущенные числовые поля и неизвестные поля записи", () => {
    const p = scheduled(patient());
    expect(() =>
      run(p, { type: "visit.save", value: null } as unknown as Mutation),
    ).toThrow(DomainError);
    expect(() =>
      run(p, {
        type: "visit.save",
        value: { ...p.visits[0], durationMinutes: undefined },
      } as unknown as Mutation),
    ).toThrow(DomainError);
    expect(() =>
      run(p, {
        type: "visit.save",
        value: { ...p.visits[0], unknown: "data" },
      } as unknown as Mutation),
    ).toThrow(DomainError);
  });
});

describe("рабочий путь врача", () => {
  it("создаёт пустую карту без выдуманного отрицательного анамнеза", () => {
    const p = patient();
    expect(p.profile.allergies).toBe("");
    expect(p.profile.sex).toBe("unspecified");
    expect(p.clinicId).toBe(actor.clinicId);
    expect(p.visits).toEqual([]);
  });
  it("сохраняет черновик, требует заключение и оценку безопасности до завершения", () => {
    let p = scheduled(patient());
    expect(() => run(p, { type: "visit.complete", id: "visit-1" })).toThrow(
      /заключение|безопасност|соглас/i,
    );
    const v = structuredClone(p.visits[0]!);
    v.status = "in-progress";
    v.notes.mentalStatus = "Тревога";
    v.notes.safetyConclusion = "Оценка проведена врачом";
    v.notes.conclusion = "Обсуждён индивидуальный план";
    v.notes.recommendations = "Контроль на приёме";
    p = run(p, { type: "visit.save", value: v });
    p = run(p, {
      type: "consent.add",
      value: {
        id: "consent",
        createdAt: now,
        author: "",
        purpose: "care",
        status: "documented",
        signedOn: "2026-10-22",
        documentReference: "Бумажный документ № 1",
        person: "Пациент",
        scope: "Первичный приём",
        informing: "Обсуждены цели, методы, риски и альтернативы",
      },
    });
    p = run(p, { type: "visit.complete", id: v.id });
    expect(p.visits[0]!.status).toBe("completed");
    expect(p.visits[0]!.confirmedBy).toBe(actor.name);
    expect(() =>
      run(p, {
        type: "visit.save",
        value: { ...v, notes: { ...v.notes, conclusion: "Переписано" } },
      }),
    ).toThrow(/завершён/i);
    p = run(p, {
      type: "visit.addendum",
      id: v.id,
      text: "Уточнение со слов пациента",
      reason: "Новые сведения",
    });
    expect(p.visits[0]!.addenda).toHaveLength(1);
    expect(p.visits[0]!.notes.conclusion).toBe(v.notes.conclusion);
  });
  it("отклоняет чужую клинику, чужого врача и устаревшую версию", () => {
    const p = patient();
    const c = {
      commandId: "c1",
      expectedRevision: 0,
      mutation: { type: "profile.update", value: p.profile } as Mutation,
    };
    expect(() =>
      applyCommand(p, c, { ...actor, clinicId: "other" }, now),
    ).toThrow(DomainError);
    expect(() => applyCommand(p, c, { ...actor, id: "other" }, now)).toThrow(
      DomainError,
    );
    expect(() =>
      applyCommand(p, { ...c, expectedRevision: 99 }, actor, now),
    ).toThrow(/верси/i);
  });
  it("повтор команды не дублирует данные и аудит", () => {
    const p = communicationConsent(patient(), "documented");
    const c = {
      commandId: "same",
      expectedRevision: p.revision,
      mutation: { type: "message.send", text: "Запись врача" } as Mutation,
    };
    const next = applyCommand(p, c, actor, now);
    expect(applyCommand(next, c, actor, now)).toEqual(next);
    expect(next.messages[0]!.status).toBe("recorded");
  });
  it("не закрывает событие без оценки и выполненного действия", () => {
    let p = run(patient(), {
      type: "event.add",
      value: {
        id: "e1",
        createdAt: now,
        author: "",
        title: "Связаться",
        detail: "Сообщение пациента",
        urgency: "important",
        status: "created",
        relatedId: "",
        dueAt: "",
        assignee: actor.name,
        assessment: "",
        action: "",
        outcome: "",
        history: [],
        sourceIds: [],
        rationale: "Со слов пациента",
      },
    });
    expect(() =>
      run(p, {
        type: "event.transition",
        id: "e1",
        status: "closed",
        note: "Открыто",
      }),
    ).toThrow(/поряд|этап/i);
    for (const status of [
      "acknowledged",
      "assessed",
      "acted",
      "closed",
    ] as const)
      p = run(p, {
        type: "event.transition",
        id: "e1",
        status,
        note: "Зафиксировано действие врача",
      });
    expect(p.events[0]!.history).toHaveLength(5);
    expect(p.events[0]!.outcome).not.toBe("");
  });
  it("не превращает неполную шкалу в полный результат", () => {
    expect(() =>
      run(patient(), {
        type: "measurement.add",
        value: {
          id: "m1",
          createdAt: now,
          author: "",
          visitId: "",
          scale: "GAD-7",
          title: "GAD-7",
          version: "внешняя форма 2023",
          measuredAt: now,
          score: 7,
          maximum: 21,
          answers: [1, null],
          completeness: "complete",
          assessor: "patient",
          window: "2 недели",
          sourceId: "S23",
          interpretation: "",
          provenance: "patient",
          externalForm: "Бумажная форма",
        },
      }),
    ).toThrow(/пропуск|неполн/i);
  });
  it("не подтверждает назначение без основания и не меняет подтверждённое задним числом", () => {
    let p = patient();
    const item = {
      id: "p1",
      createdAt: now,
      author: "",
      visitId: "",
      kind: "follow-up" as const,
      title: "Контрольный приём",
      details: "Оценить динамику",
      dose: "",
      schedule: "",
      startDate: "2026-10-22",
      endDate: "",
      dueDate: "2026-10-29",
      status: "draft" as const,
      confirmedAt: "",
      confirmedBy: "",
      changeReason: "",
      replacesId: "",
      instructionUrl: "",
      patientInstructions: "Принести записи",
      sourceIds: ["S03"],
      rationale: "",
    };
    p = run(p, { type: "plan.save", value: item });
    expect(() => run(p, { type: "plan.confirm", id: item.id })).toThrow(
      /основан/i,
    );
    p = run(p, {
      type: "plan.save",
      value: { ...item, rationale: "Индивидуальное решение врача" },
    });
    p = run(p, { type: "plan.confirm", id: item.id });
    expect(p.plan[0]!.confirmedAt).toBe(now);
    expect(() => run(p, { type: "plan.save", value: item })).toThrow(
      /подтверждён/i,
    );
  });
  it("запрещает использовать извлечённые факты исключённого документа", () => {
    let p = run(patient(), {
      type: "document.add",
      value: {
        id: "d1",
        createdAt: now,
        author: "",
        title: "Исключённый материал",
        documentDate: "2026-10-22",
        issuer: "Источник",
        text: "Материал",
        status: "excluded",
        exclusionReason: "Акт о необоснованности",
        facts: [],
      },
    });
    expect(() =>
      run(p, {
        type: "document.facts",
        id: "d1",
        facts: [
          {
            id: "f",
            field: "history",
            quote: "Материал",
            value: "Факт",
            confirmed: true,
          },
        ],
      }),
    ).toThrow(/исключён/i);
  });
});
