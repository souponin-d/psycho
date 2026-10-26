export type PatientPlanItem = {
  id: string;
  kind:
    "medication" | "psychotherapy" | "assessment" | "lifestyle" | "follow-up";
  title: string;
  dose: string;
  schedule: string;
  startDate: string;
  endDate: string;
  patientInstructions: string;
};
export type PatientPlanProjection =
  { kind: "ready"; items: PatientPlanItem[] } | { kind: "unavailable" };

/** Read only explicit server fields. Free-text schedules are not dose slots. */
export function decodePatientPlan(value: unknown): PatientPlanProjection {
  if (!Array.isArray(value)) return { kind: "unavailable" };
  const items: PatientPlanItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      return { kind: "unavailable" };
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !row.id ||
      typeof row.title !== "string" ||
      !row.title ||
      typeof row.kind !== "string" ||
      ![
        "medication",
        "psychotherapy",
        "assessment",
        "lifestyle",
        "follow-up",
      ].includes(row.kind) ||
      row.status !== "confirmed" ||
      ["dose", "schedule", "startDate", "endDate", "patientInstructions"].some(
        (key) => typeof row[key] !== "string",
      ) ||
      items.some((existing) => existing.id === row.id)
    )
      return { kind: "unavailable" };
    items.push({
      id: row.id,
      kind: row.kind as PatientPlanItem["kind"],
      title: row.title,
      dose: row.dose as string,
      schedule: row.schedule as string,
      startDate: row.startDate as string,
      endDate: row.endDate as string,
      patientInstructions: row.patientInstructions as string,
    });
  }
  return { kind: "ready", items };
}
