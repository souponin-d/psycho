import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppointmentForm, ProfileForm } from "./PatientForms";
import { Workday } from "./Workday";
import { demoActor, seedPatients } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);

function fixture() {
  const patient = seedPatients(new Date("2026-10-22T09:00:00Z"))[0]!;
  const actions = {
    actor: demoActor,
    busy: false,
    patients: [patient],
    mutate: vi.fn(),
  } as unknown as WorkspaceActions;
  return { actions, patient };
}

it("не показывает вспомогательный контекст перед решением на рабочем дне", () => {
  const { patient } = fixture();

  render(
    <Workday patients={[patient]} navigate={vi.fn()} onCreate={vi.fn()} />,
  );

  expect(screen.queryByText("Контекст перед решением")).toBeNull();
});

it("не показывает поле представителя в профиле пациента", () => {
  const { actions, patient } = fixture();

  render(<ProfileForm patient={patient} actions={actions} onClose={vi.fn()} />);

  expect(
    screen.queryByLabelText("Представитель и основание полномочий"),
  ).toBeNull();
  expect(
    screen.queryByText(/Пустое поле означает отсутствие сведений/),
  ).toBeNull();
});

it("оставляет отмену, но не показывает верхнюю кнопку закрытия при планировании", () => {
  const { actions, patient } = fixture();

  render(
    <AppointmentForm
      patient={patient}
      actor={demoActor}
      actions={actions}
      navigate={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByLabelText("Причина обращения")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Закрыть" })).toBeNull();
  expect(screen.getByRole("button", { name: "Отмена" })).toBeTruthy();
});
