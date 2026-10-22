import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { adminDemoSchema, adminDemoSources } from "./data";
import { createSession, reduceSession } from "./workspaceState";

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
describe("рабочие пространства администратора", () => {
  it("не открывает прямую ссылку на роль, отсутствующую у сотрудника", async () => {
    const user = userEvent.setup();
    const previous = adminDemoSources.normal;
    const data = adminDemoSchema.parse(previous);
    data.employees.find((e) => e.id === data.currentEmployeeId)!.roles = [
      "coordinator",
    ];
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
  it("игнорирует неизвестные записи и сохранение текущей учётной записи", () => {
    const data = adminDemoSchema.parse(adminDemoSources.normal),
      state = createSession(data);
    for (const type of [
      "toggleTask",
      "completeTask",
      "period",
      "employee",
    ] as const)
      expect(reduceSession(data, state, { type, id: "demo-missing" })).toBe(
        state,
      );
    const own = { ...state, employeeId: data.currentEmployeeId };
    expect(
      reduceSession(data, own, { type: "draft", roles: ["coordinator"] }),
    ).toBe(own);
    expect(reduceSession(data, own, { type: "saveRoles" })).toBe(own);
  });
  it("сохраняет фильтр, последний раздел и черновик при переключении ролей, исходные данные не мутирует", async () => {
    const user = userEvent.setup(),
      original = JSON.stringify(adminDemoSources.normal);
    render(<App />);
    await user.selectOptions(screen.getByLabelText("Период анализа"), "7");
    await user.click(screen.getByRole("link", { name: "Медстатистика" }));
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "system",
    );
    await user.click(
      await screen.findByRole("checkbox", { name: "Руководитель" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Рабочее пространство"),
      "director",
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Медицинская статистика",
      }),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Период анализа") as HTMLSelectElement).value,
    ).toBe("7");
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
    expect(screen.getByText("Есть несохранённые изменения ролей")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Отменить изменения" }),
    );
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Руководитель",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(JSON.stringify(adminDemoSources.normal)).toBe(original);
  });
  it("не сохраняет пустые роли и возвращает фокус к первой ошибке", async () => {
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
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Координатор" }),
    );
    expect(
      screen.queryByRole("button", { name: "Настроить Сотрудник А-01" }),
    ).toBeNull();
  });
  it("разделяет сеансы наборов и явным сбросом восстанавливает роли и черновик", async () => {
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
    ).toBe(true);
    await user.click(screen.getByRole("link", { name: "Демонстрация" }));
    await user.click(
      await screen.findByRole("button", { name: "Начать новый сеанс" }),
    );
    await user.click(screen.getByRole("button", { name: "Сбросить сеанс" }));
    await user.click(screen.getByRole("link", { name: "Сотрудники" }));
    expect(
      (
        (await screen.findByRole("checkbox", {
          name: "Руководитель",
        })) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(screen.queryByText("Есть несохранённые изменения ролей")).toBeNull();
  });
  it("объясняет повреждённое сохранение и не перезаписывает его без явного сброса", async () => {
    sessionStorage.setItem("syncli.analytics.demo.v1.normal", "broken");
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("alert").textContent).toContain(
      "восстановить сохранение",
    );
    expect(sessionStorage.getItem("syncli.analytics.demo.v1.normal")).toBe(
      "broken",
    );
    await user.click(screen.getByRole("link", { name: "Демонстрация" }));
    await user.click(
      await screen.findByRole("button", { name: "Начать новый сеанс" }),
    );
    await user.click(screen.getByRole("button", { name: "Сбросить сеанс" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(sessionStorage.getItem("syncli.analytics.demo.v1.normal")).not.toBe(
      "broken",
    );
  });
  it("различает отсутствие сводки и ноль и запрещает неверный диапазон дат", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText("Даты и таблица значений"));
    expect(screen.getByRole("row", { name: /8 окт.*Нет сводки/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Указать даты" }));
    await user.clear(screen.getByLabelText("Дата начала"));
    await user.click(screen.getByRole("button", { name: "Применить даты" }));
    expect(screen.getByRole("alert").textContent).toContain("Укажите даты");
    expect(document.activeElement).toBe(screen.getByLabelText("Дата начала"));
  });
  it("восстанавливается после неизвестного URL и сохраняет отдельный стенд примеров", async () => {
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
      await screen.findByRole("heading", { name: "Обзор клиники" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Примеры компонентов" }));
    expect(await screen.findByLabelText("Компонент")).toBeTruthy();
  });
});
