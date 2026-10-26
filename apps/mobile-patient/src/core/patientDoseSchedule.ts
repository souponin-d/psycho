export type PatientDoseSchedule = {
  id: string;
  version: number;
  planId: string;
  times: string[];
  offsetMinutes: number;
  effectiveFrom: string;
  effectiveUntil: string;
  endDate: string;
  medication: {
    id: string;
    title: string;
    dose: string;
    schedule: string;
    patientInstructions: string;
  };
};
export type PatientDoseRecord = {
  id: string;
  scheduleId: string;
  scheduleVersion: number;
  plannedAt: string;
  version: number;
  status: "taken" | "missed" | "not-applicable" | "unknown";
  reportedAt: string;
  provenance: "patient" | "clinician";
};
export type PatientDoses =
  | {
      kind: "ready";
      schedules: PatientDoseSchedule[];
      records: PatientDoseRecord[];
    }
  | { kind: "unavailable" };
export type PatientDoseSlot = {
  scheduleId: string;
  scheduleVersion: number;
  plannedAt: string;
  time: string;
  title: string;
  dose: string;
  status: PatientDoseRecord["status"];
  recordVersion: number;
  available: boolean;
};
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const nonempty = (x: unknown): x is string =>
  typeof x === "string" && x.length > 0;
const instant = (x: unknown): x is string =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
    x,
  ) &&
  day(x.slice(0, 10)) &&
  Number.isFinite(Date.parse(x));
const day = (x: unknown): x is string =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  Number.isFinite(Date.parse(x + "T00:00:00Z")) &&
  new Date(x + "T00:00:00Z").toISOString().startsWith(x);
const integer = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x);

