import catalog from "./icd10-ru.json" with { type: "json" };
import legacy from "./icd10-legacy.json" with { type: "json" };

export const ICD10_SOURCE = {
  system: "ICD-10-RU",
  sourceOid: catalog.source.sourceOid,
  sourceVersion: catalog.source.sourceVersion,
} as const;

export interface TerminologySelection {
  system: (typeof ICD10_SOURCE)["system"];
  sourceOid: string;
  sourceVersion: string;
  code: string;
  title: string;
}
export type Icd10Entry = TerminologySelection;
/** Full published hierarchy, including inactive historical nodes. */
export const ICD10_NODES = catalog.records;
export const ICD10_CATALOG: readonly Icd10Entry[] = catalog.records
  .filter((r) => r.active && r.kind === "code")
  .map(({ code, title }) => ({ ...ICD10_SOURCE, code, title }));
const current = new Map(ICD10_CATALOG.map((entry) => [entry.code, entry]));
const historical = new Map(
  legacy.entries.map((entry) => [entry.code, entry.title]),
);
const byId = new Map(catalog.records.map((entry) => [entry.id, entry]));
const normalize = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
const searchable = catalog.records
  .filter((r) => r.active && r.kind === "code")
  .map((r) => {
    const ancestors = [];
    const ancestorCodes: string[] = [];
    let parent = r.parentId;
    while (parent) {
      const node = byId.get(parent)!;
      ancestors.push(`${node.code} ${node.title}`);
      ancestorCodes.push(node.code.toLowerCase());
      parent = node.parentId;
    }
    return {
      entry: current.get(r.code)!,
      title: normalize(r.title),
      context: normalize(ancestors.join(" ")),
      ancestorCodes,
    };
  });
export function searchIcd10(query: string): Icd10Entry[] {
  const needle = normalize(query);
  if (!needle) return [...ICD10_CATALOG];
  const code = needle.replaceAll(" ", "");
  const words = needle.split(" ");
  const chapter = /^класс\s+([ivx]+)$/.exec(needle)?.[1];
  return searchable
    .filter((r) =>
      chapter
        ? r.ancestorCodes.includes(chapter)
        : r.entry.code.toLowerCase().includes(code) ||
          words.every((w) => r.title.includes(w)) ||
          words.every((w) => r.context.includes(w)),
    )
    .sort(
      (a, b) =>
        Number(b.entry.code.toLowerCase() === code) -
        Number(a.entry.code.toLowerCase() === code),
    )
    .map((r) => r.entry);
}
export function isCurrentIcd10Selection(
  value: unknown,
): value is TerminologySelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<TerminologySelection>;
  return (
    selection.system === ICD10_SOURCE.system &&
    selection.sourceOid === ICD10_SOURCE.sourceOid &&
    selection.sourceVersion === ICD10_SOURCE.sourceVersion &&
    current.get(selection.code ?? "")?.title === selection.title &&
    typeof selection.title === "string"
  );
}
/** Frozen legacy tuples remain readable, but may only be retained on their existing record. */
export function isKnownIcd10Selection(
  value: unknown,
): value is TerminologySelection {
  if (isCurrentIcd10Selection(value)) return true;
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<TerminologySelection>;
  return (
    s.system === ICD10_SOURCE.system &&
    s.sourceOid === ICD10_SOURCE.sourceOid &&
    s.sourceVersion === legacy.sourceVersion &&
    typeof s.title === "string" &&
    historical.get(s.code ?? "") === s.title
  );
}
export function sameIcd10Selection(
  a: TerminologySelection,
  b: TerminologySelection,
) {
  return (
    a.system === b.system &&
    a.sourceOid === b.sourceOid &&
    a.sourceVersion === b.sourceVersion &&
    a.code === b.code &&
    a.title === b.title
  );
}
export function isAllowedIcd10Selection(
  value: unknown,
  previous: readonly TerminologySelection[] = [],
): value is TerminologySelection {
  return (
    isCurrentIcd10Selection(value) ||
    (isKnownIcd10Selection(value) &&
      previous.some((entry) => sameIcd10Selection(entry, value)))
  );
}
