import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TerminologyPicker } from "./TerminologyPicker";
import { ICD10_CATALOG } from "./terminology";

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
