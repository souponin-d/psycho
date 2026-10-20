import { z } from "zod";
import {
  chartSeriesSchema,
  summaryItemSchema,
  type Scenario,
} from "@psycho/ui-web/contracts";
import {
  demoMetadata,
  demoId,
  demoText,
  demoEventSchema,
  uniqueDemoIds,
} from "@psycho/ui-web/demo-data";
import normal from "./fixtures/normal.json";
import empty from "./fixtures/empty.json";
import long from "./fixtures/long.json";

export const adminRoles = ["coordinator", "director", "system"] as const;
export type AdminRole = (typeof adminRoles)[number];
export const roleLabels: Record<AdminRole, string> = {
  coordinator: "Координатор",
  director: "Руководитель",
  system: "Системный администратор",
};
const dayIndex = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
export function periodDayCount(period: { startDate: string; endDate: string }) {
  return dayIndex(period.endDate) - dayIndex(period.startDate) + 1;
}
const rolesSchema = z
  .array(z.enum(adminRoles))
  .refine(
    (roles) => new Set(roles).size === roles.length,
    "Повторяющаяся роль",
  );
const activitySchema = chartSeriesSchema.superRefine((series, context) => {
  series.points.forEach((point, index) => {
    if (
      point.value !== null &&
      (!Number.isInteger(point.value) || point.value < 0)
    )
      context.addIssue({
        code: "custom",
        path: ["points", index, "value"],
        message: "Нужно целое неотрицательное количество",
      });
  });
});

export const adminDemoSchema = z
  .strictObject({
    ...demoMetadata,
    unit: demoText,
    period: demoText,
    metrics: z.array(summaryItemSchema).superRefine(uniqueDemoIds),
    series: activitySchema,
    team: z
      .array(
        z.strictObject({
          id: demoId,
          name: demoText,
          unit: demoText,
          patients: z.number().int().nonnegative(),
          reports: z.number().int().nonnegative(),
          nextVisit: demoText.nullable(),
        }),
      )
      .superRefine(uniqueDemoIds),
    events: z.array(demoEventSchema).superRefine(uniqueDemoIds),
    currentEmployeeId: demoId,
    employees: z
      .array(
        z.strictObject({
          id: demoId,
          name: demoText,
          kind: z.enum(["staff", "doctor"]),
          roles: rolesSchema,
        }),
      )
      .superRefine(uniqueDemoIds),
    tasks: z
      .array(
        z.strictObject({
          id: demoId,
          title: demoText,
          description: demoText,
          detail: demoText,
          completedTitle: demoText,
          assigneeId: demoId,
          officeId: demoId.nullable(),
          due: demoText,
        }),
      )
      .superRefine(uniqueDemoIds),
    periods: z
      .array(
        z.strictObject({
          id: demoId,
          label: demoText,
          startDate: z.iso.date(),
          endDate: z.iso.date(),
          series: activitySchema,
          officeReports: z.array(
            z.strictObject({
              doctorId: demoId,
              count: z.number().int().nonnegative(),
            }),
          ),
        }),
      )
      .min(1)
      .superRefine(uniqueDemoIds),
  })
  .superRefine((data, context) => {
    const fail = (path: (string | number)[], message: string) =>
      context.addIssue({ code: "custom", path, message });
    const employees = new Map(
      data.employees.map((employee) => [employee.id, employee]),
    );
    const current = employees.get(data.currentEmployeeId);
    if (!current || current.kind !== "staff" || !current.roles.length)
      fail(["currentEmployeeId"], "Нужен текущий сотрудник с рабочими ролями");
    data.employees.forEach((employee, index) => {
      if (employee.kind === "staff" && !employee.roles.length)
        fail(
          ["employees", index, "roles"],
          "У сотрудника должна быть рабочая роль",
        );
      if (employee.kind === "doctor" && employee.roles.length)
        fail(
          ["employees", index, "roles"],
          "Врачебный доступ не назначается редактором демо",
        );
    });
    const offices = new Set(data.team.map((office) => office.id));
    data.team.forEach((office, index) => {
      if (employees.get(office.id)?.kind !== "doctor")
        fail(["team", index, "id"], "Кабинету нужен врач в списке сотрудников");
    });
    data.tasks.forEach((task, index) => {
      if (!employees.get(task.assigneeId)?.roles.includes("coordinator"))
        fail(
          ["tasks", index, "assigneeId"],
          "Задаче нужен ответственный координатор",
        );
      if (task.officeId !== null && !offices.has(task.officeId))
        fail(["tasks", index, "officeId"], "Неизвестный кабинет");
    });
    data.periods.forEach((period, index) => {
      const full = data.periods[0]!;
      const length = periodDayCount(period);
      const offset = dayIndex(period.startDate) - dayIndex(full.startDate);
      if (
        length < 1 ||
        offset < 0 ||
        dayIndex(period.endDate) > dayIndex(full.endDate)
      )
        fail(["periods", index], "Некорректные границы периода");
      if (
        period.series.points.length !== length &&
        !(data.team.length === 0 && period.series.points.length === 0)
      )
        fail(
          ["periods", index, "series"],
          "Нужна точка для каждого дня; отсутствие значения обозначается null",
        );
      if (
        index > 0 &&
        period.series.points.some((point, position) => {
          const source = full.series.points[offset + position];
          return (
            !source || source.id !== point.id || source.value !== point.value
          );
        })
      )
        fail(
          ["periods", index, "series"],
          "Общие дни должны совпадать с полной сводкой",
        );
      const ids = period.officeReports.map((row) => row.doctorId);
      if (
        new Set(ids).size !== ids.length ||
        ids.length !== offices.size ||
        ids.some((id) => !offices.has(id))
      )
        fail(
          ["periods", index, "officeReports"],
          "Период должен содержать каждый кабинет ровно один раз",
        );
      const total = period.series.points.reduce(
        (sum, point) => sum + (point.value ?? 0),
        0,
      );
      if (
        period.officeReports.reduce((sum, row) => sum + row.count, 0) !== total
      )
        fail(
          ["periods", index, "officeReports"],
          "Суммы графика и кабинетов не совпадают",
        );
    });
    const full = data.periods[0];
    if (
      full &&
      (JSON.stringify(full.series) !== JSON.stringify(data.series) ||
        data.team.some(
          (office) =>
            full.officeReports.find((row) => row.doctorId === office.id)
              ?.count !== office.reports,
        ))
    )
      fail(["periods", 0], "Первый период должен совпадать с полной сводкой");
  });
export type AdminDemoData = z.infer<typeof adminDemoSchema>;
export const adminDemoSources: Record<Scenario, unknown> = {
  normal,
  empty,
  long,
};
