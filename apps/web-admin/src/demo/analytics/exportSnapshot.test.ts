import { describe, it, expect } from "vitest";
import { createClinicDataset } from "./fixtures";
import { defaultFilter } from "./aggregate";
import { createExportSnapshot, tableCsv } from "./exportSnapshot";

describe("снимок экспорта", () => {
  it("фиксирует выборку и сохраняет числа, пропуски и метаданные", () => {
    const data = createClinicDataset("normal");
    const snapshot = createExportSnapshot(
      data,
      defaultFilter(),
      ["summary", "daily", "team", "medical"],
      "2026-10-23T09:00:00Z",
    );
    expect(snapshot.tables.map((t) => t.id)).toEqual([
      "summary",
      "team",
      "daily",
      "medical",
      "method",
    ]);
    expect(snapshot.summary.reports).toBe(621);
    const daily = snapshot.tables.find((t) => t.id === "daily")!;
    expect(daily.rows.find((r) => r[0] === "2026-10-08")?.[1]).toBeNull();
    expect(
      snapshot.tables
        .find((t) => t.id === "team")!
        .rows.reduce((s, r) => s + Number(r[2]), 0),
    ).toBe(621);
    data.doctors[0]!.name = "Изменено";
    expect(JSON.stringify(snapshot)).not.toContain("Изменено");
  });
  it("применяет фильтр и не включает невыбранные разделы", () => {
    const snapshot = createExportSnapshot(
      createClinicDataset("normal"),
      { ...defaultFilter(), departmentId: "demo-dept-2" },
      ["team"],
    );
    expect(snapshot.summary.reports).toBe(229);
    expect(snapshot.tables.map((t) => t.id)).toEqual(["team", "method"]);
    expect(snapshot.tables[0]!.rows).toHaveLength(4);
  });
  it("различает пустую выборку и отсутствие выбранных разделов", () => {
    expect(
      createExportSnapshot(createClinicDataset("empty"), defaultFilter(), [
        "summary",
      ]).empty,
    ).toBe(true);
    expect(() =>
      createExportSnapshot(createClinicDataset("normal"), defaultFilter(), []),
    ).toThrow();
  });
  it("экранирует CSV и защищает текст от формул, сохраняя отрицательные числа", () => {
    const csv = tableCsv({
      id: "team",
      title: "Команда",
      columns: ["Текст", "Число"],
      rows: [
        ['=HYPERLINK("x")', -6],
        [" @SUM(1)", null],
        ['строка;\n"цитата"', 0],
      ],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""x"")";"-6"');
    expect(csv).toContain('"\' @SUM(1)";""');
  });
});
