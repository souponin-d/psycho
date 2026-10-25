import { describe, expect, it } from "vitest";
import {
  ICD10_CATALOG,
  isCurrentIcd10Selection,
  searchIcd10,
} from "./terminology";

describe("учебный каталог МКБ-10", () => {
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
