import { expect, it } from "vitest";
import {
  recordFromCells,
  isCurrentRegistration,
  verifyWorkbookSet,
} from "./import-grls.mjs";

const cells = () => {
  const row: unknown[] = [];
  for (const [index, value] of [
    [3, "РУ-1"],
    [4, "01.01.2020"],
    [5, ""],
    [6, ""],
    [7, "Держатель"],
    [8, "Россия"],
    [9, "Учебный препарат"],
    [10, "Учебное МНН"],
    [11, "таблетки, 10 мг"],
    [12, "Производитель"],
  ] as const)
    row[index] = value;
  return row;
};
it("принимает только действующие статусы и учитывает даты отдельно от статуса", () => {
  const record = recordFromCells(cells(), "Действующий", "sheet.xlsx", 7);
  expect(record.registrationNumber).toBe("РУ-1");
  expect(isCurrentRegistration(record, "2026-10-26")).toBe(true);
  for (const registrationStatus of [
    "Изменённый",
    "Исключённый",
    "Истёкший",
    "Приостановлено применение",
  ])
    expect(
      isCurrentRegistration({ ...record, registrationStatus }, "2026-10-26"),
    ).toBe(false);
  expect(
    isCurrentRegistration({ ...record, expiresOn: "2026-10-25" }, "2026-10-26"),
  ).toBe(false);
  expect(
    isCurrentRegistration(
      { ...record, cancelledOn: "2026-01-01" },
      "2026-10-26",
    ),
  ).toBe(false);
  expect(
    isCurrentRegistration(
      {
        ...record,
        registrationStatus:
          "Действует, на подтверждении государственной регистрации",
        expiresOn: "2026-10-01",
      },
      "2026-10-26",
    ),
  ).toBe(true);
});
it("не угадывает неизвестные статусы и не исполняет формулы", () => {
  expect(() =>
    recordFromCells(cells(), "Неизвестно", "sheet.xlsx", 7),
  ).toThrow();
  const row = cells();
  row[9] = { formula: 'HYPERLINK("https://example.test")', result: "Название" };
  expect(() => recordFromCells(row, "Действующий", "sheet.xlsx", 7)).toThrow(
    /формул/i,
  );
});
it("не принимает отдельный файл за полную выгрузку", () => {
  expect(() =>
    verifyWorkbookSet(["grls2026-10-23-1-Действующий.xlsx"]),
  ).toThrow(/полнот/i);
});
