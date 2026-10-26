import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MedicinePicker } from "./MedicinePicker";
import { installGrlsFixture } from "../../../../tests/grls-fixture";
import { PlanForm } from "./CarePlan";
import { demoActor, seedPatients } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";
it("показывает смену формы и РУ при конфликте одинаковых торговых названий", () => {
  const medicine = installGrlsFixture();
  const patient = seedPatients()[0]!;
  const initial = {
    ...patient.plan[0]!,
    kind: "medication" as const,
    status: "draft" as const,
    title: medicine.tradeName,
    medicine: { ...medicine, forms: "Черновая форма: раствор" },
  };
  patient.plan[0] = initial;
  const props = {
    actions: {
      actor: demoActor,
      busy: false,
      mutate: vi.fn(),
    } as unknown as WorkspaceActions,
    onClose: vi.fn(),
    existing: initial,
  };
  const view = render(<PlanForm patient={patient} {...props} />);
  const changed = structuredClone(patient);
  changed.revision++;
  changed.plan[0]!.medicine = {
    ...medicine,
    registrationNumber: "Сохранённое РУ",
    forms: "Сохранённая форма: гель",
  };
  view.rerender(<PlanForm patient={changed} {...props} />);
  expect(
    screen.getByText("Препарат и регистрационные сведения ГРЛС — в карте"),
  ).toBeTruthy();
  expect(
    screen.getByText(/Сохранённое РУ.*Сохранённая форма: гель/),
  ).toBeTruthy();
});
it("показывает РУ и действующий статус, возвращает точный регистрационный снимок", async () => {
  const medicine = installGrlsFixture();
  const onChange = vi.fn();
  render(<MedicinePicker onChange={onChange} />);
  fireEvent.change(
    screen.getByRole("textbox", { name: /Поиск препарата в ГРЛС/ }),
    { target: { value: "Авиандр" } },
  );
  const result = await screen.findByRole("button", { name: /АВИАНДР.*РУ / });
  expect(screen.getByText(/Действующий ·/)).toBeTruthy();
  fireEvent.click(result);
  expect(onChange).toHaveBeenCalledWith(medicine);
});
