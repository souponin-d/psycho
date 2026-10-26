import type { Actor, PatientRecord, PlanItem } from "./model";

export type AdherenceStatus = "taken" | "missed" | "not-applicable" | "unknown";
export type AdherenceProvenance = "patient" | "clinician";
export interface AdherenceSchedule {
  id: string;
  version: number;
  planId: string;
  times: string[];
  /** Fixed UTC offset; Moscow is +180. No implicit daylight-saving conversion. */
  offsetMinutes: number;
  effectiveFrom: string;
  endDate: string;
  /** Exclusive upper bound; empty means not closed or superseded. */
  effectiveUntil: string;
  closedAt: string;
  closeReason: string;
  planSnapshot: PlanItem;
  createdAt: string;
  createdBy: Actor;
  reason: string;
}
export interface AdherenceRecordRevision {
  version: number;
  status: AdherenceStatus;
  reportedAt: string;
  provenance: AdherenceProvenance;
  reason: string;
  at: string;
  by: Actor;
}
export interface AdherenceRecord {
  id: string;
  scheduleId: string;
  scheduleVersion: number;
  plannedAt: string;
  version: number;
  status: AdherenceStatus;
  reportedAt: string;
  provenance: AdherenceProvenance;
  reason: string;
  history: AdherenceRecordRevision[];
}
export interface AdherenceState {
  schedules: AdherenceSchedule[];
  records: AdherenceRecord[];
}
export type AdherenceMutation =
  | {
      type: "adherence.schedule";
      value: {
        id: string;
        expectedVersion: number;
        planId: string;
        times: string[];
        offsetMinutes: number;
        effectiveFrom: string;
        endDate: string;
        reason: string;
      };
    }
  | {
      type: "adherence.record";
      value: {
        scheduleId: string;
        scheduleVersion: number;
        plannedAt: string;
        status: AdherenceStatus;
        reportedAt: string;
        provenance: AdherenceProvenance;
        reason: string;
        expectedVersion: number;
      };
    };
