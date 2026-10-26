export interface MedicineSelection {
  system: "GRLS";
  sourceVersion: string;
  recordId: string;
  registrationNumber: string;
  tradeName: string;
  inn: string;
  forms: string;
  manufacturers: string;
  holder: string;
  registeredOn: string;
  expiresOn: string;
  cancelledOn: string;
  registrationStatus: string;
}
export interface MedicineRecord extends Omit<
  MedicineSelection,
  "system" | "sourceVersion"
> {
  holderCountry: string;
  normativeDocuments: string;
  therapeuticGroup: string;
  vital: string;
  controlled: string;
  orphan: string;
}
export interface MedicineCatalogData {
  sourceVersion: string;
  snapshotDate: string;
  records: MedicineRecord[];
}
export interface GrlsSearchResult {
  sourceVersion: string;
  snapshotDate: string;
  total: number;
  page: number;
  pageSize: number;
  items: MedicineSelection[];
}
const active = new Set([
  "Действующий",
  "Выдано по правилам ЕАЭС",
  "Действует, на подтверждении государственной регистрации",
  "Действует, в иностранных упаковках",
]);
export const medicineKeys = [
  "system",
  "sourceVersion",
  "recordId",
  "registrationNumber",
  "tradeName",
  "inn",
  "forms",
  "manufacturers",
  "holder",
  "registeredOn",
  "expiresOn",
  "cancelledOn",
  "registrationStatus",
] as const;
export function currentRegistration(
  r: Pick<
    MedicineSelection,
    "registrationStatus" | "expiresOn" | "cancelledOn"
  >,
  on: string,
) {
  return (
    active.has(r.registrationStatus) &&
    (r.registrationStatus ===
      "Действует, на подтверждении государственной регистрации" ||
      !r.expiresOn ||
      r.expiresOn >= on) &&
    (!r.cancelledOn || r.cancelledOn > on)
  );
}
const normalize = (text: string) =>
  text
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .trim()
    .replace(/\s+/g, " ");
export function sameMedicine(a: MedicineSelection, b: MedicineSelection) {
  return medicineKeys.every((k) => a[k] === b[k]);
}
export function medicineShape(value: unknown): value is MedicineSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    Object.keys(r).length === medicineKeys.length &&
    medicineKeys.every(
      (k) => typeof r[k] === "string" && (r[k] as string).length <= 1_000_000,
    ) &&
    r.system === "GRLS" &&
    typeof r.recordId === "string" &&
    r.recordId.length > 0
  );
}
export class GrlsCatalog {
  private data?: MedicineCatalogData;
  private byId = new Map<string, MedicineSelection>();
  private index: { item: MedicineSelection; text: string }[] = [];
  get ready() {
    return !!this.data;
  }
  install(data: MedicineCatalogData) {
    if (
      !data.sourceVersion ||
      !Array.isArray(data.records) ||
      new Set(data.records.map((r) => r.recordId)).size !== data.records.length
    )
      throw new Error("Повреждён каталог ГРЛС.");
    this.data = data;
    this.index = data.records.map((r) => {
      const item = this.selection(r);
      return {
        item,
        text: normalize(
          [
            r.registrationNumber,
            r.tradeName,
            r.inn,
            r.forms,
            r.manufacturers,
            r.holder,
          ].join(" "),
        ),
      };
    });
    this.byId = new Map(this.index.map((r) => [r.item.recordId, r.item]));
  }
  selection(r: MedicineRecord): MedicineSelection {
    if (!this.data) throw new Error("ГРЛС ещё не загружен.");
    return {
      system: "GRLS",
      sourceVersion: this.data.sourceVersion,
      recordId: r.recordId,
      registrationNumber: r.registrationNumber,
      tradeName: r.tradeName,
      inn: r.inn,
      forms: r.forms,
      manufacturers: r.manufacturers,
      holder: r.holder,
      registeredOn: r.registeredOn,
      expiresOn: r.expiresOn,
      cancelledOn: r.cancelledOn,
      registrationStatus: r.registrationStatus,
    };
  }
  allowed(
    value: unknown,
    previous?: MedicineSelection | null,
    on = new Date().toISOString().slice(0, 10),
  ): value is MedicineSelection {
    if (!medicineShape(value)) return false;
    const item = this.byId.get(value.recordId);
    if (item && sameMedicine(item, value) && currentRegistration(item, on))
      return true;
    return (
      !!previous && medicineShape(previous) && sameMedicine(previous, value)
    );
  }
  isCurrent(value: unknown, on = new Date().toISOString().slice(0, 10)) {
    return (
      medicineShape(value) &&
      this.byId.has(value.recordId) &&
      sameMedicine(this.byId.get(value.recordId)!, value) &&
      currentRegistration(value, on)
    );
  }
  search(
    query: string,
    page = 1,
    pageSize = 12,
    on = new Date().toISOString().slice(0, 10),
  ): GrlsSearchResult {
    if (!this.data) throw new Error("ГРЛС ещё не загружен.");
    if (
      query.length > 250 ||
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new Error("Проверьте запрос и страницу ГРЛС.");
    const words = normalize(query).split(" ");
    const matches = this.index.filter(
      (r) =>
        currentRegistration(r.item, on) &&
        words.every((w) => r.text.includes(w)),
    );
    return {
      sourceVersion: this.data.sourceVersion,
      snapshotDate: this.data.snapshotDate,
      total: matches.length,
      page,
      pageSize,
      items: matches
        .slice((page - 1) * pageSize, page * pageSize)
        .map((r) => ({ ...r.item })),
    };
  }
}
export const grlsCatalog = new GrlsCatalog();
