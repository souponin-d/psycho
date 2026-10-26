import { expect, it } from "vitest";
import { applyCommand, createPatient } from "./commands";
import { ICD10_CATALOG } from "./terminology";
import { installGrlsFixture } from "../../../../tests/grls-fixture";
import { legacyClinicalFacts, type ClinicalFactValue } from "./clinical-facts";
import type { Actor, Mutation, PatientRecord } from "./model";
const actor: Actor = {
  id: "d1",
  name: "Учебный врач",
  clinicId: "c1",
  specialty: "psychiatrist",
};
const now = "2026-10-26T09:00:00.000Z";
const patient = () =>
  createPatient(
    { name: "Учебный контекст", birthDate: "1990-01-01" },
    actor,
    now,
    "p1",
  );
function run(
  p: PatientRecord,
  mutation: Mutation,
  as = actor,
  id: string = crypto.randomUUID(),
) {
  return applyCommand(
    p,
    { commandId: id, expectedRevision: p.revision, mutation },
    as,
    now,
  );
}
const origin = {
  kind: "patient" as const,
  reference: "Беседа на приёме",
  quote: "Сообщает об аллергии на пенициллин",
  observedAt: now,
};
const allergy: ClinicalFactValue = {
  category: "allergy",
  state: "known",
  substance: "Пенициллин",
  reaction: "Со слов пациента: сыпь",
};
it("сохраняет лекарственный снимок без создания назначения и переносит разобранную запись только один раз", () => {
  const medicine = installGrlsFixture();
  let p = patient();
  p.profile.currentMedication = "Учебный лекарственный анамнез";
  const legacy = legacyClinicalFacts(p).find(
    (f) => f.key === "profile:currentMedication",
  )!;
  const value = {
    id: "medicine-fact",
    expectedVersion: 0,
    content: {
      category: "medication" as const,
      state: "known" as const,
      medicine,
      details: "Самоотчёт",
    },
    origin: legacy.origin,
    reason: "Сопоставлено с регистрационным удостоверением",
  };
  p = run(p, { type: "fact.save", value });
  expect(p.plan).toHaveLength(0);
  expect(legacyClinicalFacts(p).some((f) => f.key === legacy.key)).toBe(false);
  expect(() =>
    run(p, { type: "fact.save", value: { ...value, id: "duplicate" } }),
  ).toThrow(/уже перенесена/);
  p.profile.currentMedication = "Источник изменён";
  expect(
    legacyClinicalFacts(p).find((f) => f.key === legacy.key)?.changed,
  ).toBe(true);
});
it("подтверждает цитату только из действующего документа этой карты", () => {
  const p = patient();
  p.documents.push({
    id: "doc1",
    title: "Синтетическая выписка",
    documentDate: "2026-10-25",
    issuer: "Учебная клиника",
    text: "Учебная выписка: сообщена реакция на пенициллин",
    status: "unverified",
    exclusionReason: "",
    facts: [],
    createdAt: now,
    author: actor.name,
  });
  const source = {
    kind: "document" as const,
    reference: "doc1",
    quote: "реакция на пенициллин",
    observedAt: "",
  };
  const saved = run(p, {
    type: "fact.save",
    value: {
      id: "doc-fact",
      expectedVersion: 0,
      content: allergy,
      origin: source,
      reason: "",
    },
  });
  expect(() =>
    run(saved, {
      type: "fact.review",
      id: "doc-fact",
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    }),
  ).not.toThrow();
  saved.documents[0]!.status = "excluded";
  expect(() =>
    run(saved, {
      type: "fact.review",
      id: "doc-fact",
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    }),
  ).toThrow(/документ/i);
  expect(() =>
    run(p, {
      type: "fact.save",
      value: {
        id: "fake-quote",
        expectedVersion: 0,
        content: allergy,
        origin: { ...source, quote: "Несуществующая цитата" },
        reason: "",
      },
    }),
  ).toThrow(/цитат/i);
});
it("разделяет сообщение пациента и подтверждение врача, не стирая источник и старую версию", () => {
  let p = run(patient(), {
    type: "fact.save",
    value: {
      id: "f1",
      expectedVersion: 0,
      content: allergy,
      origin,
      reason: "",
    },
  });
  expect(p.clinicalFacts?.[0]?.versions[0]?.status).toBe("unverified");
  p = run(p, {
    type: "fact.review",
    id: "f1",
    expectedVersion: 1,
    decision: "confirm",
    reason: "",
  });
  const versions = p.clinicalFacts![0]!.versions;
  expect(versions).toHaveLength(2);
  expect(versions[1]?.origin).toEqual(origin);
  expect(versions[1]?.verifiedBy?.id).toBe(actor.id);
  expect(versions[0]?.verifiedBy).toBeNull();
  expect(p.audit.at(-1)?.action).toBe("fact.review");
  expect(() =>
    run(p, {
      type: "fact.review",
      id: "f1",
      expectedVersion: 1,
      decision: "clarify",
      reason: "",
    }),
  ).toThrow(/верси/i);
});
it("требует причину исправления и противоречия, а исправление не подтверждает новые данные автоматически", () => {
  let p = run(patient(), {
    type: "fact.save",
    value: {
      id: "f1",
      expectedVersion: 0,
      content: allergy,
      origin,
      reason: "",
    },
  });
  expect(() =>
    run(p, {
      type: "fact.review",
      id: "f1",
      expectedVersion: 1,
      decision: "contradict",
      reason: "",
    }),
  ).toThrow(/причин/i);
  expect(() =>
    run(p, {
      type: "fact.save",
      value: {
        id: "f1",
        expectedVersion: 1,
        content: { ...allergy, reaction: "Уточнено" },
        origin,
        reason: "",
      },
    }),
  ).toThrow(/причин/i);
  p = run(p, {
    type: "fact.save",
    value: {
      id: "f1",
      expectedVersion: 1,
      content: { ...allergy, reaction: "Уточнено" },
      origin,
      reason: "Сверено описание реакции",
    },
  });
  expect(p.clinicalFacts?.[0]?.versions.at(-1)?.status).toBe("unverified");
  expect(p.clinicalFacts?.[0]?.versions[0]?.content).toEqual(allergy);
});
it("не принимает неизвестное за отсутствие аллергии и не доверяет присланному подтверждению", () => {
  let p = run(patient(), {
    type: "fact.save",
    value: {
      id: "f1",
      expectedVersion: 0,
      content: { category: "allergy", state: "unknown" },
      origin,
      reason: "",
    },
  });
  expect(p.clinicalFacts?.[0]?.versions[0]?.status).toBe("unknown");
  expect(() =>
    run(p, {
      type: "fact.review",
      id: "f1",
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    }),
  ).toThrow(/уточн/i);
  expect(() =>
    run(patient(), {
      type: "fact.save",
      value: {
        id: "f1",
        expectedVersion: 0,
        content: allergy,
        origin,
        reason: "",
        verifiedBy: actor,
      },
    } as unknown as Mutation),
  ).toThrow();
});
it("проверяет документ, цитату и полномочие психиатра на подтверждение диагноза", () => {
  expect(() =>
    run(patient(), {
      type: "fact.save",
      value: {
        id: "f1",
        expectedVersion: 0,
        content: allergy,
        origin: { ...origin, kind: "document", reference: "foreign-document" },
        reason: "",
      },
    }),
  ).toThrow(/документ/i);
  const content: ClinicalFactValue = {
    category: "diagnosis",
    state: "known",
    condition: ICD10_CATALOG.find((r) => r.code === "F41.1")!,
    diagnosticStatus: "hypothesis",
  };
  const p = run(patient(), {
    type: "fact.save",
    value: { id: "f1", expectedVersion: 0, content, origin, reason: "" },
  });
  expect(() =>
    run(
      p,
      {
        type: "fact.review",
        id: "f1",
        expectedVersion: 1,
        decision: "confirm",
        reason: "",
      },
      { ...actor, specialty: "physician" },
    ),
  ).toThrow(/психиатр/i);
});
it("показывает старую запись без автоинтерпретации и не создаёт повтор при повторной команде", () => {
  const old = patient();
  old.profile.allergies = "Аллергии отрицает";
  const legacy = legacyClinicalFacts(old).find(
    (r) => r.key === "profile:allergies",
  )!;
  expect(legacy.content.state).toBe("unresolved");
  expect(old.clinicalFacts ?? []).toHaveLength(0);
  const mutation: Mutation = {
    type: "fact.save",
    value: {
      id: "f1",
      expectedVersion: 0,
      content: legacy.content,
      origin: legacy.origin,
      reason: "",
    },
  };
  const p = run(old, mutation, actor, "stable");
  expect(run(p, mutation, actor, "stable")).toEqual(p);
  expect(legacyClinicalFacts(p).some((r) => r.key === legacy.key)).toBe(false);
  expect(p.profile.allergies).toBe(old.profile.allergies);
});

it("замечает изменение структурированного источника при неизменном тексте", () => {
  const p = patient();
  const condition = ICD10_CATALOG.find((c) => c.code === "F41.1")!;
  p.episodes.push({
    id: "episode-source",
    title: "Учебный эпизод",
    diagnosis: condition.title,
    diagnosisCode: condition,
    diagnosisStatus: "hypothesis",
    status: "active",
    phase: "assessment",
    startedOn: "2026-10-25",
    endDate: "",
    summary: "",
    createdAt: now,
    author: actor.name,
  });
  const legacy = legacyClinicalFacts(p).find(
    (f) => f.key === "episode:episode-source",
  )!;
  const saved = run(p, {
    type: "fact.save",
    value: {
      id: "migrated",
      expectedVersion: 0,
      content: legacy.content,
      origin: legacy.origin,
      reason: "",
    },
  });
  expect(legacyClinicalFacts(saved).some((f) => f.key === legacy.key)).toBe(
    false,
  );
  saved.episodes[0]!.diagnosisCode = {
    ...condition,
    sourceVersion: "Другой источник",
  };
  expect(
    legacyClinicalFacts(saved).find((f) => f.key === legacy.key)?.changed,
  ).toBe(true);
});
