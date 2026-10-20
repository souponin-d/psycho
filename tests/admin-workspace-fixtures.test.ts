import { describe, expect, it } from "vitest";
import {
  adminDemoSchema,
  adminDemoSources,
} from "../apps/web-admin/src/demo/data";

describe("данные трёх рабочих пространств", () => {
  it("отклоняет потерянный день, даже если его значение равно нулю", () => {
    const data = structuredClone(
      adminDemoSchema.parse(adminDemoSources.normal),
    );
    data.periods[1]!.series.points = data.periods[1]!.series.points.filter(
      (point) => point.id !== "demo-day-16",
    );
    expect(adminDemoSchema.safeParse(data).success).toBe(false);
  });
  it("отклоняет противоречащие значения общих дней при неизменной сумме", () => {
    const data = structuredClone(
      adminDemoSchema.parse(adminDemoSources.normal),
    );
    data.periods[1]!.series.points[0]!.value = 2;
    data.periods[1]!.series.points[1]!.value = 2;
    expect(adminDemoSchema.safeParse(data).success).toBe(false);
  });
  it("длинный набор содержит дневные точки за весь диапазон, включая отсутствие данных", () => {
    const data = adminDemoSchema.parse(adminDemoSources.long);
    expect(data.series.points).toHaveLength(14);
    expect(data.series.points.some((point) => point.value === null)).toBe(true);
  });
  it.each(["normal", "empty", "long"] as const)(
    "%s содержит текущего сотрудника, задачи и отчётные периоды",
    (scenario) => {
      expect(adminDemoSchema.parse(adminDemoSources[scenario])).toMatchObject({
        currentEmployeeId: "demo-staff-01",
        employees: expect.any(Array),
        tasks: expect.any(Array),
        periods: expect.any(Array),
      });
    },
  );

  it("согласует полную сводку и последнюю неделю с кабинетами", () => {
    const data = adminDemoSchema.parse(adminDemoSources.normal);
    expect(
      data.periods.map((period) =>
        period.series.points.reduce(
          (sum, point) => sum + (point.value ?? 0),
          0,
        ),
      ),
    ).toEqual([31, 19]);
    expect(data.periods[1]!.officeReports.map((row) => row.count)).toEqual([
      6, 5, 5, 3,
    ]);
    expect(
      data.employees.find((employee) => employee.id === data.currentEmployeeId)
        ?.roles,
    ).toEqual(["coordinator", "director", "system"]);
    expect(data.tasks).toHaveLength(2);
  });

  it.each([
    "чужой ответственный",
    "неизвестный кабинет",
    "повтор роли",
    "повтор кабинета",
    "несогласованные суммы",
    "нет текущего сотрудника",
  ])("отклоняет повреждение: %s", (mutation) => {
    const data = structuredClone(
      adminDemoSchema.parse(adminDemoSources.normal),
    );
    if (mutation === "чужой ответственный")
      data.tasks[0]!.assigneeId = "demo-other";
    if (mutation === "неизвестный кабинет")
      data.tasks[0]!.officeId = "demo-other";
    if (mutation === "повтор роли") data.employees[0]!.roles.push("system");
    if (mutation === "повтор кабинета")
      data.periods[1]!.officeReports[1]!.doctorId =
        data.periods[1]!.officeReports[0]!.doctorId;
    if (mutation === "несогласованные суммы")
      data.periods[1]!.officeReports[0]!.count = 100;
    if (mutation === "нет текущего сотрудника")
      data.currentEmployeeId = "demo-other";
    expect(adminDemoSchema.safeParse(data).success).toBe(false);
  });
});
