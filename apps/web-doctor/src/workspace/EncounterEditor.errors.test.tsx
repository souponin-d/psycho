import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EncounterEditor } from "./EncounterEditor";
import { createPatient, createVisit } from "./commands";
import { demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

function mount(remote = false) {
  const now = "2026-10-27T09:00:00.000Z";
  const patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "errors",
  );
  const visit = createVisit("visit-errors", now, demoActor);
  visit.status = "in-progress";
  if (remote) visit.format = "remote";
  patient.visits.push(visit);
  const mutate = vi.fn().mockResolvedValue(patient);
  render(
    <EncounterEditor
      patient={patient}
      visit={visit}
      actions={
        { actor: demoActor, mutate, busy: false } as unknown as WorkspaceActions
      }
      navigate={vi.fn()}
      registerGuard={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Итог приёма/ }));
  return { mutate };
}

it.each([
  ["Зафиксируйте заключение по рискам", "Заключение врача по рискам"],
  ["Заполните заключение врача", "Заключение врача"],
  ["Укажите рекомендации и следующий шаг", "Рекомендации и следующий шаг"],
])("ошибка «%s» открывает нужное поле и ставит фокус", async (error, label) => {
  const { mutate } = mount();
  fireEvent.click(screen.getByRole("link", { name: error }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: label }),
    ),
  );
  expect(mutate).not.toHaveBeenCalled();
});

it.each([
  ["Зафиксируйте документированное согласие на помощь", "care"],
  [
    "Для дистанционного контакта зафиксируйте основание и согласие на связь",
    "communication",
  ],
])(
  "ошибка согласия открывает форму с нужным назначением: %s",
  (error, purpose) => {
    mount(true);
    fireEvent.click(screen.getByRole("link", { name: error }));
    expect(
      (screen.getByLabelText("Назначение документа") as HTMLSelectElement)
        .value,
    ).toBe(purpose);
  },
);

it("переход из окна подтверждения закрывает окно и фокусирует поле, не завершая приём", async () => {
  const { mutate } = mount();
  fireEvent.click(screen.getByRole("button", { name: "Завершить приём" }));
  await screen.findByRole("heading", { name: "Подтвердить итог приёма" });
  const links = screen.getAllByRole("link", {
    name: "Заполните заключение врача",
  });
  fireEvent.click(links[links.length - 1]!);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Заключение врача" }),
    ),
  );
  expect(
    screen.queryByRole("heading", { name: "Подтвердить итог приёма" }),
  ).toBeNull();
  expect(
    mutate.mock.calls.some((call) => call[1].type === "visit.complete"),
  ).toBe(false);
});
