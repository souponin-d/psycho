import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TerminologyPicker } from "./TerminologyPicker";
import { ICD10_CATALOG } from "./terminology";

it("открывает результаты после первой страницы и сбрасывает страницу при новом запросе", () => {
  render(
    <TerminologyPicker label="Полная МКБ-10" value={[]} onChange={vi.fn()} />,
  );
  const input = screen.getByRole("textbox", { name: /^Полная МКБ-10/ });
  fireEvent.change(input, { target: { value: "F" } });
  const next = screen.getByRole("button", { name: "Следующие результаты" });
  const first = screen.getByRole("group", {
    name: "Полная МКБ-10",
  }).textContent;
  fireEvent.click(next);
  expect(
    screen.getByRole("group", { name: "Полная МКБ-10" }).textContent,
  ).not.toBe(first);
  fireEvent.change(input, { target: { value: "U07.1" } });
  expect(
    screen.getByRole("button", { name: /U07.1 · COVID-19/ }),
  ).toBeDefined();
});

it("позволяет психиатру явно изменить статус выбранного диагноза", () => {
  const onChange = vi.fn();
  const diagnosis = {
    ...ICD10_CATALOG.find((d) => d.code === "F41.1")!,
    status: "hypothesis" as const,
  };
  render(
    <TerminologyPicker
      label="Диагноз"
      value={[diagnosis]}
      onChange={onChange}
      diagnosis
      {...{ canConfirm: true }}
    />,
  );
  fireEvent.change(
    screen.getByRole("combobox", { name: "Статус диагноза F41.1" }),
    { target: { value: "confirmed" } },
  );
  expect(onChange).toHaveBeenCalledWith([
    { ...diagnosis, status: "confirmed" },
  ]);
});

it("не предлагает подтверждение диагноза без полномочия психиатра", () => {
  const diagnosis = {
    ...ICD10_CATALOG.find((d) => d.code === "F41.1")!,
    status: "hypothesis" as const,
  };
  render(
    <TerminologyPicker
      label="Диагноз"
      value={[diagnosis]}
      onChange={vi.fn()}
      diagnosis
    />,
  );
  expect(
    (
      screen.getByRole("combobox", {
        name: "Статус диагноза F41.1",
      }) as HTMLSelectElement
    ).disabled,
  ).toBe(true);
});
