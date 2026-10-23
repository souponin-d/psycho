import { analyseClinic } from "./aggregate";
import type { ClinicDataset, ClinicFilter } from "./model";

export const exportSections = [
  { id: "summary", title: "Обзор клиники" },
  { id: "team", title: "Команда и отделения" },
  { id: "daily", title: "Динамика по дням" },
  { id: "medical", title: "Наблюдения" },
] as const;
export type ExportSection = (typeof exportSections)[number]["id"];
export type ExportCell = string | number | null;
export type ExportTable = {
  id: ExportSection | "method";
  title: string;
  columns: string[];
  rows: ExportCell[][];
};
export function createExportSnapshot(
  data: ClinicDataset,
  filter: ClinicFilter,
  sections: ExportSection[],
  createdAt = new Date().toISOString(),
) {
  const selected = exportSections.filter((s) => sections.includes(s.id));
  if (!selected.length) throw new Error("Выберите хотя бы один раздел.");
  const result = analyseClinic(data, filter);
  const department =
    data.departments.find((d) => d.id === result.filter.departmentId)?.name ??
    "Все отделения";
  const doctor =
    data.doctors.find((d) => d.id === result.filter.doctorId)?.name ??
    "Все врачи";
  const tables: ExportTable[] = [];
  if (sections.includes("summary"))
    tables.push({
      id: "summary",
      title: "Обзор клиники",
      columns: ["Показатель", "Значение"],
      rows: [
        ["На сопровождении", result.summary.patients],
        ["Пациенты в выборке", result.selected.patients.length],
        ["Известные самоотчёты", result.summary.reports],
        ["Завершённые приёмы", result.summary.visits],
        ["Ожидаемые формы в доступные дни", result.summary.expected],
        ["Получено ожидаемых форм, доля", result.summary.completion],
        ["Дни без сводки", result.summary.missingDays],
      ],
    });
  if (sections.includes("team"))
    tables.push({
      id: "team",
      title: "Команда и отделения",
      columns: [
        "Врач",
        "Пациенты в выборке",
        "Самоотчёты",
        "Завершённые приёмы",
        "Отделение",
      ],
      rows: result.byDoctor.map((d) => [
        d.name,
        d.patients,
        d.reports,
        d.visits,
        data.departments.find(
          (dept) =>
            dept.id ===
            data.doctors.find((doctor) => doctor.id === d.doctorId)
              ?.departmentId,
        )?.name ?? "",
      ]),
    });
  if (sections.includes("daily"))
    tables.push({
      id: "daily",
      title: "Динамика по дням",
      columns: ["Дата", "Самоотчёты", "Сопоставимый день ранее", "Сводка"],
      rows: result.daily.map((d) => [
        d.day,
        d.available ? d.reports : null,
        d.previous,
        d.available ? "Доступна" : "Нет сводки",
      ]),
    });
  if (sections.includes("medical"))
    tables.push({
      id: "medical",
      title: "Наблюдения",
      columns: ["Показатель PHQ-9", "Значение"],
      rows: [
        ["Сопоставимые пары", result.clinical.pairs],
        ["Без сопоставимой пары", result.clinical.excluded],
        ["Медиана исходного измерения", result.clinical.baseline],
        ["Медиана повторного измерения", result.clinical.followup],
        ["Медиана индивидуального изменения", result.clinical.change],
      ],
    });
  tables.push({
    id: "method",
    title: "Методика и фильтры",
    columns: ["Параметр", "Значение"],
    rows: [
      ["Сформирован", createdAt],
      ["Начало периода", result.filter.from],
      ["Конец периода", result.filter.to],
      ["Отделение", department],
      ["Врач", doctor],
      [
        "Группа",
        result.filter.group === "all" ? "Все группы" : result.filter.group,
      ],
      ["Состав", selected.map((s) => s.title).join(", ")],
      ["Источник", "Синтетический набор клиники и события текущего сеанса"],
      [
        "Активные пациенты",
        "Уникальные записи на сопровождении на конец периода",
      ],
      [
        "Выполнение форм",
        "Уникальные полученные формы / ожидаемые в доступные дни",
      ],
      [
        "Пропуски",
        "Пустая ячейка означает отсутствие сводки; ноль — известное значение",
      ],
      ["Приёмы", "Только завершённые; отмены и неявки исключены"],
      [
        "Парная статистика",
        "Один инструмент и версия; исходное первое, повторное последнее в периоде, позже исходного",
      ],
      ["Версия наблюдений", "synthetic-external-2026-10"],
      [
        "Ограничение",
        "Самоотчёты и баллы внешней оценки не доказывают эффективность терапии",
      ],
    ],
  });
  return structuredClone({
    createdAt,
    filter: result.filter,
    department,
    doctor,
    group: result.filter.group === "all" ? "Все группы" : result.filter.group,
    summary: result.summary,
    empty: result.selected.patients.length === 0,
    tables,
    daily: result.daily,
  });
}
export type ExportSnapshot = ReturnType<typeof createExportSnapshot>;
export function tableCsv(table: ExportTable) {
  const text = (value: ExportCell) => {
    const raw = value === null ? "" : String(value);
    const safe =
      typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(raw)
        ? "'" + raw
        : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [table.columns, ...table.rows]
      .map((row) => row.map(text).join(";"))
      .join("\r\n")
  );
}
