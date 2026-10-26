import { describe, expect, it } from "vitest";
import {
  ICD10_CATALOG,
  isCurrentIcd10Selection,
  searchIcd10,
} from "./terminology";

describe("локальный каталог МКБ-10 из предоставленной выгрузки", () => {
  it("находит запись и по фрагменту кода, и по русскому названию", () => {
    expect(searchIcd10("F32").map((item) => item.code)).toContain("F32.1");
    expect(searchIcd10("гипертензия").map((item) => item.code)).toContain(
      "I10",
    );
  });

  it("содержит коды всех классов, включая расширенные подрубрики", () => {
    expect(ICD10_CATALOG).toHaveLength(11529);
    expect(ICD10_CATALOG.map((item) => item.code)).toContain("A03.02");
    expect(ICD10_CATALOG.map((item) => item.code)).toContain("Z99.9");
    expect(searchIcd10("A03.02").map((item) => item.code)).toContain("A03.02");
    expect(ICD10_CATALOG.map((item) => item.code)).not.toContain("A00-B99");
  });

  it("принимает только снимок существующей записи актуальной версии", () => {
    const item = ICD10_CATALOG.find((entry) => entry.code === "F32.1")!;
    expect(isCurrentIcd10Selection(item)).toBe(true);
    expect(
      isCurrentIcd10Selection({ ...item, title: "Выдуманное название" }),
    ).toBe(false);
    expect(isCurrentIcd10Selection({ ...item, sourceVersion: "unknown" })).toBe(
      false,
    );
  });
});
