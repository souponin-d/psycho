import {
  addDays,
  dayNumber,
  type ClinicDataset,
  type ClinicFilter,
  type Observation,
  type Scale,
} from "./model";
import { DATA_START, DEMO_DAY } from "./fixtures";
export const defaultFilter = (): ClinicFilter => ({
  from: addDays(DEMO_DAY, -29),
  to: DEMO_DAY,
  departmentId: "all",
  doctorId: "all",
  group: "all",
});
export function validFilter(
  data: ClinicDataset,
  filter: ClinicFilter,
): ClinicFilter {
  const base = defaultFilter();
  const from =
    Number.isFinite(dayNumber(filter.from)) &&
    filter.from >= DATA_START &&
    filter.from <= DEMO_DAY
      ? filter.from
      : base.from;
  const to =
    Number.isFinite(dayNumber(filter.to)) &&
    filter.to >= from &&
    filter.to <= DEMO_DAY
      ? filter.to
      : DEMO_DAY;
  const departmentId =
    filter.departmentId === "all" ||
    data.departments.some((d) => d.id === filter.departmentId)
      ? filter.departmentId
      : "all";
  const doctorId =
    filter.doctorId === "all" ||
    data.doctors.some(
      (d) =>
        d.id === filter.doctorId &&
        (departmentId === "all" || d.departmentId === departmentId),
    )
      ? filter.doctorId
      : "all";
  return {
    from,
    to,
    departmentId,
    doctorId,
    group: ["all", ...new Set(data.patients.map((p) => p.group))].includes(
      filter.group,
    )
      ? filter.group
      : "all",
  };
}
export const previousPeriod = (filter: ClinicFilter) => ({
  ...filter,
  to: addDays(filter.from, -1),
  from: addDays(
    filter.from,
    -(dayNumber(filter.to) - dayNumber(filter.from) + 1),
  ),
});
const median = (items: number[]) => {
  const sorted = [...items].sort((a, b) => a - b);
  const n = sorted.length;
  return n
    ? n % 2
      ? sorted[Math.floor(n / 2)]!
      : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
    : null;
};
export function clinicalSummary(
  observations: Observation[],
  patientIds: string[],
  filter: ClinicFilter,
  scale: Scale = "PHQ-9",
) {
  const pairs: {
    patientId: string;
    baseline: number;
    followup: number;
    change: number;
  }[] = [];
  const latest: { patientId: string; value: number }[] = [];
  for (const id of patientIds) {
    const entries = observations
      .filter(
        (o) => o.patientId === id && o.scale === scale && o.day <= filter.to,
      )
      .sort((a, b) => a.day.localeCompare(b.day));
    const first = entries[0];
    const last = entries.filter((o) => o.day >= filter.from).at(-1);
    if (last) latest.push({ patientId: id, value: last.value });
    if (
      first &&
      last &&
      first.id !== last.id &&
      first.day < last.day &&
      first.version === last.version
    )
      pairs.push({
        patientId: id,
        baseline: first.value,
        followup: last.value,
        change: last.value - first.value,
      });
  }
  return {
    scale,
    pairs: pairs.length,
    excluded: patientIds.length - pairs.length,
    change: median(pairs.map((p) => p.change)),
    baseline: median(pairs.map((p) => p.baseline)),
    followup: median(pairs.map((p) => p.followup)),
    rows: pairs,
    latest,
  };
}
function sliceClinic(data: ClinicDataset, filter: ClinicFilter) {
  const doctors = data.doctors.filter(
    (d) =>
      (filter.departmentId === "all" ||
        d.departmentId === filter.departmentId) &&
      (filter.doctorId === "all" || d.id === filter.doctorId),
  );
  const doctorIds = new Set(doctors.map((d) => d.id));
  const patients = data.patients.filter(
    (p) =>
      doctorIds.has(p.doctorId) &&
      (filter.group === "all" || p.group === filter.group) &&
      p.enrolled <= filter.to &&
      (!p.closed || p.closed >= filter.from),
  );
  const ids = new Set(patients.map((p) => p.id));
  const inRange = (row: { patientId: string; day: string }) =>
    ids.has(row.patientId) && row.day >= filter.from && row.day <= filter.to;
  const expected = data.expectedForms.filter(inRange);
  const reports = data.reports.filter(inRange);
  const visits = data.visits.filter(inRange);
  const signals = data.signals.filter(inRange);
  const observations = data.observations.filter(inRange);
  const missingDays = data.outages.filter(
    (day) => day >= filter.from && day <= filter.to,
  );
  const eligible = expected.filter((row) => !missingDays.includes(row.day));
  const received = new Set(reports.map((r) => r.expectedId)).size;
  return {
    doctors,
    patients,
    expected,
    reports,
    visits,
    signals,
    observations,
    missingDays,
    summary: {
      patients: patients.filter((p) => !p.closed || p.closed > filter.to)
        .length,
      reports: reports.length,
      expected: eligible.length,
      expectedAll: expected.length,
      completion: eligible.length ? received / eligible.length : null,
      visits: visits.filter((v) => v.status === "done").length,
      openSignals: signals.filter((s) => s.status !== "closed").length,
      missingDays: missingDays.length,
    },
  };
}
export function analyseClinic(data: ClinicDataset, input: ClinicFilter) {
  const filter = validFilter(data, input);
  const selected = sliceClinic(data, filter);
  const prior = previousPeriod(filter);
  const priorSelection =
    prior.from < DATA_START ? null : sliceClinic(data, prior);
  const previous = priorSelection?.summary ?? null;
  const daily = Array.from(
    { length: dayNumber(filter.to) - dayNumber(filter.from) + 1 },
    (_, index) => {
      const day = addDays(filter.from, index);
      const prevDay = addDays(prior.from, index);
      return {
        day,
        reports: selected.reports.filter((r) => r.day === day).length,
        visits: selected.visits.filter(
          (v) => v.day === day && v.status === "done",
        ).length,
        available: !selected.missingDays.includes(day),
        previous:
          priorSelection && !data.outages.includes(prevDay)
            ? priorSelection.reports.filter((r) => r.day === prevDay).length
            : null,
      };
    },
  );
  const byDoctor = selected.doctors.map((doctor) => {
    const ids = new Set(
      selected.patients
        .filter((p) => p.doctorId === doctor.id)
        .map((p) => p.id),
    );
    return {
      doctorId: doctor.id,
      name: doctor.name,
      patients: ids.size,
      reports: selected.reports.filter((r) => ids.has(r.patientId)).length,
      visits: selected.visits.filter(
        (v) => ids.has(v.patientId) && v.status === "done",
      ).length,
      capacity: doctor.capacity,
    };
  });
  return {
    filter,
    selected,
    summary: selected.summary,
    previous,
    daily,
    byDoctor,
    clinical: clinicalSummary(
      data.observations,
      selected.patients.map((p) => p.id),
      filter,
    ),
  };
}
export type ClinicAnalysis = ReturnType<typeof analyseClinic>;
export function csvReport(
  data: ClinicDataset,
  filter: ClinicFilter,
  result: ClinicAnalysis,
) {
  const department =
    data.departments.find((d) => d.id === filter.departmentId)?.name ??
    "Все отделения";
  const doctor =
    data.doctors.find((d) => d.id === filter.doctorId)?.name ?? "Все врачи";
  const rows: (string | number)[][] = [
    ["Синтетические данные. Не клинический отчёт"],
    ["Период", filter.from, filter.to],
    ["Отделение", department],
    ["Врач", doctor],
    ["Группа", filter.group],
    ["Показатель", "Значение", "Определение"],
    [
      "На сопровождении",
      result.summary.patients,
      "Уникальные активные пациенты на конец периода",
    ],
    [
      "Известные самоотчёты",
      result.summary.reports,
      "Полученные события текущей выборки; пропуски не равны нулю",
    ],
    [
      "Ожидаемые формы в доступные дни",
      result.summary.expected,
      "Знаменатель выполнения форм",
    ],
    [
      "Выполнение форм",
      result.summary.completion === null
        ? "Нет данных"
        : `${(result.summary.completion * 100).toFixed(1)}%`,
      "Полученные уникальные формы / ожидаемые в доступные дни",
    ],
    ["Завершённые приёмы", result.summary.visits, "Отмены и неявки исключены"],
    [
      "Дни без сводки",
      result.summary.missingDays,
      "Исключены из знаменателя выполнения форм",
    ],
    [
      "Пары PHQ-9",
      result.clinical.pairs,
      "Исходное и последнее измерение одной версии; последнее в периоде",
    ],
    [
      "Медиана изменения",
      result.clinical.change ?? "Нет данных",
      "Описательная статистика; не эффективность лечения",
    ],
    [
      "Кабинет",
      "Пациенты в выборке",
      "Известные самоотчёты",
      "Завершённые приёмы",
    ],
    ...result.byDoctor.map((d) => [d.name, d.patients, d.reports, d.visits]),
  ];
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
          .join(";"),
      )
      .join("\r\n")
  );
}