export interface AdherenceSlot {
  id: string;
  scheduleId: string;
  scheduleVersion: number;
  planId: string;
  plannedAt: string;
  localDate: string;
  time: string;
  offsetMinutes: number;
  status: AdherenceStatus;
  recordVersion: number;
  reason: string;
  planSnapshot: PlanItem;
}
export interface AdherenceSummary {
  fromDate: string;
  toDate: string;
  applicable: number;
  taken: number;
  missed: number;
  unknown: number;
  notApplicable: number;
  coverage: number | null;
  percentage: number | null;
  slots: AdherenceSlot[];
}
type Subject = PatientRecord & { adherence?: AdherenceState };
const DAY = 86_400_000;
const statuses: AdherenceStatus[] = [
  "taken",
  "missed",
  "not-applicable",
  "unknown",
];
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(
    !!value && typeof value === "object" && !Array.isArray(value),
    "Неверный формат отметки или расписания.",
  );
}
function only(value: object, fields: string[]) {
  check(
    Object.keys(value).every((key) => fields.includes(key)),
    "Неподдерживаемое поле приверженности.",
  );
}
function text(
  value: unknown,
  required = false,
  limit = 2000,
): asserts value is string {
  check(
    typeof value === "string" &&
      value.length <= limit &&
      (!required || !!value.trim()),
    "Проверьте текстовое поле и причину изменения.",
  );
}
function integer(value: unknown, minimum: number, maximum: number) {
  check(
    typeof value === "number" &&
      Number.isInteger(value) &&
      value >= minimum &&
      value <= maximum,
    "Неверная версия или числовое значение.",
  );
}
function date(value: unknown): asserts value is string {
  check(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Дата должна иметь формат ГГГГ-ММ-ДД.",
  );
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  check(
    Number.isFinite(parsed) &&
      new Date(parsed).toISOString().slice(0, 10) === value,
    "Несуществующая календарная дата.",
  );
}
function instant(value: unknown): string {
  check(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
        value,
      ),
    "Укажите время ISO с часовым поясом.",
  );
  date(value.slice(0, 10));
  const parsed = Date.parse(value);
  if (!value.endsWith("Z")) {
    const offset = value.slice(-6);
    check(
      offset.slice(1, 3) !== "14" || offset.slice(4) === "00",
      "Часовой пояс ISO выходит за допустимый диапазон.",
    );
  }
  check(Number.isFinite(parsed), "Неверное время.");
  return new Date(parsed).toISOString();
}
function localDate(at: string, offset: number) {
  return new Date(Date.parse(at) + offset * 60_000).toISOString().slice(0, 10);
}
function plannedAt(day: string, time: string, offset: number) {
  return new Date(
    Date.parse(`${day}T${time}:00.000Z`) - offset * 60_000,
  ).toISOString();
}
function slotId(schedule: AdherenceSchedule, at: string) {
  return `${schedule.id}@${schedule.version}:${at}`;
}
function isSlot(schedule: AdherenceSchedule, at: string) {
  const day = localDate(at, schedule.offsetMinutes);
  return (
    at >= schedule.effectiveFrom &&
    (!schedule.effectiveUntil || at < schedule.effectiveUntil) &&
    day <= schedule.endDate &&
    schedule.times.some(
      (time) => plannedAt(day, time, schedule.offsetMinutes) === at,
    )
  );
}
function latestSchedules(state: AdherenceState) {
  const versions = new Map<string, AdherenceSchedule>();
  for (const entry of state.schedules)
    if (
      !versions.has(entry.id) ||
      versions.get(entry.id)!.version < entry.version
    )
      versions.set(entry.id, entry);
  return [...versions.values()];
}
function samePlan(a: PlanItem, b: PlanItem) {
  return (
    [
      "id",
      "kind",
      "title",
      "details",
      "dose",
      "schedule",
      "startDate",
      "endDate",
      "confirmedAt",
      "confirmedBy",
    ].every((key) => a[key as keyof PlanItem] === b[key as keyof PlanItem]) &&
    JSON.stringify(a.medicine ?? null) === JSON.stringify(b.medicine ?? null)
  );
}

