import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./AppShell";

const sections = [
  {
    path: "/patients",
    title: "Пациенты",
    description: "Рабочая область",
    content: <p>Область пациентов</p>,
  },
  {
    path: "/examples",
    title: "Примеры",
    description: "Проверка",
    content: <p>Область примеров</p>,
  },
];
const shell = () => (
  <AppShell title="Веб врача" defaultPath="/patients" sections={sections} />
);

describe("навигация оболочки", () => {
  it("возвращает на сайт из опубликованного демо", () => {
    vi.stubEnv("VITE_DEMO_SITE_HOME", "../../");
    try {
      render(shell());
      expect(
        screen
          .getByRole("link", { name: "На сайт Синкли" })
          .getAttribute("href"),
      ).toBe("../../");
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("открывает основной раздел и обновляет заголовок", () => {
    render(shell());
    expect(screen.queryByRole("link", { name: "На сайт Синкли" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Пациенты",
    );
    expect(document.title).toBe("Пациенты · Веб врача · Синкли");
  });
  it("открывает прямой адрес и восстанавливается после неизвестного", async () => {
    window.location.hash = "#/missing";
    render(shell());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Страница не найдена",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Открыть основной раздел" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
        "Пациенты",
      ),
    );
  });
  it("меняет раздел по ссылке и hashchange, переводит фокус на заголовок", async () => {
    render(shell());
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Примеры" }));
    await waitFor(() =>
      expect(document.title).toBe("Примеры · Веб врача · Синкли"),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 1 }),
    );
    window.location.hash = "#/patients";
    await waitFor(() =>
      expect(screen.getByText("Область пациентов")).toBeTruthy(),
    );
  });
});
