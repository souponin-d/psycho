import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LegacyDoctorApp as App } from "../app/LegacyDoctorApp";
import { doctorDemoSources } from "./data";

describe("демо врача", () => {
  it("показывает ошибку повреждённого набора вместо пустого кабинета", () => {
    const previous = doctorDemoSources.normal;
    try {
      doctorDemoSources.normal = { schemaVersion: 2 };
      render(<App />);
      expect(screen.getByRole("alert").textContent).toContain("normal.json");
      expect(screen.queryByText("Пациентов пока нет.")).toBeNull();
    } finally {
      doctorDemoSources.normal = previous;
    }
  });
  it("после выбора первой записи не уводит фокус из поиска при фильтрации", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Открыть Пациент Д-101" }),
    );
    const search = screen.getByRole("textbox", { name: "Поиск пациентов" });
    await user.type(search, "Д-103");
    expect(document.activeElement).toBe(search);
  });
  it("показывает выбранную учебную запись и её события", async () => {
    render(<App />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Открыть Пациент Д-104" }));
    const detail = within(
      screen.getByRole("region", { name: "Выбранная запись" }),
    );
    expect(detail.getByRole("heading", { name: "Пациент Д-104" })).toBeTruthy();
    expect(detail.getByText("Самоотчёт добавлен")).toBeTruthy();
  });
  it("находит запись по коду и не оставляет скрытого пациента в подробностях", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByRole("textbox", { name: "Поиск пациентов" }),
      "Д-103",
    );
    expect(
      screen.queryByRole("button", { name: "Открыть Пациент Д-101" }),
    ).toBeNull();
    expect(
      within(
        screen.getByRole("region", { name: "Выбранная запись" }),
      ).getByRole("heading", { name: "Пациент Д-103" }),
    ).toBeTruthy();
    expect(screen.getByText("Событий пока нет.")).toBeTruthy();
  });
  it("сбрасывает поиск и выбор при смене набора, показывает пустое состояние", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(
      screen.getByRole("textbox", { name: "Поиск пациентов" }),
      "несуществующая запись",
    );
    expect(
      screen.getByText("По вашему запросу ничего не найдено."),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "empty",
    );
    expect(
      screen
        .getByRole("textbox", { name: "Поиск пациентов" })
        .getAttribute("value"),
    ).toBe("");
    expect(screen.getByText("Пациентов пока нет.")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Набор демо-данных"),
      "normal",
    );
    expect(
      screen.getByRole("button", { name: "Открыть Пациент Д-101" }),
    ).toBeTruthy();
  });
});
