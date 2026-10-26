import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PatientView } from "./PatientView";
import { ProfileForm } from "./PatientForms";
import { PatientDirectory } from "./PatientDirectory";
import { TerminologyPicker } from "./TerminologyPicker";
import { seedPatients, demoActor } from "./seed";
import { searchIcd10 } from "./terminology";
import { patientBirthDateBounds } from "./patient-age";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);
const patient = () => seedPatients(new Date("2026-10-26T10:00:00Z"))[0]!;
const actions = {
  actor: demoActor,
  busy: false,
  mutate: vi.fn(),
} as unknown as WorkspaceActions;
it("shows patient data before recommendations and does not duplicate clinical support on the plan tab", () => {
  const p = patient();
  const props = {
    patient: p,
    actor: demoActor,
    actions,
    navigate: vi.fn(),
    server: false,
  };
  const view = render(<PatientView {...props} tab="overview" />);
  const context = screen.getByRole("region", {
    name: "Общие сведения пациента",
  });
  const support = screen.getByRole("region", { name: "Клиническая поддержка" });
  expect(
    context.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(context).getByRole("heading", { name: "Данные пациента" }),
  ).toBeTruthy();
  view.rerender(<PatientView {...props} tab="plan" />);
  expect(
    screen.queryByRole("region", { name: "Клиническая поддержка" }),
  ).toBeNull();
  expect(
    screen.queryByRole("region", { name: "Рекомендации и решения" }),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: "Данные пациента" })).toBeNull();
});
it("keeps save and cancel outside scrolling profile fields and removes the upper close button", () => {
  render(
    <ProfileForm patient={patient()} actions={actions} onClose={vi.fn()} />,
  );
  const dialog = screen.getByRole("dialog", {
    name: "Редактирование профиля пациента",
  });
  expect(within(dialog).queryByRole("button", { name: "Закрыть" })).toBeNull();
  expect(
    within(dialog).getByRole("button", { name: "Сохранить профиль" }),
  ).toBeTruthy();
  const birthDate = within(dialog).getByLabelText(
    /^Дата рождения/,
  ) as HTMLInputElement;
  expect(birthDate.min).toBe(patientBirthDateBounds().min);
  expect(birthDate.max).toBe(patientBirthDateBounds().max);
  expect(
    within(dialog).queryByText(
      "Наличие контакта не предоставляет доступ к карте",
    ),
  ).toBeNull();
  const complaint = within(dialog).getByLabelText("Жалобы");
  const history = within(dialog).getByLabelText("Анамнез заболевания");
  const family = within(dialog).getByLabelText("Семейный анамнез");
  expect(
    complaint.compareDocumentPosition(history) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    history.compareDocumentPosition(family) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it("omits the zero-count footer for an empty archive", () => {
  render(
    <PatientDirectory
      patients={[patient()]}
      navigate={vi.fn()}
      onCreate={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Архив" }));
  expect(screen.queryByText(/Показано:/)).toBeNull();
});
it("removes a selected ICD code via an accessible chip control", () => {
  const selected = searchIcd10("F41.1")[0]!;
  const onChange = vi.fn();
  render(
    <TerminologyPicker
      label="Заболевания"
      value={[selected]}
      onChange={onChange}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: `Убрать ${selected.code}` }),
  );
  expect(onChange).toHaveBeenCalledWith([]);
});