export function decodePatientDoses(
  schedules: unknown,
  records: unknown,
): PatientDoses {
  if (!Array.isArray(schedules) || !Array.isArray(records))
    return { kind: "unavailable" };
  const seenSchedules = new Map<string, PatientDoseSchedule>();
  for (const s of schedules) {
    if (
      !object(s) ||
      !nonempty(s.id) ||
      !integer(s.version) ||
      s.version < 1 ||
      !nonempty(s.planId) ||
      !Array.isArray(s.times) ||
      !s.times.length ||
      s.times.length > 24 ||
      s.times.some(
        (t: unknown) =>
          typeof t !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t),
      ) ||
      new Set(s.times).size !== s.times.length ||
      !integer(s.offsetMinutes) ||
      s.offsetMinutes < -720 ||
      s.offsetMinutes > 840 ||
      s.offsetMinutes % 15 !== 0 ||
      !instant(s.effectiveFrom) ||
      !(s.effectiveUntil === "" || instant(s.effectiveUntil)) ||
      !day(s.endDate) ||
      !object(s.medication) ||
      s.medication.id !== s.planId ||
      !nonempty(s.medication.title) ||
      !nonempty(s.medication.dose) ||
      typeof s.medication.schedule !== "string" ||
      typeof s.medication.patientInstructions !== "string"
    )
      return { kind: "unavailable" };
    const key = JSON.stringify([s.id, s.version]);
    if (seenSchedules.has(key)) return { kind: "unavailable" };
    seenSchedules.set(key, s as PatientDoseSchedule);
  }
  const seenRecords = new Set<string>();
  for (const r of records) {
    if (
      !object(r) ||
      !nonempty(r.id) ||
      !nonempty(r.scheduleId) ||
      !integer(r.scheduleVersion) ||
      r.scheduleVersion < 1 ||
      !instant(r.plannedAt) ||
      !integer(r.version) ||
      r.version < 1 ||
      !["taken", "missed", "not-applicable", "unknown"].includes(
        String(r.status),
      ) ||
      !instant(r.reportedAt) ||
      !["patient", "clinician"].includes(String(r.provenance)) ||
      !seenSchedules.has(JSON.stringify([r.scheduleId, r.scheduleVersion]))
    )
      return { kind: "unavailable" };
    const schedule = seenSchedules.get(
      JSON.stringify([r.scheduleId, r.scheduleVersion]),
    )!;
    const planned = Date.parse(r.plannedAt);
    const local = new Date(
      planned + schedule.offsetMinutes * 60000,
    ).toISOString();
    if (
      local.slice(16) !== ":00.000Z" ||
      !schedule.times.includes(local.slice(11, 16)) ||
      local.slice(0, 10) > schedule.endDate ||
      planned < Date.parse(schedule.effectiveFrom) ||
      (schedule.effectiveUntil &&
        planned >= Date.parse(schedule.effectiveUntil))
    )
      return { kind: "unavailable" };
    const key = JSON.stringify([
      r.scheduleId,
      r.scheduleVersion,
      new Date(r.plannedAt).toISOString(),
    ]);
    if (seenRecords.has(key)) return { kind: "unavailable" };
    seenRecords.add(key);
  }
  return {
    kind: "ready",
    schedules: schedules as PatientDoseSchedule[],
    records: records as PatientDoseRecord[],
  };
}
export function doseSlotsForDay(
  data: Extract<PatientDoses, { kind: "ready" }>,
  date: string,
  now: number,
): PatientDoseSlot[] {
  if (!day(date) || !Number.isFinite(now)) return [];
  const slots: PatientDoseSlot[] = [];
  for (const s of data.schedules) {
    if (date > s.endDate) continue;
    for (const time of s.times) {
      const planned =
        Date.parse(`${date}T${time}:00.000Z`) - s.offsetMinutes * 60000;
      if (
        planned < Date.parse(s.effectiveFrom) ||
        (s.effectiveUntil && planned >= Date.parse(s.effectiveUntil))
      )
        continue;
      const at = new Date(planned).toISOString();
      const record = data.records.find(
        (r) =>
          r.scheduleId === s.id &&
          r.scheduleVersion === s.version &&
          new Date(r.plannedAt).toISOString() === at,
      );
      slots.push({
        scheduleId: s.id,
        scheduleVersion: s.version,
        plannedAt: at,
        time,
        title: s.medication.title,
        dose: s.medication.dose,
        status: record?.status ?? "unknown",
        recordVersion: record?.version ?? 0,
        available: planned <= now,
      });
    }
  }
  return slots.sort(
    (a, b) =>
      a.plannedAt.localeCompare(b.plannedAt) ||
      a.scheduleId.localeCompare(b.scheduleId),
  );
}

export function localDayBounds(
  date: string,
): { start: number; end: number } | null {
  if (!day(date)) return null;
  const next = new Date(Date.parse(date + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
  const start = new Date(date + "T00:00:00").getTime();
  const end = new Date(next + "T00:00:00").getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    ? { start, end }
    : null;
}

/** Select by the phone's actual local-day boundaries, including DST changes. */
export function doseSlotsForLocalDay(
  data: Extract<PatientDoses, { kind: "ready" }>,
  date: string,
  localStart: number,
  localEnd: number,
  now: number,
): PatientDoseSlot[] {
  if (
    !day(date) ||
    !Number.isFinite(localStart) ||
    !Number.isFinite(localEnd) ||
    localEnd <= localStart ||
    !Number.isFinite(now)
  )
    return [];
  const noon = Date.parse(date + "T12:00:00Z");
  const slots = [];
  for (let delta = -2; delta <= 2; delta++) {
    const scheduleDay = new Date(noon + delta * 86400000)
      .toISOString()
      .slice(0, 10);
    slots.push(
      ...doseSlotsForDay(data, scheduleDay, now).filter((slot) => {
        const instant = Date.parse(slot.plannedAt);
        return instant >= localStart && instant < localEnd;
      }),
    );
  }
  return slots.sort(
    (a, b) =>
      a.plannedAt.localeCompare(b.plannedAt) ||
      a.scheduleId.localeCompare(b.scheduleId),
  );
}
