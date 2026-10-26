import { describe, expect, it } from "vitest";
import {
  ICD10_CATALOG,
  isCurrentIcd10Selection,
  searchIcd10,
} from "./terminology";

describe("полный каталог МКБ-10", () => {
  it("различает точные номера классов I, II и XXI", () => {
    expect(searchIcd10("Класс I").every((r) => /^[AB]/.test(r.code))).toBe(
      true,
    );
    expect(searchIcd10("Класс II").every((r) => /^[CD]/.test(r.code))).toBe(
      true,
    );
    expect(searchIcd10("Класс XXI").every((r) => r.code.startsWith("Z"))).toBe(
      true,
    );
    expect(searchIcd10("Класс XXII").some((r) => r.code === "U07.1")).toBe(
      true,
    );
  });
  it("охватывает полный российский справочник, включая специальные коды", () => {
    expect(ICD10_CATALOG.length).toBeGreaterThan(14000);
    for (const code of [
      "A00.0",
      "C50.9",
      "F41.1",
      "M54.5",
      "Z99.9",
      "U07.1",
      "U09.9",
    ])
      expect(searchIcd10(code).some((item) => item.code === code)).toBe(true);
    expect(searchIcd10("  u 07 . 1 ")[0]?.code).toBe("U07.1");
    expect(searchIcd10("ЖЕЛЕЗОДЕФИЦИТНАЯ   анемия").length).toBeGreaterThan(0);
  });

  it("находит запись и по фрагменту кода, и по русскому названию", () => {
    expect(searchIcd10("F32").map((item) => item.code)).toContain("F32.1");
    expect(searchIcd10("гипертензия").map((item) => item.code)).toContain(
      "I10",
    );
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
