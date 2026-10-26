import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeasurementForm } from "./Dynamics";
import { applyCommand, createPatient, createVisit } from "./commands";
import { demoActor } from "./seed";
import { clinicalProtocols } from "./clinical-protocols";
import type { WorkspaceActions } from "./useWorkspace";
import type { Mutation } from "./model";

afterEach(cleanup);
const now = "2026-10-26T10:00:00.000Z";
function setup(visitId?: string) {
  let patient = createPatient(
    { name: "Пациент шкалы", birthDate: "1990-01-01" },
    demoActor,
    now,
    "questionnaire",
  );
  if (visitId) patient.visits.push(createVisit(visitId, now, demoActor));
  const mutate = vi.fn(async (_id: string, mutation: Mutation) => {
    patient = applyCommand(
      patient,
      {
        commandId: crypto.randomUUID(),
        expectedRevision: patient.revision,
        mutation,
      },
      demoActor,
      now,
    );
    return patient;
  });
  const actions = {
    actor: demoActor,
    patients: [patient],
    mutate,
    busy: false,
  } as unknown as WorkspaceActions;
  const onClose = vi.fn();
  render(
    <MeasurementForm
      patient={patient}
      actions={actions}
      onClose={onClose}
      visitId={visitId}
    />,
  );
  return { mutate, onClose, current: () => patient };
}
function openQuestions() {
  fireEvent.click(screen.getByRole("button", { name: "Ответить на вопросы" }));
  return screen.getByRole("dialog");
}
it("submits complete GAD-7 answers through the existing scorer", async () => {
  const state = setup();
  const dialog = openQuestions();
  for (let i = 1; i <= 7; i++)
    fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${i}\\.`)), {
      target: { value: "2" },
    });
  fireEvent.change(within(dialog).getByLabelText(/Дата и время результата/), {
    target: { value: "2026-10-26T10:00" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Сохранить самоотчёт" }),
  );
  await vi.waitFor(() => expect(state.onClose).toHaveBeenCalled());
  expect(state.current().workflow!.assessments.at(-1)).toMatchObject({
    score: 14,
    completeness: "complete",
    safety: "unknown",
    immediateDanger: "unknown",
    answers: Array(7).fill(2),
  });
});
it("keeps skipped PHQ-9 answers and unknown risk unknown without a total", async () => {
  const state = setup();
  const dialog = openQuestions();
  fireEvent.change(within(dialog).getByLabelText("Форма самоопросника"), {
    target: {
      value: clinicalProtocols.find((p) => p.scale === "PHQ-9")!.version,
    },
  });
  fireEvent.change(within(dialog).getByLabelText(/^1\./), {
    target: { value: "1" },
  });
  fireEvent.change(within(dialog).getByLabelText(/Дата и время результата/), {
    target: { value: "2026-10-26T10:00" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Сохранить самоотчёт" }),
  );
  await vi.waitFor(() => expect(state.onClose).toHaveBeenCalled());
  expect(state.current().workflow!.assessments.at(-1)).toMatchObject({
    score: null,
    completeness: "partial",
    impact: null,
    safety: "unknown",
    immediateDanger: "unknown",
    answers: [1, ...Array(8).fill(null)],
  });
});
it("saves a manual result from another existing scale", async () => {
  const state = setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Внести готовый результат" }),
  );
  expect(screen.getByLabelText("Инструмент")).toBeTruthy();
  expect(screen.getByRole("option", { name: /MADRS/ })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Инструмент"), {
    target: { value: "MADRS" },
  });
  fireEvent.change(screen.getByLabelText(/Форма и версия/), {
    target: { value: "Версия бланка" },
  });
  fireEvent.change(screen.getByLabelText(/Источник результата/), {
    target: { value: "Интервью врача" },
  });
  fireEvent.change(screen.getByLabelText(/Дата и время оценки/), {
    target: { value: "2026-10-26T10:00" },
  });
  fireEvent.change(screen.getByLabelText(/Итоговый балл/), {
    target: { value: "12" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить результат" }));
  await vi.waitFor(() => expect(state.onClose).toHaveBeenCalled());
  expect(state.current().measurements.at(-1)).toMatchObject({
    scale: "MADRS",
    score: 12,
    version: "Версия бланка",
    externalForm: "Интервью врача",
  });
});

it("keeps PHQ-9 impact separate from its answer sum", async () => {
  const state = setup();
  const dialog = openQuestions();
  const protocol = clinicalProtocols.find((p) => p.scale === "PHQ-9")!;
  fireEvent.change(within(dialog).getByLabelText("Форма самоопросника"), {
    target: { value: protocol.version },
  });
  for (let i = 1; i <= 9; i++)
    fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${i}\\.`)), {
      target: { value: "1" },
    });
  fireEvent.change(
    within(dialog).getByLabelText(
      new RegExp(protocol.impactQuestion!.slice(0, 30)),
    ),
    { target: { value: "3" } },
  );
  fireEvent.change(within(dialog).getByLabelText(/Дата и время результата/), {
    target: { value: "2026-10-26T10:00" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Сохранить самоотчёт" }),
  );
  await vi.waitFor(() => expect(state.onClose).toHaveBeenCalled());
  expect(state.current().workflow!.assessments.at(-1)).toMatchObject({
    score: 9,
    completeness: "complete",
    impact: 3,
  });
});

it("carries the launching encounter into the saved questionnaire", async () => {
  const state = setup("active-visit");
  const dialog = openQuestions();
  fireEvent.change(within(dialog).getByLabelText(/Дата и время результата/), {
    target: { value: "2026-10-26T10:00" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Сохранить самоотчёт" }),
  );
  await vi.waitFor(() => expect(state.onClose).toHaveBeenCalled());
  expect(state.current().workflow!.assessments.at(-1)).toMatchObject({
    visitId: "active-visit",
    score: null,
    completeness: "partial",
  });
});
