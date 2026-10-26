import { expect, it } from "vitest";
import { createPatient } from "./commands";
import { populateSupportScenario } from "./clinical-support-scenarios";
import { isSupportEvaluationCurrent } from "./clinical-support";
import type { Actor } from "./model";
const actor: Actor = {
  id: "fixture-doctor",
  name: "Синтетический врач",
  specialty: "psychiatrist",
  clinicId: "fixture-clinic",
};
const now = new Date("2026-10-26T10:00:00.000Z");
it.each(["gad", "depression", "adverse", "unknown"] as const)(
  "синтетический сценарий %s проходит реальные команды без выдуманных отрицательных ответов",
  (variant) => {
    const p = populateSupportScenario(
      createPatient(
        { name: "Синтетический пациент", birthDate: "1990-01-01" },
        actor,
        now.toISOString(),
        `fixture-${variant}`,
      ),
      actor,
      now,
      variant,
    );
    const e = p.clinicalSupport!.evaluations.at(-1)!;
    expect(e.input.route).toBe(variant === "depression" ? "depression" : "gad");
    expect(e.input.observations).toEqual([]);
    expect(isSupportEvaluationCurrent(p, e, actor, now.toISOString())).toBe(
      true,
    );
    expect(p.plan).toEqual([]);
    expect(e.result.diagnosisConfirmed).toBe(false);
    expect(p.clinicalSupport!.adverseEvents).toHaveLength(
      variant === "adverse" ? 1 : 0,
    );
    if (variant === "adverse")
      expect(p.events[0]).toMatchObject({
        status: "created",
        urgency: "important",
        assessment: "",
      });
  },
);
