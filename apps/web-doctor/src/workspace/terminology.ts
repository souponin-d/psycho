/**
 * Учебный срез для демонстрации интерфейса. Он не является полной выгрузкой
 * НСИ и подлежит замене верифицированным импортом указанного в спецификации
 * паспорта справочника.
 */
export const ICD10_SOURCE = {
  system: "ICD-10-RU",
  sourceOid: "1.2.643.5.1.13.13.11.1005",
  sourceVersion: "educational-subset-2026-10-25",
} as const;

export interface TerminologySelection {
  system: (typeof ICD10_SOURCE)["system"];
  sourceOid: string;
  sourceVersion: string;
  code: string;
  title: string;
}

export interface Icd10Entry extends TerminologySelection {
  parentCode?: string;
}

const entries: ReadonlyArray<readonly [string, string]> = [
  ["F20", "Шизофрения"],
  ["F30", "Маниакальный эпизод"],
  ["F31", "Биполярное аффективное расстройство"],
  ["F32.0", "Депрессивный эпизод лёгкой степени"],
  ["F32.1", "Депрессивный эпизод средней степени"],
  ["F32.2", "Депрессивный эпизод тяжёлой степени без психотических симптомов"],
  ["F33", "Рекуррентное депрессивное расстройство"],
  ["F41.0", "Паническое расстройство"],
  ["F41.1", "Генерализованное тревожное расстройство"],
  ["F43.1", "Посттравматическое стрессовое расстройство"],
  ["F60", "Специфические расстройства личности"],
  ["D50", "Железодефицитная анемия"],
  ["E03", "Другие формы гипотиреоза"],
  ["E11", "Сахарный диабет 2 типа"],
  ["G40", "Эпилепсия"],
  ["G47", "Расстройства сна"],
  ["I10", "Эссенциальная (первичная) гипертензия"],
];

export const ICD10_CATALOG: readonly Icd10Entry[] = entries.map(
  ([code, title]) => ({ ...ICD10_SOURCE, code, title }),
);

const normalize = (value: string) =>
  value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");

export function searchIcd10(query: string): Icd10Entry[] {
  const needle = normalize(query);
  if (!needle) return [...ICD10_CATALOG];
  return ICD10_CATALOG.filter(
    (entry) =>
      normalize(entry.code).includes(needle) ||
      normalize(entry.title).includes(needle),
  );
}

export function isCurrentIcd10Selection(
  value: unknown,
): value is TerminologySelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<TerminologySelection>;
  return ICD10_CATALOG.some(
    (entry) =>
      entry.system === selection.system &&
      entry.sourceOid === selection.sourceOid &&
      entry.sourceVersion === selection.sourceVersion &&
      entry.code === selection.code &&
      entry.title === selection.title,
  );
}
