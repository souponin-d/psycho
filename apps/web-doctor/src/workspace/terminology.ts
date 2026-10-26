import catalogCsv from "./data/mkb10-ru.csv?raw";

/**
 * Полная локальная выгрузка, которую передал пользователь. В CSV отсутствуют
 * дата и номер версии. Идентификатор снапшота меняется при каждой новой
 * загрузке каталога.
 */
export const ICD10_SOURCE = {
  system: "ICD-10-RU",
  sourceOid: "1.2.643.5.1.13.13.11.1005",
  sourceVersion: "local-csv-2026-10-26",
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

interface CatalogRow {
  id: string;
  value: string;
  parentId: string;
}

const selectableCode = /^([A-Z]\d{2}(?:\.[0-9A-Z]+)?)\s+(.+)$/u;

function parseCatalog(source: string): readonly Icd10Entry[] {
  const [header, ...lines] = source.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  if (header !== "ID;MKB_VALUES;PARENT_ID") {
    throw new Error("Не удалось распознать заголовок выгрузки МКБ-10.");
  }

  const rows: CatalogRow[] = lines.flatMap((line) => {
    if (!line) return [];
    const [id, value, parentId, ...extra] = line.split(";");
    if (!id || !value || !parentId || extra.length) {
      throw new Error("Выгрузка МКБ-10 содержит строку с неверной структурой.");
    }
    return [{ id, value, parentId }];
  });

  const codeByRowId = new Map(
    rows.flatMap(({ id, value }) => {
      const code = selectableCode.exec(value)?.[1];
      return code ? [[id, code] as const] : [];
    }),
  );

  const entries = rows.flatMap(({ value, parentId }) => {
    const match = selectableCode.exec(value);
    const code = match?.[1];
    const title = match?.[2];
    if (!code || !title) return [];
    const parentCode = codeByRowId.get(parentId);
    return [
      {
        ...ICD10_SOURCE,
        code,
        title,
        ...(parentCode ? { parentCode } : {}),
      },
    ];
  });

  return entries.sort((left, right) =>
    left.code.localeCompare(right.code, "en", { numeric: true }),
  );
}

export const ICD10_CATALOG = parseCatalog(catalogCsv);

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
