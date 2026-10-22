import { addDays, type ClinicDataset, type Group } from "./model";
export const DEMO_DAY = "2026-10-20";
export const DATA_START = addDays(DEMO_DAY, -179);
export const DEMO_PATIENT = "demo-patient-001";
export const groups: Group[] = [
  "Тревожная симптоматика",
  "Депрессивная симптоматика",
  "Смешанная симптоматика",
];

/** Deterministic synthetic observations; no random IDs, clinical rules or patient data. */
export function createClinicDataset(
  scenario: ClinicDataset["scenario"],
): ClinicDataset {
  const data: ClinicDataset = {
    scenario,
    departments: [],
    doctors: [],
    patients: [],
    expectedForms: [],
    reports: [],
    visits: [],
    observations: [],
    signals: [],
    outages: [],
  };
  if (scenario === "empty") return data;
  data.departments = [
    "Амбулаторное сопровождение",
    "Консультативное отделение",
    "Дистанционное наблюдение",
  ].map((name, i) => ({
    id: `demo-dept-${i + 1}`,
    name:
      scenario === "long" && i === 0
        ? "Отделение «Амбулаторное сопровождение», комплексная программа с расширенным названием"
        : name,
  }));
  data.doctors = Array.from({ length: 12 }, (_, i) => ({
    id: `demo-doctor-${String(i + 1).padStart(2, "0")}`,
    name:
      scenario === "long" && i === 0
        ? "Врач Д-01 · кабинет длительного междисциплинарного сопровождения"
        : `Врач Д-${String(i + 1).padStart(2, "0")}`,
    departmentId: data.departments[Math.floor(i / 4)]!.id,
    capacity: 32 + (i % 3) * 4,
  }));
  data.outages = ["2026-09-24", "2026-10-08"];
  for (let i = 0; i < 200; i++) {
    const id = `demo-patient-${String(i + 1).padStart(3, "0")}`;
    const weights = [8, 28, 24, 22, 21, 19, 18, 16, 14, 12, 10, 8];
    let doctorIndex = 0,
      total = weights[0]!;
    while (i >= total) {
      doctorIndex++;
      total += weights[doctorIndex]!;
    }
    const enrolled = addDays(DATA_START, i % 35);
    const closed =
      i > 0 && i % 13 === 0 ? addDays(DEMO_DAY, -(i % 25) - 1) : null;
    data.patients.push({
      id,
      name:
        scenario === "long" && i === 0
          ? "Пациент П-001 с намеренно длинным обозначением учебной записи"
          : `Пациент П-${String(i + 1).padStart(3, "0")}`,
      doctorId: data.doctors[doctorIndex]!.id,
      group: groups[(i * 17) % 10 < 4 ? 0 : (i * 17) % 10 < 8 ? 1 : 2]!,
      ageBand: ["18–29", "30–44", "45–59", "60+"][
        (i * 37) % 100 < 22
          ? 0
          : (i * 37) % 100 < 61
            ? 1
            : (i * 37) % 100 < 89
              ? 2
              : 3
      ]!,
      enrolled,
      closed,
    });
    for (let d = i % 35; d < 180; d++) {
      const day = addDays(DATA_START, d);
      if (closed && day > closed) continue;
      if ((d + i) % 7 !== 0 && !(i === 0 && day === DEMO_DAY)) continue;
      const expectedId = `form-${id}-${day}`;
      data.expectedForms.push({ id: expectedId, patientId: id, day });
      if (
        (i * 17 + d * 3) % 10 < 8 &&
        !data.outages.includes(day) &&
        !(i === 0 && day === DEMO_DAY)
      )
        data.reports.push({
          id: `report-${expectedId}`,
          patientId: id,
          expectedId,
          day,
          mood: ["Спокойно", "Неустойчиво", "Обычно"][i % 3]!,
          note: "Синтетический самоотчёт для показа аналитики.",
        });
    }
    for (let step = 0; step < 5; step++) {
      const day = addDays(enrolled, step * 35);
      if (day > DEMO_DAY || (closed && day > closed)) continue;
      data.visits.push({
        id: `visit-${id}-${step}`,
        patientId: id,
        day,
        time: `${String(9 + (i % 8)).padStart(2, "0")}:00`,
        status:
          (i + step) % 17 === 0
            ? "cancelled"
            : (i + step) % 19 === 0
              ? "missed"
              : "done",
        kind: step === 0 ? "Первичный" : "Повторный",
      });
    }
    for (const scale of ["PHQ-9", "GAD-7"] as const) {
      const base = scale === "PHQ-9" ? 13 + (i % 10) : 9 + (i % 9);
      for (let step = 0; step < 4; step++) {
        const day = addDays(enrolled, step * 42);
        if (
          day > DEMO_DAY ||
          (closed && day > closed) ||
          (step > 0 && i % 5 === 0)
        )
          continue;
        const delta = i % 7 === 0 ? step : i % 4 === 0 ? 0 : -step * 2;
        data.observations.push({
          id: `obs-${id}-${scale}-${step}`,
          patientId: id,
          day,
          scale,
          version: "synthetic-external-2026-10",
          value: Math.max(
            0,
            Math.min(scale === "PHQ-9" ? 27 : 21, base + delta),
          ),
        });
      }
    }
    if (i % 9 === 0 && i > 0) {
      const proposedDay = addDays(DEMO_DAY, -i % 22);
      const day = closed && proposedDay > closed ? closed : proposedDay;
      const status =
        (i / 9) % 3 === 0 ? "closed" : (i / 9) % 3 === 1 ? "open" : "accepted";
      const createdAt = `${day}T08:00:00Z`;
      const acceptedAt = new Date(
        Date.parse(createdAt) + (15 + (i % 8) * 7) * 60000,
      ).toISOString();
      const closedAt = new Date(
        Date.parse(acceptedAt) + (25 + (i % 6) * 10) * 60000,
      ).toISOString();
      data.signals.push({
        id: `signal-${id}`,
        patientId: id,
        day,
        title: i % 2 ? "Вопрос о следующей встрече" : "Запрос связи с командой",
        status,
        createdAt,
        acceptedAt: status !== "open" ? acceptedAt : null,
        closedAt: status === "closed" ? closedAt : null,
      });
    }
  }
  // Prepared future appointments make the coordinator's roster useful while
  // leaving two explicit gaps, including D-03 for the scheduling scenario.
  data.doctors.forEach((doctor, index) => {
    if (index === 0 || index === 2) return;
    const patient = data.patients.find(
      (p) => p.doctorId === doctor.id && !p.closed,
    )!;
    data.visits.push({
      id: `visit-upcoming-${doctor.id}`,
      patientId: patient.id,
      day: addDays(DEMO_DAY, 1 + (index % 8)),
      time: `${String(9 + (index % 8)).padStart(2, "0")}:30`,
      status: "scheduled",
      kind: "Повторный",
    });
  });
  return data;
}
