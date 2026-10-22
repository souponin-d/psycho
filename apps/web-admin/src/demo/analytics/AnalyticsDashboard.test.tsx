import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});
const changeRole = async (
  user: ReturnType<typeof userEvent.setup>,
  role: string,
) => user.selectOptions(screen.getByLabelText("Рабочее пространство"), role);
describe("аналитическая демонстрация", () => {
  it("каждый набор восстанавливает собственные фильтры, а не фильтры соседнего набора", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText("Период анализа"), "7");
    await user.selectOptions(screen.getByLabelText("Врач"), "demo-doctor-01");
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "long",
    );
    expect(
      (screen.getByLabelText("Период анализа") as HTMLSelectElement).value,
    ).toBe("30");
    await user.selectOptions(screen.getByLabelText("Период анализа"), "90");
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "normal",
    );
    expect(
      (screen.getByLabelText("Период анализа") as HTMLSelectElement).value,
    ).toBe("7");
    expect((screen.getByLabelText("Врач") as HTMLSelectElement).value).toBe(
      "demo-doctor-01",
    );
  });
  it("объясняет отказ сохранения и повторяет его по явному действию", async () => {
    const user = userEvent.setup();
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    render(<App />);
    expect(
      await screen.findByText(/Не удалось сохранить\. Действия остаются/),
    ).toBeTruthy();
    write.mockRestore();
    await user.click(
      screen.getByRole("button", { name: "Повторить сохранение" }),
    );
    expect(
      await screen.findByText(/Сеанс сохранён в этой вкладке/),
    ).toBeTruthy();
  });
  it("открывает руководство, согласованно фильтрует и раскрывает состав показателя", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Обзор клиники" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("article", { name: "На сопровождении" }).textContent,
    ).toContain("185");
    await user.selectOptions(screen.getByLabelText("Отделение"), "demo-dept-2");
    expect(
      screen.getByRole("article", { name: "На сопровождении" }).textContent,
    ).not.toContain("185");
    expect(
      within(screen.getByLabelText("Врач")).getAllByRole("option"),
    ).toHaveLength(5);
    await user.click(
      screen.getByRole("button", {
        name: "Открыть состав: Известные самоотчёты",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Состав показателя" }),
    ).toBeTruthy();
  });
  it("проводит самоотчёт через учебного врача, журнал и сохранение сеанса", async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(await screen.findByRole("link", { name: "Демонстрация" }));
    await user.click(
      screen.getByRole("button", { name: "Отправить учебный самоотчёт" }),
    );
    expect(
      await screen.findByText("Форма получена. Повторная отправка отключена."),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Принять событие" }));
    await user.click(
      screen.getByRole("button", { name: "Подтвердить просмотр и ответ" }),
    );
    expect(screen.getByText("Ответ подтверждён учебным врачом")).toBeTruthy();
    view.unmount();
    render(<App />);
    expect(
      await screen.findByText("Ответ подтверждён учебным врачом"),
    ).toBeTruthy();
  });
  it("сохраняет совмещённые роли и не дублирует журнал", async () => {
    const user = userEvent.setup();
    render(<App />);
    await changeRole(user, "system");
    await user.click(
      await screen.findByRole("checkbox", { name: "Руководитель" }),
    );
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    await user.click(screen.getByRole("button", { name: "Сохранить роли" }));
    await user.click(screen.getByRole("link", { name: "Журнал доступа" }));
    expect(
      within(
        await screen.findByRole("list", { name: "Журнал изменений доступа" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("list", { name: "Журнал изменений доступа" })
        .textContent,
    ).toContain("20 окт");
  });
  it("уточнение расписания создаёт встречу, а не только статус задачи", async () => {
    const user = userEvent.setup();
    render(<App />);
    await changeRole(user, "coordinator");
    await user.click(
      await screen.findByRole("button", { name: "Подтвердить встречу" }),
    );
    expect(
      await screen.findByText("Встреча добавлена в расписание"),
    ).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Команда отделения" }).textContent,
    ).toContain("16:30");
  });
  it("пустой набор показывает отсутствие знаменателя, отчёт можно отправить на печать", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "empty",
    );
    expect(
      await screen.findByText("В клинике пока нет пациентов"),
    ).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Отчёт" }));
    await user.click(
      screen.getByRole("button", { name: "Печать / сохранить PDF" }),
    );
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
