import type { Actor, PatientRecord, PlanItem } from "./model.ts";

function same(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => same(v, b[i]))
    );
  if (typeof a === "object" || typeof b === "object") {
    if (typeof a !== "object" || typeof b !== "object") return false;
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>;
    const keys = Object.keys(x).sort(),
      other = Object.keys(y).sort();
    return (
      keys.length === other.length &&
      keys.every((key, i) => key === other[i] && same(x[key], y[key]))
    );
  }
  return a === b;
}
function requirePolicy(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function assertMedicationVisit(
  patient: PatientRecord,
  item: PlanItem,
  actor: Actor,
  confirming: boolean,
) {
  if (item.kind !== "medication") return;
  if (!item.visitId) {
    requirePolicy(
      !confirming,
      "Лекарственное назначение нужно связать с приёмом.",
    );
    return;
  }
  const visit = patient.visits.find((v) => v.id === item.visitId);
  requirePolicy(visit, "Приём не найден.");
  if (visit.format === "in-person") {
    if (confirming)
      requirePolicy(
        visit.status === "in-progress",
        "Подтвердите назначение на начатом очном приёме.",
      );
    return;
  }
  requirePolicy(visit.format === "remote", "Неизвестный формат приёма.");
  requirePolicy(
    visit.status === "in-progress",
    "Дистанционная коррекция доступна на начатом приёме.",
  );
  requirePolicy(item.replacesId, "Новый препарат назначается на очном приёме.");
  let previous = patient.plan.find((p) => p.id === item.replacesId);
  requirePolicy(
    previous &&
      previous.kind === "medication" &&
      previous.status === "confirmed",
    "Нужен действующий назначенный препарат.",
  );
  for (const key of [
    "kind",
    "title",
    "medicine",
    "details",
    "schedule",
    "startDate",
    "endDate",
    "dueDate",
    "instructionUrl",
    "patientInstructions",
    "sourceIds",
  ] as const)
    requirePolicy(
      same(item[key], previous[key]),
      "Дистанционно можно изменить только дозировку назначенного препарата.",
    );
  const seen = new Set<string>();
  for (let depth = 0; ; depth++) {
    requirePolicy(
      depth < 100 && !seen.has(previous.id),
      "Не удалось проверить историю назначения.",
    );
    seen.add(previous.id);
    requirePolicy(
      previous.confirmedById === actor.id,
      "Для дистанционной коррекции нужно исходное назначение этого врача.",
    );
    const source = patient.visits.find((v) => v.id === previous!.visitId);
    requirePolicy(source, "Нет подтверждённого очного назначения.");
    if (source.format === "in-person") {
      requirePolicy(
        source.status === "completed" &&
          source.confirmedById === actor.id &&
          source.diagnoses.some((d) => d.status === "confirmed"),
        "Нужен завершённый очный приём этого врача с установленным диагнозом.",
      );
      break;
    }
    requirePolicy(
      source.format === "remote" && previous.replacesId,
      "Нет подтверждённого очного назначения.",
    );
    const prior = patient.plan.find((p) => p.id === previous!.replacesId);
    requirePolicy(prior, "Нет подтверждённого очного назначения.");
    previous = prior;
  }
}
export function assertMedicationStatusVisit(
  patient: PatientRecord,
  item: PlanItem,
  visitId?: string,
) {
  if (item.kind !== "medication") return;
  const visit = patient.visits.find((v) => v.id === visitId);
  requirePolicy(
    visit?.format === "in-person" && visit.status === "in-progress",
    "Изменение статуса препарата доступно на начатом очном приёме.",
  );
}