/** In-place domain mutation; the command shell owns access, audit and idempotency. */
export function applyAdherenceMutation(
  p: Subject,
  mutation: AdherenceMutation,
  actor: Actor,
  now: string,
): void {
  check(!p.archived, "Архивная карта доступна только для чтения.");
  const at = instant(now);
  object(mutation);
  only(mutation, ["type", "value"]);
  const value = mutation.value;
  object(value);
  const state = p.adherence ?? { schedules: [], records: [] };
  if (mutation.type === "adherence.schedule") {
    const v = mutation.value;
    only(v, [
      "id",
      "expectedVersion",
      "planId",
      "times",
      "offsetMinutes",
      "effectiveFrom",
      "endDate",
      "reason",
    ]);
    text(v.id, true, 100);
    text(v.planId, true, 100);
    text(v.reason, true);
    integer(v.expectedVersion, 0, 10000);
    integer(v.offsetMinutes, -720, 840);
    check(
      v.offsetMinutes % 15 === 0,
      "Смещение часового пояса должно быть кратно 15 минутам.",
    );
    check(
      Array.isArray(v.times) && v.times.length > 0 && v.times.length <= 24,
      "Нужно от 1 до 24 времён приёма.",
    );
    check(
      Array.from(v.times).every(
        (time) =>
          typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time),
      ),
      "Время приёма должно иметь формат ЧЧ:ММ.",
    );
    check(
      new Set(v.times).size === v.times.length,
      "Время приёма не должно повторяться.",
    );
    const from = instant(v.effectiveFrom);
    date(v.endDate);
    check(
      v.endDate >= localDate(from, v.offsetMinutes),
      "Дата окончания раньше начала расписания.",
    );
    const plan = p.plan.find((entry) => entry.id === v.planId);
    check(
      plan?.kind === "medication" &&
        plan.status === "confirmed" &&
        !!plan.confirmedAt &&
        !!plan.confirmedBy,
      "Выберите подтверждённое лекарственное назначение.",
    );
    check(
      from >= instant(plan.confirmedAt),
      "Расписание не может начинаться раньше подтверждения назначения.",
    );
    if (plan.startDate)
      check(
        localDate(from, v.offsetMinutes) >= plan.startDate.slice(0, 10),
        "Расписание начинается раньше назначения.",
      );
    if (plan.endDate)
      check(
        v.endDate <= plan.endDate.slice(0, 10),
        "Расписание выходит за срок назначения.",
      );
    const latest = latestSchedules(state);
    const previous = latest.find((entry) => entry.id === v.id);
    check(
      (previous?.version ?? 0) === v.expectedVersion,
      "Расписание изменилось. Обновите данные.",
    );
    check(
      !previous || previous.planId === v.planId,
      "Версия расписания не может менять назначение.",
    );
    check(
      !previous || (from >= at && from > previous.effectiveFrom),
      "Новую версию можно начать только сейчас или в будущем.",
    );
    check(
      !latest.some(
        (entry) =>
          entry.id !== v.id &&
          entry.planId === v.planId &&
          (!entry.effectiveUntil || entry.effectiveUntil > from) &&
          entry.endDate >= localDate(from, entry.offsetMinutes),
      ),
      "Для назначения уже есть пересекающееся расписание.",
    );
    check(state.schedules.length < 1000, "Достигнут предел версий расписаний.");
    const next: AdherenceSchedule = {
      id: v.id,
      version: (previous?.version ?? 0) + 1,
      planId: v.planId,
      times: [...v.times].sort(),
      offsetMinutes: v.offsetMinutes,
      effectiveFrom: from,
      endDate: v.endDate,
      effectiveUntil: "",
      closedAt: "",
      closeReason: "",
      planSnapshot: structuredClone(plan),
      createdAt: at,
      createdBy: structuredClone(actor),
      reason: v.reason,
    };
    if (
      previous &&
      (!previous.effectiveUntil || previous.effectiveUntil > from)
    ) {
      previous.effectiveUntil = from;
      previous.closedAt = at;
      previous.closeReason = `Новая версия расписания: ${v.reason}`;
    }
    state.schedules.push(next);
  } else if (mutation.type === "adherence.record") {
    const v = mutation.value;
    only(v, [
      "scheduleId",
      "scheduleVersion",
      "plannedAt",
      "status",
      "reportedAt",
      "provenance",
      "reason",
      "expectedVersion",
    ]);
    text(v.scheduleId, true, 100);
    integer(v.scheduleVersion, 1, 10000);
    integer(v.expectedVersion, 0, 10000);
    text(v.reason);
    check(statuses.includes(v.status), "Проверьте статус приёма.");
    check(
      v.provenance === "patient" || v.provenance === "clinician",
      "Укажите происхождение отметки.",
    );
    const planned = instant(v.plannedAt);
    const reported = instant(v.reportedAt);
    check(
      planned <= at && reported <= at && reported >= planned,
      "Отметка не может относиться к будущему или предшествовать плановому приёму.",
    );
    const schedule = state.schedules.find(
      (entry) =>
        entry.id === v.scheduleId && entry.version === v.scheduleVersion,
    );
    check(
      schedule && isSlot(schedule, planned),
      "Слот не соответствует версии расписания.",
    );
    const id = slotId(schedule, planned);
    const previous = state.records.find((entry) => entry.id === id);
    check(
      (previous?.version ?? 0) === v.expectedVersion,
      "Отметка изменилась. Обновите данные.",
    );
    check(
      v.status !== "not-applicable" || !!v.reason.trim(),
      "Укажите причину неприменимости приёма.",
    );
    check(
      !previous || !!v.reason.trim(),
      "Укажите причину исправления отметки.",
    );
    check(
      state.records.length < 10000 || !!previous,
      "Достигнут предел отметок.",
    );
    const revision: AdherenceRecordRevision = {
      version: (previous?.version ?? 0) + 1,
      status: v.status,
      reportedAt: reported,
      provenance: v.provenance,
      reason: v.reason,
      at,
      by: structuredClone(actor),
    };
    if (previous) {
      previous.version = revision.version;
      previous.status = revision.status;
      previous.reportedAt = reported;
      previous.provenance = v.provenance;
      previous.reason = v.reason;
      previous.history.push(revision);
    } else
      state.records.push({
        id,
        scheduleId: schedule.id,
        scheduleVersion: schedule.version,
        plannedAt: planned,
        version: 1,
        status: v.status,
        reportedAt: reported,
        provenance: v.provenance,
        reason: v.reason,
        history: [revision],
      });
  } else throw new Error("Неизвестная команда приверженности.");
  p.adherence = state;
}

