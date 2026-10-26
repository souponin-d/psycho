import { expect, it } from "vitest";
import { GrlsCatalog, type MedicineRecord } from "./grls";
const record: MedicineRecord = {
  recordId: "test-record",
  registrationNumber: "ЛП-1",
  tradeName: "Учебный препарат",
  inn: "Учебное МНН",
  forms: "таблетки 10 мг",
  manufacturers: "Учебный производитель",
  holder: "Держатель",
  registeredOn: "2020-01-01",
  expiresOn: "",
  cancelledOn: "",
  registrationStatus: "Действующий",
  holderCountry: "Россия",
  normativeDocuments: "",
  therapeuticGroup: "",
  vital: "Нет",
  controlled: "Нет",
  orphan: "",
};
it("ищет по МНН, названию, форме и РУ, исключая исторические и истёкшие записи", () => {
  const catalog = new GrlsCatalog();
  catalog.install({
    sourceVersion: "test-v1",
    snapshotDate: "2026-10-23",
    records: [
      record,
      { ...record, recordId: "old", registrationStatus: "Изменённый" },
      { ...record, recordId: "expired", expiresOn: "2026-10-24" },
    ],
  });
  for (const q of ["мнн", "ПРЕПАРАТ", "10   мг", "лп-1", "производитель"]) {
    expect(
      catalog.search(q, 1, 12, "2026-10-26").items.map((r) => r.recordId),
    ).toEqual([record.recordId]);
  }
  const selection = catalog.selection(record);
  expect(catalog.allowed(selection, undefined, "2026-10-26")).toBe(true);
  expect(
    catalog.allowed(
      { ...selection, registrationStatus: "Исключённый" },
      undefined,
      "2026-10-26",
    ),
  ).toBe(false);
  expect(
    catalog.allowed(
      { ...selection, tradeName: "Подмена" },
      undefined,
      "2026-10-26",
    ),
  ).toBe(false);
});
it("сохраняет снимок прежней версии только в исходной записи и не меняет его при обновлении", () => {
  const catalog = new GrlsCatalog();
  catalog.install({
    sourceVersion: "old",
    snapshotDate: "2026-10-23",
    records: [record],
  });
  const selected = catalog.selection(record);
  catalog.install({
    sourceVersion: "new",
    snapshotDate: "2026-10-26",
    records: [{ ...record, tradeName: "Новое название" }],
  });
  expect(catalog.allowed(selected, selected, "2026-10-26")).toBe(true);
  expect(catalog.allowed(selected, undefined, "2026-10-26")).toBe(false);
  expect(selected.tradeName).toBe("Учебный препарат");
});
