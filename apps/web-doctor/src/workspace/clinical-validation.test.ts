import { expect, it } from "vitest";
import { applyCommand, createPatient } from "./commands";
import { demoActor } from "./seed";
import { clinicalProtocols } from "./clinical-protocols";
import { workflowComparison } from "./clinical-workflow";
import { ICD10_CATALOG } from "./terminology";
import type { Mutation, PatientRecord } from "./model";
const now = "2026-10-26T10:00:00.000Z",
  gad = clinicalProtocols[0]!,
  phq = clinicalProtocols[1]!;
const patient = () =>
  createPatient(
    { name: "Пациент клинического случая", birthDate: "1990-01-01" },
    demoActor,
    now,
    "validation",
  );
it("при совпавшем времени последним считается последний полученный результат", () => {
  let p = run(patient(), submit(gad.version, Array(7).fill(0)));
  p = run(p, submit(gad.version, Array(7).fill(2)));
  const r = p.workflow!.recommendations.find(
    (r) => !r.stale && r.type === "observation",
  )!;
  expect(r.assessmentId).toBe(p.workflow!.assessments.at(-1)!.id);
});
function run(p: PatientRecord, m: Mutation, actor = demoActor) {
  return applyCommand(
    p,
    {
      commandId: crypto.randomUUID(),
      expectedRevision: p.revision,
      mutation: m,
    },
    actor,
    now,
  );
}
it("психиатр оценивает синдром сам, а другой врач получает проект направления", () => {
  const condition = ICD10_CATALOG.find((d) => d.code === "F32.1")!;
  for (const specialty of ["psychiatrist", "physician"] as const) {
    const actor = { ...demoActor, specialty };
    let p = patient();
    p = run(
      p,
      {
        type: "fact.save",
        value: {
          id: "depression",
          expectedVersion: 0,
          content: {
            category: "diagnosis",
            state: "known",
            condition,
            diagnosticStatus: "hypothesis",
          },
          origin: {
            kind: "clinician",
            reference: "Приём",
            quote: "Депрессивный синдром требует уточнения",
            observedAt: "",
          },
          reason: "",
        },
      },
      actor,
    );
    p = run(p, submit(phq.version, Array(9).fill(0)), actor);
    const r = p.workflow!.recommendations.find(
      (r) => r.ruleId === "depression-assessment-v1",
    )!;
    expect(r.action).toBe(
      specialty === "psychiatrist" ? "discuss" : "consultation",
    );
    expect(r.referralCategory).toBe(
      specialty === "psychiatrist" ? undefined : "required",
    );
  }
});
it("устаревшая версия правила блокирует действие и пересверяется без нового контакта", () => {
  let p = run(patient(), submit(gad.version, Array(7).fill(0)));
  let r = p.workflow!.recommendations.find((r) => r.type === "observation")!;
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "accept",
    reason: "",
    action: r.action,
    dueDate: "",
  });
  r = p.workflow!.recommendations.find((v) => v.id === r.id)!;
  r.ruleVersion = "obsolete";
  expect(() =>
    run(p, {
      type: "workflow.execute",
      id: r.id,
      expectedVersion: r.version,
      confirmation: true,
    }),
  ).toThrow(/устар|источник|верси/i);
  const contacts = p.workflow!.contacts.length;
  p = run(p, { type: "workflow.refresh" } as Mutation);
  expect(p.workflow!.contacts).toHaveLength(contacts);
  expect(p.workflow!.recommendations.find((v) => v.id === r.id)!.stale).toBe(
    true,
  );
  expect(p.plan[0]!.status).toBe("draft");
  expect(
    p.workflow!.recommendations.some(
      (v) => !v.stale && v.type === "observation" && v.id !== r.id,
    ),
  ).toBe(true);
});
it("изменённый источник не переинтерпретирует прежний результат автоматически", () => {
  let p = run(patient(), submit(gad.version, Array(7).fill(0)));
  const original = structuredClone(p.workflow!.assessments[0]);
  const hash = gad.contentHash;
  try {
    gad.contentHash = "b".repeat(64);
    p = run(p, { type: "workflow.refresh" } as Mutation);
    expect(p.workflow!.assessments[0]).toEqual(original);
    expect(
      p
        .workflow!.recommendations.filter((r) => !r.stale)
        .every((r) => r.type === "clarification"),
    ).toBe(true);
    expect(p.workflow!.recommendations.find((r) => !r.stale)?.ruleId).toBe(
      "source-review-v1",
    );
  } finally {
    gad.contentHash = hash;
  }
});
function submit(
  version: string,
  answers: unknown[],
  extra: Record<string, unknown> = {},
): Mutation {
  return {
    type: "workflow.submit",
    value: {
      id: crypto.randomUUID(),
      protocolVersion: version,
      measuredAt: now,
      answers,
      state: "completed",
      safety: "no",
      note: "Изменения состояния",
      assignmentId: "",
      ...extra,
    },
  } as Mutation;
}
it.each(clinicalProtocols)(
  "$scale: точная версия, полные ответы и описательные категории",
  (form) => {
    let p = run(patient(), submit(form.version, Array(form.items).fill(0)));
    expect(p.workflow!.assessments[0]!.score).toBe(0);
    expect(p.workflow!.assessments[0]!.source).toMatchObject({
      contentHash: form.contentHash,
      status: "evidence-reviewed",
      clinicalApproval: null,
    });
    p = run(
      p,
      submit(
        form.version,
        Array(form.items).fill(3),
        form.scale === "PHQ-9" ? { impact: 3 } : {},
      ),
    );
    expect(p.workflow!.assessments.at(-1)!.score).toBe(form.maximum);
    expect(p.workflow!.assessments.at(-1)!.interpretation?.diagnostic).toBe(
      false,
    );
    expect(p.plan).toHaveLength(0);
    expect(p.clinicalFacts ?? []).toHaveLength(0);
  },
);
it("положительный пункт9 при низкой сумме — интервью, не автоматический кризис", () => {
  const p = run(
    patient(),
    submit(phq.version, [0, 0, 0, 0, 0, 0, 0, 0, 1], { impact: 0 }),
  );
  expect(p.workflow!.assessments[0]!.score).toBe(1);
  expect(p.workflow!.safety[0]).toMatchObject({
    kind: "phq-item9",
    priority: "important",
    evaluation: "not-assessed",
  });
  expect(
    p.workflow!.recommendations.some((r) => r.ruleId === "phq9-item9-v1"),
  ).toBe(true);
  expect(
    p.workflow!.recommendations.some((r) => r.ruleId === "immediate-danger-v1"),
  ).toBe(false);
});
it("пункт9 не подменяется no и сохраняет положительный ответ при других пропусках", () => {
  const unknown = run(
    patient(),
    submit(phq.version, [0, 0, 0, 0, 0, 0, 0, 0, null]),
  );
  expect(unknown.workflow!.assessments[0]!.score).toBeNull();
  expect(unknown.workflow!.safety[0]!.kind).toBe("not-assessed");
  const positive = run(
    patient(),
    submit(phq.version, [null, 0, 0, 0, 0, 0, 0, 0, 1], { impact: 1 }),
  );
  expect(positive.workflow!.assessments[0]!.score).toBeNull();
  expect(positive.workflow!.safety[0]!.kind).toBe("phq-item9");
});
it("функционирование обязательно при симптомах, но не входит в сумму", () => {
  const partial = run(
    patient(),
    submit(phq.version, Array(9).fill(1), { impact: null }),
  );
  expect(partial.workflow!.assessments[0]!.score).toBeNull();
  expect(partial.workflow!.assessments[0]!.completeness).toBe("partial");
  const complete = run(
    patient(),
    submit(phq.version, Array(9).fill(1), { impact: 3 }),
  );
  expect(complete.workflow!.assessments[0]!.score).toBe(9);
});
it("прямое сообщение о непосредственной опасности важнее нулевой суммы", () => {
  const p = run(
    patient(),
    submit(phq.version, Array(9).fill(0), { immediateDanger: "yes" }),
  );
  expect(p.workflow!.safety[0]).toMatchObject({
    kind: "immediate-danger",
    priority: "urgent",
  });
  const r = p.workflow!.recommendations.find(
    (r) => r.ruleId === "immediate-danger-v1",
  )!;
  expect(r.referralCategory).toBe("required");
  expect(p.referrals).toHaveLength(0);
  const decided = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "accept",
    reason: "",
    action: r.action,
    dueDate: "",
    destination: r.destination,
  });
  expect(decided.referrals[0]).toMatchObject({
    category: "required",
    status: "draft",
  });
});
it("разные методики не смешиваются и видны одновременно", () => {
  let p = run(
    patient(),
    submit(gad.version, Array(7).fill(1), {
      measuredAt: "2026-10-20T10:00:00.000Z",
    }),
  );
  p = run(p, submit(phq.version, Array(9).fill(1), { impact: 1 }));
  p = run(p, submit(gad.version, Array(7).fill(2)));
  expect(
    workflowComparison(p, p.workflow!.assessments.at(-1)!.id).previous
      ?.protocolVersion,
  ).toBe(gad.version);
  expect(
    p
      .workflow!.recommendations.filter(
        (r) => !r.stale && r.type === "observation",
      )
      .map((r) => r.source.scale)
      .sort(),
  ).toEqual(["GAD-7", "PHQ-9"]);
});
it("не принимает разреженность, неверные типы, подделку источника и несовершеннолетних", () => {
  for (const answers of [
    Array(9),
    [true, 0, 0, 0, 0, 0, 0, 0, 0],
    ["1", 0, 0, 0, 0, 0, 0, 0, 0],
    [4, 0, 0, 0, 0, 0, 0, 0, 0],
  ])
    expect(() =>
      run(patient(), submit(phq.version, answers, { impact: 0 })),
    ).toThrow();
  expect(() =>
    run(
      patient(),
      submit(phq.version, Array(9).fill(0), {
        score: 0,
        interpretation: { diagnostic: true },
      }),
    ),
  ).toThrow();
  const child = patient();
  child.profile.birthDate = "2015-01-01";
  expect(() => run(child, submit(gad.version, Array(7).fill(0)))).toThrow(
    /взросл|18/i,
  );
});
