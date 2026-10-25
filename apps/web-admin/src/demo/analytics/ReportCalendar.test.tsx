import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { analyseClinic, defaultFilter } from "./aggregate";
import { createClinicDataset } from "./fixtures";
import { ReportCalendar } from "./ReportCalendar";

it("отличает известный ноль от пропуска и открывает день с клавиатуры", async () => {
  const user = userEvent.setup(),
    onDay = vi.fn();
  const result = analyseClinic(createClinicDataset("normal"), defaultFilter());
  result.daily = [
    { ...result.daily[0]!, reports: 0 },
    { ...result.daily[1]!, available: false },
  ];
  render(<ReportCalendar result={result} onDay={onDay} />);
  const known = screen.getByRole("button", { name: /21 сент.*самоотчётов: 0/ });
  expect(known.hasAttribute("disabled")).toBe(false);
  expect(
    screen
      .getByRole("button", { name: /22 сент.*нет сводки/ })
      .hasAttribute("disabled"),
  ).toBe(true);
  known.focus();
  await user.keyboard("{Enter}");
  expect(onDay).toHaveBeenCalledExactlyOnceWith("2026-09-21");
});

it("показывает выбранный период и не рисует нулевой календарь для пустого состава", () => {
  const result = analyseClinic(createClinicDataset("empty"), defaultFilter());
  render(<ReportCalendar result={result} onDay={vi.fn()} />);
  expect(screen.getByText(/В выбранной выборке нет пациентов/)).toBeTruthy();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});

it("не объявляет нулевыми значения периода только с отсутствующими сводками", () => {
  const result = analyseClinic(createClinicDataset("normal"), {
    ...defaultFilter(),
    from: "2026-10-08",
    to: "2026-10-08",
  });
  render(<ReportCalendar result={result} onDay={vi.fn()} />);
  expect(screen.getByText("Нет доступных сводок")).toBeTruthy();
  expect(screen.queryByText("Все известные значения — 0")).toBeNull();
});
