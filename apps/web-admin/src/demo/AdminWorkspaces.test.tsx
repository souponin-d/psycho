import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { adminDemoSchema, adminDemoSources } from "./data";
import { createSession, reduceSession } from "./workspaceState";

const metric = (label: string) =>
  within(
    screen.getByRole("region", { name: "Показатели отделения" }),
  ).getByRole("article", { name: label });

describe("рабочие пространства администратора", () => {
  it("не открывает прямую ссылку на роль, отсутствующую у сотрудника", async () => {
    const user = userEvent.setup();
    const previous = adminDemoSources.normal;
    const data = adminDemoSchema.parse(previous);
    data.employees.find(
      (employee) => employee.id === data.currentEmployeeId,
    )!.roles = ["coordinator"];
    try {
      adminDemoSources.normal = data;
      window.location.hash = "/system/employees";
      render(<App />);
      expect(
        screen.getByRole("heading", { name: "Пространство недоступно" }),
      ).toBeTruthy();
      expect(
        within(screen.getByLabelText("Рабочее пространство")).getAllByRole(
          "option",
        ),
      ).toHaveLength(1);
      expect(
        screen.queryByRole("button", { name: "Сохранить роли" }),
      ).toBeNull();
      await user.click(
        screen.getByRole("link", { name: "Открыть рабочее пространство" }),
      );
      expect(
        await screen.findByRole("heading", { name: "Рабочий день отделения" }),
      ).toBeTruthy();
    } finally {
      adminDemoSources.normal = previous;
    }
  });

  it("игнорирует действия по неизвестным записям и сохранение текущей учётной записи", () => {
    const data = adminDemoSchema.parse(adminDemoSources.normal);
    const state = createSession(data);
    for (const type of [
      "toggleTask",
      "completeTask",
      "period",
      "employee",
    ] as const) {
      expect(reduceSession(data, state, { type, id: "demo-missing" })).toBe(
        state,
      );
    }
    const own = { ...state, employeeId: data.currentEmployeeId };
    expect(
      reduceSession(data, own, { type: "draft", roles: ["coordinator"] }),
    ).toBe(own);
    expect(reduceSession(data, own, { type: "saveRoles" })).toBe(own);
  });

  it("сохраняет выполненную задачу, выбранный период и отчёт при смене роли", async () => {
    const user = userEvent.setup();
    const original = JSON.stringify(adminDemoSources.normal);
    render(<App />);
    await user.click(
      screen.getAllByRole("button", { name: "Открыть задачу" })[0]!,
    );
    await user.click(
      screen.getByRole("button", { name: "Отметить выполненной" }),
    );
    expect(within(metric("Открытые задачи")).getByText("1")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "director",
    );
    await screen.findByRole("heading", { name: "Обзор отделения" });
    expect(screen.getByText("1 открытая задача")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Период отчёта"),
      "demo-period-recent",
    );
    expect(within(metric("Самоотчёты")).getByText("19")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Отчёт" }));
    await user.click(
      await screen.findByRole("button", { name: "Предпросмотр отчёта" }),
    );
    expect(
      screen.getByRole("region", { name: "Предпросмотр отчёта" }).textContent,
    ).toContain("Известные самоотчёты: 19");
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "coordinator",
    );
    await screen.findByRole("heading", { name: "Рабочий день отделения" });
    expect(within(metric("Открытые задачи")).getByText("1")).toBeTruthy();
    await user.click(
      screen.getByRole("button", {
        name: "Выполнено · Расписание кабинета проверено",
      }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Отметить выполненной",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("link", { name: "События" }));
    const log = await screen.findByRole("list", {
      name: "Организационные события",
    });
    expect(
      within(log).getAllByText("Расписание кабинета проверено"),
    ).toHaveLength(1);
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "director",
    );
    expect(
      await screen.findByRole("heading", {
        name: "Отчёт для руководителя",
        level: 1,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Предпросмотр отчёта" }).textContent,
    ).toContain("Известные самоотчёты: 19");
    expect(JSON.stringify(adminDemoSources.normal)).toBe(original);
  });

  it("сохраняет черновик нескольких ролей и регистрирует только фактическое изменение", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "system",
    );
    await user.click(
      await screen.findByRole("checkbox", { name: "Руководитель" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "coordinator",
    );
    await screen.findByRole("heading", { name: "Рабочий день отделения" });
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "system",
    );
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Руководитель",
        })) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    expect(
      screen.getByRole("table", { name: "Сотрудники отделения" }).textContent,
    ).toContain("Координатор, Руководитель");
    expect(within(metric("Изменения ролей")).getByText("1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    expect(within(metric("Изменения ролей")).getByText("1")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Журнал доступа" }));
    const log = await screen.findByRole("list", {
      name: "Журнал изменений доступа",
    });
    expect(within(log).getAllByRole("listitem")).toHaveLength(1);
    expect(log.textContent).toContain("Сотрудник А-01");
    expect(log.textContent).toContain(
      "Координатор → Координатор, Руководитель",
    );
  });

  it("не сохраняет пустой набор ролей и не редактирует текущего сотрудника", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "system",
    );
    await user.click(
      await screen.findByRole("checkbox", { name: "Координатор" }),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    expect(screen.getByRole("alert").textContent).toContain("хотя бы одну");
    expect(within(metric("Изменения ролей")).getByText("0")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Координатор" })).toBe(
      document.activeElement,
    );
    expect(
      screen.queryByRole("button", { name: "Настроить Сотрудник А-01" }),
    ).toBeNull();
  });

  it("сбрасывает сессию при смене набора, сохраняя рабочее пространство", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "system",
    );
    await user.click(
      await screen.findByRole("checkbox", { name: "Руководитель" }),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "empty",
    );
    expect(
      await screen.findByText("Нет сотрудников для настройки"),
    ).toBeTruthy();
    expect(within(metric("Учётные записи")).getByText("1")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "long",
    );
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Руководитель",
        })) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "normal",
    );
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Руководитель",
        })) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(within(metric("Изменения ролей")).getByText("0")).toBeTruthy();
  });

  it("различает ноль и отсутствие данных и обрабатывает пустой отчёт", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "director",
    );
    await user.click(await screen.findByText("Таблица значений"));
    const table = screen.getByRole("table", {
      name: "Самоотчёты · 7–20 октября — значения",
    });
    expect(
      within(table).getByRole("row", { name: "9 октября 0" }),
    ).toBeTruthy();
    expect(
      within(table).getByRole("row", { name: "11 октября Нет данных" }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "empty",
    );
    expect(
      await screen.findByText("Нет данных за выбранный период"),
    ).toBeTruthy();
    expect(within(metric("Самоотчёты")).getByText("0")).toBeTruthy();
    expect(
      within(metric("Дни с данными")).getByText("Нет данных"),
    ).toBeTruthy();
  });

  it("отделяет служебный стенд и восстанавливается после неизвестного URL", async () => {
    const user = userEvent.setup();
    window.location.hash = "/unknown";
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Страница не найдена" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("link", { name: "Открыть рабочее пространство" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Рабочий день отделения" }),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("navigation", {
          name: "Разделы рабочего пространства",
        }),
      ).queryByRole("link", { name: "Примеры" }),
    ).toBeNull();
    await user.click(screen.getByRole("link", { name: "Примеры компонентов" }));
    expect(await screen.findByLabelText("Компонент")).toBeTruthy();
  });
});
