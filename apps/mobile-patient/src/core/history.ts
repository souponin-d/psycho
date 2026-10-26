import { planForDay } from "./therapy.ts";
import { shiftDay } from "./calendar.ts";
import { latestDose, latestReports } from "./questionnaires.ts";
import { validFeeling } from "./feelings.ts";
import { isDay } from "./shore.ts";
import { PatientValidationError } from "./patientErrors.ts";
import type {
  DayKey,
  JourneyState,
  ReportFields,
  PatientEvent,
  ContactEvent,
} from "./journeyModel.ts";

export const doseLabels = {
  taken: "Принят",
  missed: "Пропущен",
  unknown: "Нет отметки",
};
export function safeReportFields(fields: ReportFields): ReportFields {
  return {
    ...(validFeeling(fields.feeling)
      ? {
          feeling: {
            valence: fields.feeling!.valence,
            energy: fields.feeling!.energy,
          },
        }
      : {}),
    ...(typeof fields.sleep === "string" ? { sleep: fields.sleep } : {}),
    ...(typeof fields.anxiety === "number" ? { anxiety: fields.anxiety } : {}),
    ...(typeof fields.functioning === "number"
      ? { functioning: fields.functioning }
      : {}),
    ...(typeof fields.tolerability === "string"
      ? { tolerability: fields.tolerability }
      : {}),
  };
}
export function historyBounds(state: JourneyState) {
  return [
    state.plan.startedAt,
    ...state.legacyArchive.map((r) => r.day),
    ...state.events.map((e) => e.day),
  ]
    .filter(isDay)
    .sort()[0];
}
export function projectHistory(
  state: JourneyState,
  range: { from: DayKey; to: DayKey },
  options: { gameplay?: boolean } = {},
) {
  if (!isDay(range.from) || !isDay(range.to) || range.from > range.to)
    throw new PatientValidationError("Проверьте период истории");
  const revisedLegacy = new Set(
    state.events
      .filter((e) => e.kind === "report" && e.entityId?.startsWith("legacy:"))
      .map((e) => e.entityId!.slice(7)),
  );
  const days = [];
  for (let day = range.from; day <= range.to; day = shiftDay(day, 1)) {
    const plan = planForDay(state, day);
    const reports = latestReports(state, day).map((r) => ({
      id: r.entityId ?? r.id,
      required: r.required,
      fields: safeReportFields(r.fields),
      note: r.note,
      label: r.label ?? "",
      at: r.at,
      edited:
        (r.gameEligible === false && r.source !== "server") ||
        r.recordedDay !== r.day ||
        state.events.filter(
          (e) =>
            e.kind === "report" &&
            (e.entityId ?? e.id) === (r.entityId ?? r.id),
        ).length > 1,
    }));
    const doses =
      day < state.plan.startedAt
        ? []
        : plan.medication.slots.map((slot) => {
            const dose = latestDose(state, day, slot.id);
            return {
              slotId: slot.id,
              label: slot.label,
              time: slot.time,
              status: dose?.status ?? "unknown",
              occurredAt:
                dose?.status === "taken" ? (dose.occurredAt ?? "") : "",
              note: dose?.note ?? "",
            };
          });
    const legacy = state.legacyArchive
      .filter((r) => r.day === day && !revisedLegacy.has(r.id))
      .map((r) => ({
        id: r.id,
        time: r.time,
        mood: r.mood,
        sleep: r.sleep,
        note: r.note,
        label: r.label ?? "",
        ...(validFeeling(r.feeling)
          ? {
              feeling: {
                valence: r.feeling!.valence,
                energy: r.feeling!.energy,
              },
            }
          : {}),
      }));
    const tests = plan.tests
      .filter((t) => t.day === day)
      .map((t) => ({
        id: t.id,
        name: t.formId === "gad7" ? "ГТР-7" : "PHQ-9",
        status: state.events.some(
          (e) => e.kind === "questionnaire" && e.assignmentId === t.id,
        )
          ? "Завершён"
          : "Не завершён",
      }));
    const contacts = state.events
      .filter((e): e is ContactEvent => e.kind === "contact" && e.day === day)
      .map((e) => ({
        id: e.id,
        description: e.description,
        severity: e.severity,
        preference:
          e.preference === "earlier"
            ? "Хочу связаться раньше"
            : "Дождусь планового приёма",
        onset: e.onset,
      }));
    const changes: {
      id: string;
      at: number;
      author: string;
      type: string;
      previous: string;
      current: string;
      late: boolean;
    }[] = [];
    const previous = new Map<string, PatientEvent>();
    for (const e of state.events
      .filter((e) => e.day === day && ["dose", "report"].includes(e.kind))
      .sort((a, b) => a.at - b.at)) {
      const key = e.kind === "dose" ? "dose:" + e.slotId : (e.entityId ?? e.id);
      const old = previous.get(key);
      const archived =
        e.kind === "report" && e.entityId?.startsWith("legacy:")
          ? state.legacyArchive.find((r) => r.id === e.entityId!.slice(7))
          : undefined;
      if (
        old ||
        archived ||
        e.recordedDay !== day ||
        e.gameEligible === false
      ) {
        changes.push({
          id: e.id,
          at: e.at,
          author: "Пациент на устройстве",
          type: e.kind === "dose" ? "Приём" : "Самочувствие",
          previous: old
            ? describeHistoryEvent(old)
            : archived
              ? archived.note || archived.label || "Архивная запись"
              : describeHistoryEvent(old),
          current: describeHistoryEvent(e),
          late: e.recordedDay !== day || e.gameEligible === false,
        });
      }
      previous.set(key, e);
    }
    const latestFeeling =
      reports.find((r) => r.fields.feeling)?.fields.feeling ??
      [...legacy]
        .sort((a, b) => b.time.localeCompare(a.time))
        .find((r) => r.feeling)?.feeling;
    days.push({
      day,
      doses,
      reports,
      legacy,
      tests,
      contacts,
      changes: changes.reverse(),
      valence: latestFeeling?.valence ?? null,
      energy: latestFeeling?.energy ?? null,
      sleep:
        reports.find((r) => r.fields.sleep)?.fields.sleep ??
        legacy.at(-1)?.sleep ??
        null,
      gameOutcome: state.closedDays[day]
        ? state.closedDays[day].complete
          ? ("complete" as const)
          : ("missed" as const)
        : ("open" as const),
    });
  }
  const doses = days.flatMap((d) => d.doses);
  return {
    version: 1,
    gameplay: options.gameplay !== false,
    range: { from: range.from, to: range.to },
    medication: state.plan.medication.name,
    planId: state.plan.id,
    planChanges: (state.planVersions ?? [state.plan])
      .filter(
        (p) =>
          (p.effectiveFrom ?? p.startedAt) >= range.from &&
          (p.effectiveFrom ?? p.startedAt) <= range.to,
      )
      .map((p) => ({
        id: p.id,
        from: p.effectiveFrom ?? p.startedAt,
        reportFields: [...p.reportFields],
      })),
    days,
    summary: {
      assigned: doses.length,
      taken: doses.filter((d) => d.status === "taken").length,
      missed: doses.filter((d) => d.status === "missed").length,
      unknown: doses.filter((d) => d.status === "unknown").length,
      reportDays: days.filter(
        (d) => d.reports.length > 0 || d.legacy.length > 0,
      ).length,
      difficultyDays: days.filter(
        (d) =>
          d.reports.some((r) => r.fields.tolerability === "Есть трудности") ||
          d.contacts.length > 0,
      ).length,
      testCompletions: days
        .flatMap((d) => d.tests)
        .filter((t) => t.status === "Завершён").length,
      completedGameDays: days.filter((d) => d.gameOutcome === "complete")
        .length,
    },
  };
}
export type PatientHistoryProjection = ReturnType<typeof projectHistory>;
export function historyDayPresentation(
  day: PatientHistoryProjection["days"][number],
  gameplay: boolean,
) {
  if (!gameplay)
    return {
      mark:
        day.reports.length ||
        day.legacy.length ||
        day.doses.some((d) => d.status !== "unknown")
          ? "•"
          : "",
      label: "Записи этого дня",
      lateNote: "Запись исправлена после завершения дня.",
    };
  return {
    mark:
      day.gameOutcome === "complete"
        ? "✓"
        : day.gameOutcome === "missed"
          ? "·"
          : "○",
    label:
      day.gameOutcome === "complete"
        ? "День выполнен"
        : day.gameOutcome === "missed"
          ? "День не зачтён. Мир и награды сохранены."
          : "День открыт до 00:00",
    lateNote:
      "Запись исправлена после завершения дня. Серия не пересчитывается.",
  };
}
export function exportPatientHistory(projection: PatientHistoryProjection) {
  // Reconstruct from the public schema; never serialize JourneyState or raw events.
  return {
    application: "Синкли",
    kind: "Личная история",
    schemaVersion: 1,
    version: projection.version,
    range: { from: projection.range.from, to: projection.range.to },
    medication: projection.medication,
    planId: projection.planId,
    planChanges: projection.planChanges,
    days: projection.days.map((day) => ({
      ...day,
      gameOutcome: projection.gameplay ? day.gameOutcome : undefined,
    })),
    summary: {
      ...projection.summary,
      completedGameDays: projection.gameplay
        ? projection.summary.completedGameDays
        : undefined,
    },
  };
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (s) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        s
      ]!,
  );
}
export function historyHtml(data: PatientHistoryProjection) {
  const e = escapeHtml;
  const moods: Record<string, string> = {
    low: "Тяжело",
    uneasy: "Тревожно",
    neutral: "Обычно",
    calm: "Спокойно",
    good: "Хорошо",
  };
  const lines = data.days
    .map((day) => {
      const doses = day.doses
        .map(
          (d) =>
            "<p>" +
            e(d.label) +
            ": " +
            e(doseLabels[d.status]) +
            (d.occurredAt ? " · " + e(d.occurredAt) : "") +
            (d.note ? " · " + e(d.note) : "") +
            "</p>",
        )
        .join("");
      const reports = day.reports
        .map((r) => {
          const f = r.fields;
          const details = [
            f.feeling
              ? "приятность " +
                f.feeling.valence +
                "/6 · энергия " +
                f.feeling.energy +
                "/6"
              : "",
            f.sleep ? "сон: " + f.sleep : "",
            f.anxiety !== undefined ? "напряжение: " + f.anxiety + "/10" : "",
            f.functioning !== undefined
              ? "повседневные дела: " + f.functioning + "/10"
              : "",
            f.tolerability ? "переносимость: " + f.tolerability : "",
          ]
            .filter(Boolean)
            .map(e)
            .join(" · ");
          return (
            "<p><b>" +
            e(r.label || "Самочувствие") +
            "</b>" +
            (details ? " · " + details : "") +
            '</p><p class="note">' +
            e(r.note) +
            "</p>"
          );
        })
        .join("");
      const legacy = day.legacy
        .map(
          (r) =>
            "<p>Архив · " +
            e(r.time) +
            " · " +
            e(r.label || moods[r.mood] || "Состояние не зафиксировано") +
            " · " +
            e(r.sleep) +
            '</p><p class="note">' +
            e(r.note) +
            "</p>",
        )
        .join("");
      const tests = day.tests
        .map((t) => "<p>Опрос " + e(t.name) + ": " + e(t.status) + "</p>")
        .join("");
      const contacts = day.contacts
        .map(
          (c) =>
            "<p>Обращение: " +
            e(c.preference) +
            " · " +
            e(c.severity) +
            '</p><p class="note">' +
            e(c.description) +
            "</p>",
        )
        .join("");
      const changes = day.changes
        .map(
          (c) =>
            '<p class="muted">Исправление · ' +
            e(new Date(c.at).toISOString()) +
            " · " +
            e(c.type) +
            ": " +
            e(c.previous) +
            " → " +
            e(c.current) +
            "</p>",
        )
        .join("");
      return (
        "<section><h2>" +
        e(day.day) +
        "</h2>" +
        doses +
        reports +
        legacy +
        tests +
        contacts +
        changes +
        "</section>"
      );
    })
    .join("");
  return (
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>body{font-family:sans-serif;color:#17372c;padding:24px;font-size:12px;line-height:1.5}h1{font-size:28px}h2{font-size:17px}section{border-top:1px solid #dce2d3;padding:12px 0}.note{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#586c5d}h2{break-after:avoid}</style></head><body><h1>Синкли · личная история</h1><p>' +
    e(data.range.from) +
    " — " +
    e(data.range.to) +
    "</p><p>План: " +
    e(data.medication) +
    "</p><p>Отмечено принятых доз: " +
    data.summary.taken +
    " из " +
    data.summary.assigned +
    "; пропущено: " +
    data.summary.missed +
    "; без отметки: " +
    data.summary.unknown +
    ". Дней с записями: " +
    data.summary.reportDays +
    '.</p><p class="muted">Ответы и результаты опросов не включены. Сведения записаны пациентом на устройстве; это не заключение о лечении.' +
    (data.gameplay
      ? " Закрытые игровые итоги не меняются после исправлений."
      : "") +
    "</p>" +
    data.planChanges
      .map(
        (p) =>
          "<p>План с " +
          e(p.from) +
          ": обязательных разделов самоотчёта — " +
          p.reportFields.length +
          ".</p>",
      )
      .join("") +
    lines +
    "</body></html>"
  );
}

export function describeHistoryEvent(event: PatientEvent | undefined): string {
  if (event?.kind === "dose")
    return (
      doseLabels[event.status] +
      (event.status === "taken" && event.occurredAt
        ? ` · ${event.occurredAt}`
        : "")
    );
  if (event?.kind !== "report") return "Нет записи";
  if (event.deleted) return "Запись удалена";
  const f = event.fields,
    parts: string[] = [];
  if (f.feeling)
    parts.push(
      `Ощущение ${f.feeling.valence}/6, энергия ${f.feeling.energy}/6`,
    );
  if (f.sleep !== undefined) parts.push(`Сон: ${f.sleep}`);
  if (f.anxiety !== undefined) parts.push(`Тревога: ${f.anxiety}`);
  if (f.functioning !== undefined)
    parts.push(`Повседневные дела: ${f.functioning}`);
  if (f.tolerability) parts.push(`Переносимость: ${f.tolerability}`);
  if (event.note) parts.push(event.note);
  if (event.label) parts.push(event.label);
  return parts.join(" · ") || "Запись самочувствия";
}
