import { describe, expect, it } from "vitest";
import { seedPatients, demoActor } from "./seed";
import { ICD10_CATALOG } from "./terminology";
import { applyCommand } from "./commands";
import {
  aviandrContext,
  newAviandrReview,
  evaluateAviandr,
  prepareAviandrReview,
} from "./aviandr";

const patient = () => seedPatients(new Date("2026-10-24T09:00:00Z"))[0]!;
const now = "2026-10-24T10:00:00Z";
function evaluate(change: Record<string, unknown> = {}) {
  const p = patient();
  const review = newAviandrReview(p, "new-plan");
  Object.assign(review.inputs, change);
  return evaluateAviandr(review, "2026-10-24");
}
describe("Подготовительная проверка Авиандра", () => {
  it("does not treat a planned future MAOI cessation as already completed", () => {
    const p = patient();
    const review = newAviandrReview(p, "new-plan");
    review.inputs.maoUse = "no";
    review.inputs.lastMaoDate = "2026-10-25";
    expect(() =>
      prepareAviandrReview(p, "new-plan", review, now, "Врач", "2026-11-10"),
    ).toThrow(/будущем/);
  });
  it("uses patient context but never interprets free text or missing data as absence of risk", () => {
    const p = patient();
    p.profile.allergies = "не уточнено";
    const review = newAviandrReview(p, "new-plan");
    expect(review.context.allergies).toBe("не уточнено");
    expect(review.inputs.hypersensitivity).toBe("unknown");
    expect(
      evaluateAviandr(review, "2026-10-24").find(
        (f) => f.id === "hypersensitivity",
      )?.status,
    ).toBe("missing");
    expect(review.status).toBe("unapproved");
  });
  it("separates contraindication candidates from precautions and indication uncertainty", () => {
    const rows = evaluate({
      hypersensitivity: "yes",
      serotonergic: "yes",
      indication: "other",
    });
    expect(rows.find((f) => f.id === "hypersensitivity")?.status).toBe(
      "contraindication",
    );
    expect(rows.find((f) => f.id === "serotonergic")?.status).toBe("caution");
    expect(rows.find((f) => f.id === "indication")?.status).toBe("review");
  });
  it("does not apply a renal threshold to indexed or undated eGFR", () => {
    expect(
      evaluate({
        egfr: 59,
        egfrUnit: "ml/min/1.73m2",
        egfrDate: "2026-10-23",
      }).find((f) => f.id === "renal")?.status,
    ).toBe("review");
    expect(
      evaluate({ egfr: 59, egfrUnit: "ml/min", egfrDate: "" }).find(
        (f) => f.id === "renal",
      )?.status,
    ).toBe("missing");
    expect(
      evaluate({ egfr: 59, egfrUnit: "ml/min", egfrDate: "2026-10-23" }).find(
        (f) => f.id === "renal",
      )?.status,
    ).toBe("contraindication");
    expect(
      evaluate({ egfr: 60, egfrUnit: "ml/min", egfrDate: "2026-10-23" }).find(
        (f) => f.id === "renal",
      )?.status,
    ).toBe("review");
  });
  it("checks MAOI cessation against the planned start, retaining uncertainty without a date", () => {
    const row = (date: string) =>
      evaluate({ maoUse: "no", lastMaoDate: date }).find((f) => f.id === "mao");
    expect(row("2026-10-11")?.status).toBe("contraindication");
    expect(row("2026-10-10")?.status).toBe("not-identified");
    expect(
      evaluate({ maoUse: "unknown" }).find((f) => f.id === "mao")?.status,
    ).toBe("missing");
  });
  it("requires clinician review at an ambiguous age boundary and invalid dates", () => {
    const review = newAviandrReview(patient(), "new-plan");
    review.context.birthDate = "2008-10-24";
    expect(
      evaluateAviandr(review, "2026-10-24").find((f) => f.id === "age")?.status,
    ).toBe("review");
    review.context.birthDate = "2010-10-24";
    expect(
      evaluateAviandr(review, "2026-10-24").find((f) => f.id === "age")?.status,
    ).toBe("contraindication");
    expect(() =>
      prepareAviandrReview(
        patient(),
        "new-plan",
        { ...review, inputs: { ...review.inputs, egfrDate: "2026-02-30" } },
        now,
        "Врач",
      ),
    ).toThrow();
  });
  it("recomputes client findings, fixes authorship and marks changed chart context stale", () => {
    const p = patient();
    const review = newAviandrReview(p, "new-plan");
    review.inputs.hypersensitivity = "yes";
    review.findings = [];
    review.checkedBy = "подделка";
    const stored = prepareAviandrReview(p, "new-plan", review, now, "Врач");
    expect(stored.checkedBy).toBe("Врач");
    expect(
      stored.findings.find((f) => f.id === "hypersensitivity")?.status,
    ).toBe("contraindication");
    p.profile.currentMedication = "Новое лекарство";
    expect(aviandrContext(p, "new-plan")).not.toEqual(stored.context);
    expect(() =>
      prepareAviandrReview(p, "new-plan", stored, now, "Врач"),
    ).toThrow(/карты/);
  });
  it("rejects forged approval, source version, unknown fields and malformed answers", () => {
    const p = patient();
    const review = newAviandrReview(p, "new-plan");
    for (const patch of [
      { status: "approved" },
      { sourceVersion: "other" },
      { unexpected: true },
      { inputs: { ...review.inputs, epilepsy: false } },
    ]) {
      expect(() =>
        prepareAviandrReview(
          p,
          "new-plan",
          { ...review, ...patch } as typeof review,
          now,
          "Врач",
        ),
      ).toThrow();
    }
  });
  it("persists a recomputed draft snapshot and never blocks or auto-confirms on unapproved findings", () => {
    const p = patient();
    const plan = {
      ...p.plan[0]!,
      id: "aviandr-plan",
      kind: "medication" as const,
      title: "Авиандр, таблетки 20 мг",
      status: "draft" as const,
      visitId: "",
      dose: "20 мг",
      schedule: "Введено врачом",
      instructionUrl: "https://example.test/instruction",
      startDate: "2026-10-24",
      aviandrReview: newAviandrReview(p, "aviandr-plan"),
    };
    plan.aviandrReview.inputs.epilepsy = "yes";
    const saved = applyCommand(
      p,
      {
        commandId: "save",
        expectedRevision: p.revision,
        mutation: { type: "plan.save", value: plan },
      },
      demoActor,
      now,
    );
    expect(saved.plan.at(-1)?.status).toBe("draft");
    expect(
      saved.plan
        .at(-1)
        ?.aviandrReview?.findings.find((f) => f.id === "epilepsy")?.status,
    ).toBe("contraindication");
    const confirmed = applyCommand(
      saved,
      {
        commandId: "confirm",
        expectedRevision: saved.revision,
        mutation: { type: "plan.confirm", id: plan.id },
      },
      demoActor,
      now,
    );
    expect(confirmed.plan.at(-1)?.status).toBe("confirmed");
    expect(confirmed.plan.at(-1)?.aviandrReview?.status).toBe("unapproved");
    const changed = structuredClone(saved);
    changed.profile.clinicalContext.somaticConditions = [
      ICD10_CATALOG.find((item) => item.code === "G40")!,
    ];
    expect(() =>
      applyCommand(
        changed,
        {
          commandId: "again",
          expectedRevision: changed.revision,
          mutation: { type: "plan.confirm", id: plan.id },
        },
        demoActor,
        now,
      ),
    ).toThrow(/карты/);
  });
});

it("включает выбранные соматические состояния в снимок проверки", () => {
  const p = patient();
  p.profile.clinicalContext.somaticConditions = [
    ICD10_CATALOG.find((item) => item.code === "G40")!,
  ];
  expect(aviandrContext(p, "new-plan").conditions).toBe("G40 Эпилепсия");
});

it("считает проверку устаревшей после изменения выбранного диагноза приёма", () => {
  const p = patient();
  const diagnosis = {
    ...ICD10_CATALOG.find((d) => d.code === "F41.1")!,
    status: "hypothesis" as const,
  };
  p.visits[0]!.diagnoses = [diagnosis];
  const review = newAviandrReview(p, "new-plan");
  expect(review.context.diagnoses.some((row) => row.includes("F41.1"))).toBe(
    true,
  );
  p.visits[0]!.diagnoses = [];
  expect(() =>
    prepareAviandrReview(p, "new-plan", review, now, "Врач", "2026-10-24"),
  ).toThrow(/изменил/);
});
