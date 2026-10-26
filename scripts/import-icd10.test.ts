import { describe, expect, it } from "vitest";
import { buildCatalog, verifyCatalog } from "./import-icd10.mjs";
import catalog from "../apps/web-doctor/src/workspace/icd10-ru.json";
import manifest from "../apps/web-doctor/src/workspace/icd10-ru.manifest.json";

describe("полная выгрузка ЕСНСИ", () => {
  it("проверяет целостность, все 22 класса, полноту страниц и исходные статусы", () => {
    expect(() => verifyCatalog(catalog, manifest)).not.toThrow();
    expect(catalog.records).toHaveLength(15038);
    expect(catalog.records.filter((r) => r.kind === "chapter")).toHaveLength(
      22,
    );
    expect(catalog.records.filter((r) => !r.active)).toHaveLength(101);
    expect(
      catalog.records.every(
        (r) => !r.parentId || catalog.records.some((p) => p.id === r.parentId),
      ),
    ).toBe(true);
    expect(() =>
      verifyCatalog(
        { ...catalog, records: catalog.records.slice(1) },
        manifest,
      ),
    ).toThrow();
  });

  it("отвергает неполную и продублированную выгрузку и другую ревизию", () => {
    const passport = {
      classifier: {
        code: "1.2.643.5.1.13.13.11.1005",
        version: 444,
        lastUpdateDate: "2026-10-25T03:08:39.142243Z",
      },
    };
    expect(() =>
      buildCatalog(passport, [
        { currentPage: 1, total: 2, errors: [], body: [] },
      ]),
    ).toThrow(/полнот/);
    const row = {
      elements: Array.from({ length: 9 }, (_, order) => ({
        order,
        value: ["1", "01", "I", "Класс", null, null, "1", null, "key"][order],
      })),
    };
    expect(() =>
      buildCatalog(passport, [
        { currentPage: 1, total: 2, errors: [], body: [row, row] },
      ]),
    ).toThrow(/дубли/);
    expect(() =>
      buildCatalog(
        { classifier: { ...passport.classifier, code: "other" } },
        [],
      ),
    ).toThrow();
  });
});
