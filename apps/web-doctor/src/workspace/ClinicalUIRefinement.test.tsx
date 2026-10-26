import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ClinicalSupportPanel } from "./ClinicalSupportPanel";
import { WorkflowChanges } from "./ClinicalWorkflow";
import { EncounterEditor } from "./EncounterEditor";
import { clinicalSignals } from "./clinical-support-types";
import { supportSignalLabels } from "./clinical-support-engine";
import { createPatient, createVisit } from "./commands";
import { encounterLabels } from "./labels";
import { demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

afterEach(cleanup);
const now = "2026-10-25T10:00:00Z";
function fixture() {
  const patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "refinement",
  );
  const mutate = vi.fn(async (_id: string, _command: unknown) => patient);
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  return { patient, mutate, actions };
}

it("сохраняет неизвестные клинические ответы при изменении соседней строки", async () => {
  const { patient, mutate, actions } = fixture();
  render(
    <ClinicalSupportPanel
      patient={patient}
      actor={demoActor}
      actions={actions}
    />,
  );
  fireEvent.click(screen.getByText(/Клинические сведения · уточнено/));
  const first = screen.getByRole("group", {
    name: supportSignalLabels[clinicalSignals[0]!],
  });
  const second = screen.getByRole("group", {
    name: supportSignalLabels[clinicalSignals[1]!],
  });
  expect(
    (
      within(first).getByRole("radio", {
        name: "Неизвестно",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(within(first).getByRole("radio", { name: "Нет" }));
  fireEvent.click(within(first).getByRole("radio", { name: "Неизвестно" }));
  fireEvent.click(within(second).getByRole("radio", { name: "Да" }));
  fireEvent.click(screen.getByRole("button", { name: "Сопоставить варианты" }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  const command = mutate.mock.calls[0]![1] as unknown as {
    input: { observations: { key: string; answer: string }[] };
  };
  expect(
    command.input.observations.find((o) => o.key === clinicalSignals[0])
      ?.answer,
  ).toBe("unknown");
  expect(
    command.input.observations.find((o) => o.key === clinicalSignals[1])
      ?.answer,
  ).toBe("yes");
});

it("показывает существующее сообщение пациента без подстановки текста врача", () => {
  const { patient } = fixture();
  patient.messages = [
    {
      id: "patient-message",
      createdAt: now,
      author: "Пациент",
      direction: "patient",
      text: "Что обсудим на приёме?",
      status: "read",
      deliveredAt: now,
      readAt: now,
    },
    {
      id: "doctor-message",
      createdAt: "2026-10-25T11:00:00Z",
      author: "Врач",
      direction: "doctor",
      text: "Ответ врача",
      status: "recorded",
      deliveredAt: "",
      readAt: "",
    },
  ];
  render(<WorkflowChanges patient={patient} />);
  expect(screen.getByText("Что обсудим на приёме?")).toBeTruthy();
  expect(screen.queryByText("Ответ врача")).toBeNull();
});

it("сохраняет скрытые метаданные приёма после редактирования лекарств", async () => {
  const { patient, actions } = fixture();
  const visit = createVisit("visit-refinement", now, demoActor);
  visit.status = "in-progress";
  visit.format = "remote";
  visit.provenance = "document";
  visit.notes.medicationReview = "Прежняя запись";
  patient.visits = [visit];
  const mutate = vi.fn(async (_id, command) => ({
    ...patient,
    visits: [command.value],
  }));
  render(
    <EncounterEditor
      patient={patient}
      visit={visit}
      actions={{ ...actions, mutate }}
      navigate={vi.fn()}
      registerGuard={vi.fn()}
    />,
  );
  expect(screen.queryByText("Данные встречи и источник сведений")).toBeNull();
  fireEvent.change(
    screen.getByRole("textbox", { name: encounterLabels.medicationReview }),
    { target: { value: "Уточнённая запись" } },
  );
  fireEvent.click(screen.getByRole("button", { name: /^Сохранить$/ }));
  await waitFor(() => expect(mutate).toHaveBeenCalledOnce());
  expect(mutate.mock.calls[0]![1].value).toMatchObject({
    scheduledAt: now,
    format: "remote",
    provenance: "document",
    notes: { medicationReview: "Уточнённая запись" },
  });
});
