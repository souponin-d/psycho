import { shiftDay, closeElapsedDays } from "./calendar.ts";
import { PatientValidationError } from "./patientErrors.ts";
import type {
  DayKey,
  JourneyState,
  PatientEvent,
  ReportFields,
} from "./journeyModel.ts";

export function connectScenario(
  code: string,
  existing: JourneyState,
): JourneyState {
  if (code.trim().toUpperCase() !== "SYNCLI-START")
    throw new PatientValidationError(
      "Проверьте код или войдите в демо-режиме.",
    );
  return existing.connected ? existing : { ...existing, connected: true };
}

export function seedScenario(seedDay: DayKey): JourneyState {
  const start = shiftDay(seedDay, -8);
  const state: JourneyState = {
    version: 2,
    scenarioId: "syncli-aviandr-v2",
    seedDay,
    connected: true,
    goal: "Следовать плану терапии",
    lastObservedDay: seedDay,
    plan: {
      id: "aviandr-educational-v1",
      startedAt: start,
      doctor: "Елена Андреевна · учебный врач",
      medication: {
        name: "Авиандр",
        dosageLabel: "Дозировка задана в учебном плане",
        slots: [{ id: "morning", time: "09:00", label: "Утренний приём" }],
      },
      reportFields: [
        "feeling",
        "sleep",
        "anxiety",
        "functioning",
        "tolerability",
      ],
      tests: [
        { id: "gad-start", day: start, formId: "gad7", questionCount: 7 },
        { id: "phq-control", day: seedDay, formId: "phq9", questionCount: 9 },
        {
          id: "gad-control",
          day: shiftDay(start, 14),
          formId: "gad7",
          questionCount: 7,
        },
      ],
      visit: {
        day: shiftDay(seedDay, 4),
        time: "14:30",
        specialist: "Елена Андреевна",
        place: "Учебная консультация · онлайн",
      },
    },
    events: [],
    closedDays: {},
    rewards: [],
    drafts: {},
    legacyArchive: [],
    world: {
      territory: "shore",
      placements: [
        {
          instanceId: "starter-bench",
          itemId: "bench",
          x: 0.72,
          y: 0.6,
          rotation: 0,
          scale: 1,
        },
        {
          instanceId: "starter-flowers",
          itemId: "flowers",
          x: 0.25,
          y: 0.66,
          rotation: 0,
          scale: 1,
        },
        {
          instanceId: "starter-lantern",
          itemId: "lantern",
          x: 0.82,
          y: 0.78,
          rotation: 0,
          scale: 1,
        },
      ],
      outfits: {
        fluffy: { color: "sage", clothing: "scarf", accessory: "leaf" },
        cloud: { color: "lavender", clothing: "scarf", accessory: "none" },
      },
    },
  };
  const notes = [
    "Начинаю свой путь",
    "Небольшая прогулка после обеда",
    "Было трудно сохранить ритм",
    "Сегодня меньше сил",
    "Записала вопрос к следующему приёму",
    "Хочу обсудить переносимость",
    "Вернусь к записи позже",
    "Спокойный вечер",
  ];
  const energy = [3, 4, 2, 2, 3, 4, 2, 4];
  for (let i = 0; i < 8; i++) {
    const day = shiftDay(start, i),
      at = Date.parse(day + "T10:00:00Z");
    const fields: ReportFields = {
      feeling: { valence: [3, 4, 2, 3, 4, 3, 2, 4][i], energy: energy[i] },
      sleep: i === 2 ? "Плохо" : i % 2 ? "Хорошо" : "Обычно",
      anxiety: [5, 4, 7, 5, 4, 5, 6, 3][i],
      functioning: [4, 5, 3, 4, 5, 4, 3, 6][i],
      tolerability: i === 5 ? "Есть трудности" : "Без трудностей",
    };
    const event: PatientEvent = {
      id: "seed-dose-" + day,
      kind: "dose",
      day,
      recordedDay: day,
      at,
      slotId: "morning",
      status: i === 2 ? "missed" : "taken",
      occurredAt: "09:00",
      note: i === 2 ? "Забыла утром" : "",
    };
    state.events.push(event);
    if (i !== 6)
      state.events.push({
        id: "seed-report-" + day,
        entityId: "report:" + day,
        kind: "report",
        day,
        recordedDay: day,
        at: at + 1000,
        fields,
        note: notes[i],
        required: true,
      });
    else
      state.drafts["report:" + day] = {
        id: "report:" + day,
        kind: "report",
        day,
        fields: { feeling: fields.feeling },
        note: notes[i],
      };
    if (i === 5)
      state.events.push({
        id: "seed-contact",
        kind: "contact",
        day,
        recordedDay: day,
        at: at + 2000,
        onset: day,
        severity: "Заметная",
        description: "Хочу обсудить переносимость на ближайшем приёме",
        preference: "planned",
      });
  }
  state.events.push({
    id: "seed-gad",
    kind: "questionnaire",
    day: start,
    recordedDay: start,
    at: Date.parse(start + "T11:00:00Z"),
    assignmentId: "gad-start",
    formId: "gad7",
    answers: [1, 1, 2, 1, 1, 1, 0],
  });
  return closeElapsedDays(state, {
    utcMs: Date.parse(seedDay + "T12:00:00Z"),
    offsetMinutes: 0,
    zone: "UTC",
  });
}
