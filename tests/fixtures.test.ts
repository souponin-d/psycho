import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { presentationFixtureSchema } from "../packages/ui-web/src/contracts/presentation.ts";
import { readFixture, validateFixtures } from "../scripts/check-fixtures.ts";

const normal = () => ({
  schemaVersion: 1,
  scenario: "normal",
  patients: [
    {
      id: "demo-01",
      displayName: "Учебный пациент 01",
      secondaryText: "Пример",
    },
  ],
  department: {
    items: [
      { id: "demo-count", label: "Записи", value: "0" },
      { id: "demo-missing", label: "Недоступно", value: null },
    ],
    series: {
      label: "Учебная серия",
      points: [
        { id: "demo-point", label: "Пн", value: 0 },
        { id: "demo-gap", label: "Вт", value: null },
      ],
    },
  },
});
const directories: string[] = [];
const directory = () => {
  const path = mkdtempSync(join(tmpdir(), "psycho-fixtures-"));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("контракт синтетических данных", () => {
  it("сохраняет нулевые и отсутствующие значения разными", () => {
    expect(presentationFixtureSchema.parse(normal())).toEqual(normal());
  });
  it.each(["empty", "long"])(
    "принимает сценарий %s без обязательного наполнения",
    (scenario) => {
      const data = {
        ...normal(),
        scenario,
        patients: [],
        department: { items: [], series: { label: "Пример", points: [] } },
      };
      expect(presentationFixtureSchema.safeParse(data).success).toBe(true);
    },
  );
  it.each([
    { ...normal(), schemaVersion: 2 },
    { ...normal(), scenario: "clinical" },
    { ...normal(), secret: "unknown" },
    { ...normal(), patients: [{ ...normal().patients[0], id: "" }] },
    { ...normal(), patients: [{ ...normal().patients[0], id: "real-01" }] },
    { ...normal(), patients: [{ ...normal().patients[0], displayName: " " }] },
    { ...normal(), patients: [normal().patients[0], normal().patients[0]] },
    {
      ...normal(),
      department: {
        ...normal().department,
        items: [{ id: "demo-count", label: "Записи", value: 0 }],
      },
    },
    {
      ...normal(),
      department: {
        ...normal().department,
        series: {
          label: "Данные",
          points: [{ id: "demo-01", label: "Пн", value: Infinity }],
        },
      },
    },
    {
      ...normal(),
      department: {
        ...normal().department,
        series: {
          label: "Данные",
          points: [
            { id: "demo-01", label: "Пн", value: 1 },
            { id: "demo-01", label: "Вт", value: 2 },
          ],
        },
      },
    },
  ])("отклоняет несовместимую запись %#", (data) => {
    expect(presentationFixtureSchema.safeParse(data).success).toBe(false);
  });
  it("указывает путь до повторяющегося идентификатора", () => {
    const result = presentationFixtureSchema.safeParse({
      ...normal(),
      patients: [normal().patients[0], normal().patients[0]],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some(
          (issue) => issue.path.join(".") === "patients.1.id",
        ),
      ).toBe(true);
  });
});

describe("проверка JSON-файлов", () => {
  it("читает данные и не превращает строку нуля в отсутствие", () => {
    const path = join(directory(), "normal.json");
    writeFileSync(path, JSON.stringify(normal()));
    expect(readFixture(path).department.items[0]?.value).toBe("0");
  });
  it("показывает файл и путь ошибочного поля", () => {
    const path = join(directory(), "normal.json");
    writeFileSync(path, JSON.stringify({ ...normal(), schemaVersion: 2 }));
    expect(() => readFixture(path)).toThrow(/normal\.json.*schemaVersion/s);
  });
  it("не принимает сценарий, не соответствующий имени файла", () => {
    const path = join(directory(), "empty.json");
    writeFileSync(path, JSON.stringify(normal()));
    expect(() => readFixture(path)).toThrow(/empty\.json.*scenario/s);
  });
  it("отличает неверный JSON от отсутствующего файла", () => {
    const path = join(directory(), "normal.json");
    writeFileSync(path, "{");
    expect(() => readFixture(path)).toThrow(/normal\.json.*JSON/s);
    expect(() => readFixture(join(directory(), "empty.json"))).toThrow(
      /empty\.json.*файл/s,
    );
  });
  it("проверяет все три обязательных файла, включая отсутствующие", () => {
    const path = directory();
    writeFileSync(join(path, "normal.json"), JSON.stringify(normal()));
    const errors = validateFixtures(path);
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).toMatch(/empty\.json/);
    expect(errors.join("\n")).toMatch(/long\.json/);
  });
  it("принимает три согласованных набора", () => {
    const path = directory();
    for (const scenario of ["normal", "empty", "long"])
      writeFileSync(
        join(path, `${scenario}.json`),
        JSON.stringify({ ...normal(), scenario }),
      );
    expect(validateFixtures(path)).toEqual([]);
  });
});
