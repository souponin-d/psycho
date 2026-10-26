import { expect, it } from "vitest";
import { createPatient, applyCommand } from "./commands";
import { demoActor } from "./seed";
import {
  applyWorkflowMutation,
  reconcileWorkflow,
  workflowComparison,
  changesSinceContact,
  type WorkflowMutation,
} from "./clinical-workflow";
const now = "2026-10-26T09:00:00.000Z";
it("позволяет пересмотреть или отклонить проект до исполнения и сохраняет прежний проект", () => {
  let p = run(patient(), submission());
  let r = p.workflow!.recommendations[0]!;
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "modify",
    reason: "Нужна консультация",
    action: "consultation",
    destination: "Первый адресат",
    dueDate: "",
  });
  r = p.workflow!.recommendations[0]!;
  const originalId = r.effectId;
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "modify",
    reason: "Уточнён адресат",
    action: "consultation",
    destination: "Второй адресат",
    dueDate: "",
  });
  r = p.workflow!.recommendations[0]!;
  expect(r.effectId).not.toBe(originalId);
  expect(p.referrals.find((f) => f.id === originalId)?.destination).toBe(
    "Первый адресат",
  );
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "reject",
    reason: "Консультация отменена врачом",
    action: r.action,
    dueDate: "",
  });
  expect(p.workflow!.recommendations[0]!.status).toBe("rejected");
  expect(p.referrals.every((f) => f.status === "draft")).toBe(true);
  expect(() =>
    applyCommand(
      p,
      {
        commandId: "bypass",
        expectedRevision: p.revision,
        mutation: {
          type: "referral.save",
          value: { ...p.referrals[0]!, status: "issued" },
        },
      },
      demoActor,
      now,
    ),
  ).toThrow(/связан/);
});
it("позволяет обработать событие от результата с максимальной длиной ID", () => {
  let p = run(patient(), {
    ...submission(),
    value: { ...submission().value, id: "x".repeat(100), safety: "yes" },
  });
  const event = p.workflow!.safety[0]!;
  expect(event.id).toHaveLength(105);
  p = run(p, {
    type: "workflow.safety",
    id: event.id,
    expectedVersion: 1,
    status: "delivered",
    note: "Получено",
  });
  expect(p.workflow!.safety[0]!.status).toBe("delivered");
});
it("сопоставляет моменты с разными часовыми поясами по времени, а не по строке", () => {
  let p = run(patient(), {
    ...submission("early"),
    value: {
      ...submission("early").value,
      measuredAt: "2026-10-25T10:00:00+03:00",
    },
  });
  p = run(p, {
    ...submission("previous"),
    value: {
      ...submission("previous").value,
      measuredAt: "2026-10-25T08:00:00Z",
    },
  });
  p = run(p, {
    ...submission("current"),
    value: {
      ...submission("current").value,
      measuredAt: "2026-10-25T09:00:00Z",
    },
  });
  expect(p.workflow!.assessments[0]!.measuredAt).toBe(
    "2026-10-25T07:00:00.000Z",
  );
  expect(workflowComparison(p, "current").previous?.id).toBe("previous");
  expect(workflowComparison(p, "current").baseline?.id).toBe("early");
});
const patient = () =>
  createPatient(
    { name: "Синтетический поток", birthDate: "1990-01-01" },
    demoActor,
    now,
    "flow-patient",
  );
