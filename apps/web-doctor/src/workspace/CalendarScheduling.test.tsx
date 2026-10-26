import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { Calendar } from "./Workday";
import { seedPatients, demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);

it("selects a patient before scheduling and keeps the chosen calendar day", async () => {
  const patients = seedPatients(new Date("2026-10-24T10:00:00Z"));
  const mutate = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn();
  const actions = {
    actor: demoActor,
    patients,
    mutate,
    busy: false,
  } as unknown as WorkspaceActions;
  render(
    <Calendar patients={patients} navigate={navigate} actions={actions} />,
  );
  fireEvent.change(screen.getByLabelText("Начиная с даты"), {
    target: { value: "2026-11-15" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Запланировать из карты" }),
  );
  const chooser = screen.getByRole("dialog", { name: "Выбрать пациента" });
  fireEvent.click(
    within(chooser).getByRole("button", {
      name: new RegExp(patients[1]!.profile.name),
    }),
  );
  const form = screen.getByRole("dialog", { name: "Запланировать приём" });
  expect(within(form).getByText(patients[1]!.profile.name)).toBeTruthy();
  expect(
    (within(form).getByLabelText(/Дата и время/) as HTMLInputElement).value,
  ).toMatch(/^2026-11-15T/);
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(within(form).getByRole("button", { name: "Создать приём" }));
  await vi.waitFor(() =>
    expect(mutate).toHaveBeenCalledWith(
      patients[1]!.id,
      expect.objectContaining({ type: "visit.save" }),
    ),
  );
  expect(navigate).toHaveBeenCalledWith(
    expect.stringContaining(`/patients/${patients[1]!.id}/visits/`),
  );
});

it("allows cancelling and handles an empty patient list without saving", () => {
  const mutate = vi.fn();
  const actions = {
    actor: demoActor,
    patients: [],
    mutate,
    busy: false,
  } as unknown as WorkspaceActions;
  render(<Calendar patients={[]} navigate={vi.fn()} actions={actions} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Запланировать из карты" }),
  );
  expect(screen.getByText("Нет доступных пациентов")).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Отмена" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
});

it("searches active cards and cancels the appointment form without saving", () => {
  const patients = seedPatients();
  patients[0]!.archived = true;
  const mutate = vi.fn();
  const navigate = vi.fn();
  const actions = {
    actor: demoActor,
    patients,
    mutate,
    busy: false,
  } as unknown as WorkspaceActions;
  render(
    <Calendar patients={patients} navigate={navigate} actions={actions} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Запланировать из карты" }),
  );
  let dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByRole("button", {
      name: new RegExp(patients[0]!.profile.name),
    }),
  ).toBeNull();
  fireEvent.change(within(dialog).getByLabelText("Поиск пациента"), {
    target: { value: patients[1]!.code },
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: new RegExp(patients[1]!.profile.name),
    }),
  );
  dialog = screen.getByRole("dialog", { name: "Запланировать приём" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});
