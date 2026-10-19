import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../app/App";
import { adminDemoSources } from "./data";

describe("демо администратора", () => {
  it("показывает ошибку повреждённого набора вместо нулевой сводки", () => {
    const previous = adminDemoSources.normal;
    try {
      adminDemoSources.normal = { schemaVersion: 2 };
      render(<App />);
      expect(screen.getByRole("alert").textContent).toContain("normal.json");
      expect(
        screen.queryByRole("region", { name: "Показатели отделения" }),
      ).toBeNull();
    } finally {
      adminDemoSources.normal = previous;
    }
  });
  it("различает нулевой показатель и отсутствие сводки", () => {
    render(<App />);
    const cards = within(
      screen.getByRole("region", { name: "Показатели отделения" }),
    );
    expect(
      within(
        cards.getByRole("article", { name: "Обращения без ответа" }),
      ).getByText("0"),
    ).toBeTruthy();
    expect(
      within(
        cards.getByRole("article", { name: "Сводка за прошлый месяц" }),
      ).getByText("Нет данных"),
    ).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "Команда отделения" }),
    ).toBeTruthy();
  });
  it("переключает сводку на пустой и длинный набор без старых строк команды", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "empty",
    );
    expect(screen.getByText("Команда ещё не добавлена.")).toBeTruthy();
    expect(
      screen.queryByRole("table", { name: "Команда отделения" }),
    ).toBeNull();
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "long",
    );
    expect(
      screen.getByRole("table", { name: "Команда отделения" }),
    ).toBeTruthy();
    expect(screen.getByText("Нет новых событий.")).toBeTruthy();
  });
});