/** Close future applicability when the underlying confirmed medication context changes. */
export function reconcileAdherence(
  p: Subject,
  _actor: Actor,
  now: string,
): void {
  if (!p.adherence) return;
  const at = instant(now);
  for (const schedule of p.adherence.schedules) {
    if (schedule.effectiveUntil && schedule.effectiveUntil <= at) continue;
    const plan = p.plan.find((entry) => entry.id === schedule.planId);
    if (
      plan?.kind === "medication" &&
      plan.status === "confirmed" &&
      samePlan(plan, schedule.planSnapshot)
    )
      continue;
    schedule.effectiveUntil = at;
    schedule.closedAt = at;
    schedule.closeReason = !plan
      ? "Назначение недоступно"
      : plan.status !== "confirmed"
        ? "Назначение прекращено или завершено"
        : "Контекст назначения изменился; необходимо новое расписание";
  }
}

/** Due slots only. Unknown is an explicit denominator member, never a missed dose. */
export function adherenceSummary(
  p: Subject,
  fromDate: string,
  toDate: string,
  now: string,
): AdherenceSummary {
  date(fromDate);
  date(toDate);
  const at = instant(now);
  const first = Date.parse(`${fromDate}T00:00:00.000Z`);
  const last = Date.parse(`${toDate}T00:00:00.000Z`);
  check(
    first <= last && last - first <= 365 * DAY,
    "Выберите период не длиннее 366 дней с правильным порядком дат.",
  );
  const state = p.adherence;
  const slots: AdherenceSlot[] = [];
  for (const schedule of state?.schedules ?? []) {
    for (let day = first; day <= last; day += DAY) {
      const local = new Date(day).toISOString().slice(0, 10);
      for (const time of schedule.times) {
        const planned = plannedAt(local, time, schedule.offsetMinutes);
        if (planned > at || !isSlot(schedule, planned)) continue;
        const id = slotId(schedule, planned);
        const record = state!.records.find((entry) => entry.id === id);
        const status =
          record?.status === "not-applicable" && !record.reason.trim()
            ? "unknown"
            : (record?.status ?? "unknown");
        slots.push({
          id,
          scheduleId: schedule.id,
          scheduleVersion: schedule.version,
          planId: schedule.planId,
          plannedAt: planned,
          localDate: local,
          time,
          offsetMinutes: schedule.offsetMinutes,
          status,
          recordVersion: record?.version ?? 0,
          reason: record?.reason ?? "",
          planSnapshot: structuredClone(schedule.planSnapshot),
        });
      }
    }
  }
  slots.sort(
    (a, b) =>
      a.plannedAt.localeCompare(b.plannedAt) || a.id.localeCompare(b.id),
  );
  const taken = slots.filter((slot) => slot.status === "taken").length;
  const missed = slots.filter((slot) => slot.status === "missed").length;
  const unknown = slots.filter((slot) => slot.status === "unknown").length;
  const notApplicable = slots.filter(
    (slot) => slot.status === "not-applicable",
  ).length;
  const applicable = taken + missed + unknown;
  return {
    fromDate,
    toDate,
    slots,
    applicable,
    taken,
    missed,
    unknown,
    notApplicable,
    percentage: applicable ? (taken * 100) / applicable : null,
    coverage: applicable ? ((taken + missed) * 100) / applicable : null,
  };
}