const submission = (
  id = "a1",
  answers: (number | null)[] = [1, 1, 1, 1, 1, 1, 1],
) => ({
  type: "workflow.submit" as const,
  value: {
    id,
    protocolVersion: "synthetic-7-v1",
    measuredAt: "2026-10-25T09:00:00.000Z",
    answers,
    state: "completed" as const,
    safety: "no" as const,
    note: "Учебный самоотчёт",
    assignmentId: "",
  },
});
function run(p: ReturnType<typeof patient>, mutation: WorkflowMutation) {
  const next = structuredClone(p);
  applyWorkflowMutation(next, mutation, demoActor, now);
  return next;
}
it("принимает ответы, считает на серверной стороне и сохраняет источник, а не поддельный итог", () => {
  const p = run(patient(), submission());
  const result = p.workflow!.assessments[0]!;
  expect(result.score).toBe(7);
  expect(result.completeness).toBe("complete");
  expect(result.source.status).toBe("synthetic-only");
  expect(() =>
    run(patient(), {
      ...submission(),
      value: { ...submission().value, score: 0 },
    } as WorkflowMutation),
  ).toThrow();
  expect(() => run(p, submission())).toThrow(/уже|повтор/i);
});
it("пропуск и отказ дают пустой итог и незавершённую безопасность", () => {
  let p = run(patient(), {
    ...submission(),
    value: {
      ...submission().value,
      answers: [1, null, 0, 0, 0, 0, 0],
      safety: "unknown",
    },
  });
  expect(p.workflow!.assessments[0]!.score).toBeNull();
  expect(p.workflow!.safety[0]!.evaluation).toBe("not-assessed");
  p = run(patient(), {
    ...submission(),
    value: {
      ...submission().value,
      state: "declined",
      answers: Array(7).fill(null),
      safety: "unknown",
    },
  });
  expect(p.workflow!.assessments[0]!.completeness).toBe("declined");
  expect(() =>
    run(patient(), {
      ...submission(),
      value: { ...submission().value, state: "declined" },
    }),
  ).toThrow();
});
it("сравнивает только полные предыдущие результаты той же версии и периода", () => {
  let p = run(patient(), {
    ...submission("base"),
    value: {
      ...submission("base").value,
      measuredAt: "2026-10-20T09:00:00.000Z",
    },
  });
  p = run(p, {
    ...submission("partial", [null, 0, 0, 0, 0, 0, 0]),
    value: {
      ...submission("partial", [null, 0, 0, 0, 0, 0, 0]).value,
      measuredAt: "2026-10-22T09:00:00.000Z",
    },
  });
  p = run(p, submission("new", [2, 2, 2, 2, 2, 2, 2]));
  expect(workflowComparison(p, "new").previous?.id).toBe("base");
  expect(workflowComparison(p, "new").delta).toBe(7);
  expect(workflowComparison(p, "new").answerChanges).toHaveLength(7);
});
it("создаёт один проект из решения, требует причину исключения и отдельное подтверждение", () => {
  let p = run(patient(), submission());
  let r = p.workflow!.recommendations.find((r) => r.type !== "safety")!;
  expect(() =>
    run(p, {
      type: "workflow.decide",
      id: r.id,
      expectedVersion: r.version,
      decision: "reject",
      reason: "",
      action: r.action,
      dueDate: "",
    }),
  ).toThrow(/причин/i);
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "accept",
    reason: "",
    action: r.action,
    dueDate: "",
  });
  r = p.workflow!.recommendations.find((x) => x.id === r.id)!;
  expect(p.plan[0]!.status).toBe("draft");
  expect(r.effectId).toBe(p.plan[0]!.id);
  expect(() =>
    run(p, {
      type: "workflow.decide",
      id: r.id,
      expectedVersion: r.version,
      decision: "accept",
      reason: "",
      action: r.action,
      dueDate: "",
    }),
  ).toThrow();
  p = run(p, {
    type: "workflow.execute",
    id: r.id,
    expectedVersion: r.version,
    confirmation: true,
  });
  expect(p.plan[0]!.status).toBe("confirmed");
  expect(p.workflow!.recommendations.find((x) => x.id === r.id)!.status).toBe(
    "fulfilled",
  );
});
it("изменение факта помечает прежнее основание устаревшим и сохраняет решение", () => {
  let p = run(patient(), submission());
  const r = p.workflow!.recommendations[0]!;
  p = applyCommand(
    p,
    {
      commandId: "fact",
      expectedRevision: p.revision,
      mutation: {
        type: "fact.save",
        value: {
          id: "f1",
          expectedVersion: 0,
          content: { category: "allergy", state: "unknown" },
          origin: {
            kind: "patient",
            reference: "Учебная беседа",
            quote: "Нет сведений",
            observedAt: "",
          },
          reason: "",
        },
      },
    },
    demoActor,
    now,
  );
  reconcileWorkflow(p, demoActor, now);
  expect(p.workflow!.recommendations.find((x) => x.id === r.id)!.stale).toBe(
    true,
  );
  expect(() =>
    run(p, {
      type: "workflow.decide",
      id: r.id,
      expectedVersion: r.version,
      decision: "accept",
      reason: "",
      action: r.action,
      dueDate: "",
    }),
  ).toThrow(/устарел/i);
});
it("безопасность нельзя закрыть прочтением или перескочить этапы", () => {
  let p = run(patient(), {
    ...submission(),
    value: { ...submission().value, safety: "yes" },
  });
  const id = p.workflow!.safety[0]!.id;
  expect(() =>
    run(p, {
      type: "workflow.safety",
      id,
      expectedVersion: 1,
      status: "acted",
      note: "Прочитано",
    }),
  ).toThrow();
  for (const status of [
    "delivered",
    "acknowledged",
    "assessed",
    "acted",
  ] as const) {
    const e = p.workflow!.safety[0]!;
    p = run(p, {
      type: "workflow.safety",
      id,
      expectedVersion: e.version,
      status,
      note: "Синтетическое отдельное действие врача",
    });
  }
  expect(p.workflow!.safety[0]!.action).toBeTruthy();
  expect(p.workflow!.safety[0]!.history).toHaveLength(5);
});
it("отдельное подтверждение шкалы создаёт разрешённое задание, проект направления не выдаётся автоматически", () => {
  let p = run(patient(), submission());
  let r = p.workflow!.recommendations[0]!;
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "modify",
    reason: "Учебное решение врача",
    action: "scale",
    dueDate: "2026-11-02",
  });
  r = p.workflow!.recommendations[0]!;
  expect(p.workflow!.assignments).toHaveLength(0);
  p = run(p, {
    type: "workflow.execute",
    id: r.id,
    expectedVersion: r.version,
    confirmation: true,
  });
  expect(p.workflow!.assignments[0]!.status).toBe("issued");
  let other = run(patient(), submission());
  r = other.workflow!.recommendations[0]!;
  other = run(other, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "modify",
    reason: "Учебное уточнение",
    action: "consultation",
    dueDate: "",
    destination: "Учебная консультация",
  });
  expect(other.referrals[0]!.status).toBe("draft");
  expect(other.referrals[0]!.rationale).toContain("synthetic-only");
});
it("фиксирует контакт и не просит повторить неизменившиеся сведения", () => {
  let p = run(patient(), submission());
  p = run(p, { type: "workflow.contact", note: "Учебный контакт" });
  expect(changesSinceContact(p).results).toHaveLength(0);
  p = run(p, {
    ...submission("later"),
    value: { ...submission("later").value, measuredAt: now },
  });
  expect(changesSinceContact(p).results).toHaveLength(1);
});
it("сохраняет отменённые проекты и блокирует их исполнение обычными командами", () => {
  let p = run(patient(), submission());
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
  r = p.workflow!.recommendations.find((x) => x.id === r.id)!;
  const plan = structuredClone(p.plan.find((x) => x.id === r.effectId)!);
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "modify",
    reason: "Уточнён способ помощи",
    action: "consultation",
    destination: "Учебный специалист",
    projectReason: "Уточнённое врачом основание",
    dueDate: "",
  });
  r = p.workflow!.recommendations.find((x) => x.id === r.id)!;
  const referral = structuredClone(
    p.referrals.find((x) => x.id === r.effectId)!,
  );
  expect(referral.reason).toContain("Уточнённое врачом основание");
  expect(referral.rationale).toContain("synthetic-only");
  expect(r.supersededEffects?.[0]?.snapshot).toEqual(plan);
  expect(r.supersededEffects?.[0]?.by).toEqual(demoActor);
  p = run(p, {
    type: "workflow.decide",
    id: r.id,
    expectedVersion: r.version,
    decision: "reject",
    reason: "Отменено врачом",
    action: r.action,
    dueDate: "",
  });
  r = p.workflow!.recommendations.find((x) => x.id === r.id)!;
  expect(r.supersededEffects?.map((x) => x.id)).toEqual([plan.id, referral.id]);
  expect(r.supersededEffects?.[1]?.snapshot).toEqual(referral);
  expect(r.effectId).toBe("");
  for (const mutation of [
    { type: "plan.confirm" as const, id: plan.id },
    {
      type: "referral.save" as const,
      value: { ...referral, status: "issued" as const },
    },
  ])
    expect(() =>
      applyCommand(
        p,
        { commandId: "blocked", expectedRevision: p.revision, mutation },
        demoActor,
        now,
      ),
    ).toThrow(/связан/);
  expect(p.plan.find((x) => x.id === plan.id)).toEqual(plan);
  expect(p.referrals.find((x) => x.id === referral.id)).toEqual(referral);
});
it("незавершённая безопасность блокирует архив, повтор решения не дублирует проект", () => {
  let p = run(patient(), {
    ...submission(),
    value: { ...submission().value, safety: "unknown" },
  });
  expect(() =>
    applyCommand(
      p,
      {
        commandId: "archive",
        expectedRevision: p.revision,
        mutation: {
          type: "patient.archive",
          archived: true,
          reason: "Учебная проверка",
        },
      },
      demoActor,
      now,
    ),
  ).toThrow(/безопасност/);
  const r = p.workflow!.recommendations.find((r) => r.type === "observation")!;
  const command = {
    commandId: "same-decision",
    expectedRevision: p.revision,
    mutation: {
      type: "workflow.decide" as const,
      id: r.id,
      expectedVersion: r.version,
      decision: "accept" as const,
      reason: "",
      action: r.action,
      dueDate: "",
    },
  };
  p = applyCommand(p, command, demoActor, now);
  const replay = applyCommand(p, command, demoActor, now);
  expect(replay).toEqual(p);
  expect(replay.plan).toHaveLength(1);
  expect(
    replay.workflow!.recommendations.find((x) => x.id === r.id)!.history,
  ).toHaveLength(2);
});
it("исключение документа меняет основание без переписывания истории факта", () => {
  let p = patient();
  p.documents.push({
    id: "source-doc",
    title: "Учебная выписка",
    documentDate: "2026-10-25",
    issuer: "Учебная клиника",
    text: "Учебная цитата",
    status: "unverified",
    exclusionReason: "",
    facts: [],
    createdAt: now,
    author: demoActor.name,
  });
  p = applyCommand(
    p,
    {
      commandId: "doc-fact",
      expectedRevision: p.revision,
      mutation: {
        type: "fact.save",
        value: {
          id: "doc-fact",
          expectedVersion: 0,
          content: { category: "allergy", state: "unknown" },
          origin: {
            kind: "document",
            reference: "source-doc",
            quote: "Учебная цитата",
            observedAt: "",
          },
          reason: "",
        },
      },
    },
    demoActor,
    now,
  );
  p = run(p, submission());
  const previous = p.workflow!.recommendations[0]!;
  const facts = structuredClone(p.clinicalFacts);
  p.documents[0]!.status = "excluded";
  p.documents[0]!.exclusionReason = "Источник исключён врачом";
  reconcileWorkflow(p, demoActor, now);
  expect(
    p.workflow!.recommendations.find((r) => r.id === previous.id)!.stale,
  ).toBe(true);
  expect(p.clinicalFacts).toEqual(facts);
});
it("изменение подтверждённого лекарственного плана делает основание устаревшим", () => {
  let p = patient();
  p.plan.push({
    id: "medicine",
    createdAt: now,
    author: demoActor.name,
    visitId: "",
    kind: "medication",
    title: "Прежняя запись врача",
    details: "Учебный план",
    dose: "Доза врача",
    schedule: "Режим врача",
    startDate: "",
    endDate: "",
    dueDate: "",
    status: "confirmed",
    confirmedAt: now,
    confirmedBy: demoActor.name,
    changeReason: "",
    replacesId: "",
    instructionUrl: "",
    patientInstructions: "",
    sourceIds: [],
    rationale: "Учебная запись",
  });
  p = run(p, submission());
  const previous = p.workflow!.recommendations[0]!;
  p.plan[0]!.status = "stopped";
  reconcileWorkflow(p, demoActor, now);
  expect(
    p.workflow!.recommendations.find((r) => r.id === previous.id)!.stale,
  ).toBe(true);
});
it("контакт сохраняет в дельте нерешённые факты и решения, скрывая неизменённый подтверждённый факт", () => {
  let p = patient();
  for (const id of ["unknown", "contradicted", "confirmed"]) {
    p = applyCommand(
      p,
      {
        commandId: id,
        expectedRevision: p.revision,
        mutation: {
          type: "fact.save",
          value: {
            id,
            expectedVersion: 0,
            content:
              id === "confirmed"
                ? {
                    category: "allergy",
                    state: "known",
                    substance: "Учебное вещество",
                    reaction: "Учебная реакция",
                  }
                : { category: "allergy", state: "unknown" },
            origin: {
              kind: "patient",
              reference: "Учебная беседа",
              quote: "Нет сведений",
              observedAt: "",
            },
            reason: "",
          },
        },
      },
      demoActor,
      now,
    );
    if (id !== "unknown")
      p = applyCommand(
        p,
        {
          commandId: `review-${id}`,
          expectedRevision: p.revision,
          mutation: {
            type: "fact.review",
            id,
            expectedVersion: 1,
            decision: id === "confirmed" ? "confirm" : "contradict",
            reason: "Учебная проверка",
          },
        },
        demoActor,
        now,
      );
  }
  p = run(p, submission());
  p = run(p, { type: "workflow.contact", note: "Учебный контакт" });
  expect(
    changesSinceContact(p)
      .facts.map((f) => f.id)
      .sort(),
  ).toEqual(["contradicted", "unknown"]);
  expect(changesSinceContact(p).recommendations.length).toBeGreaterThan(0);
});
