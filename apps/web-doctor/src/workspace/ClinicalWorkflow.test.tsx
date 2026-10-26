import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { WorkflowPanel, WorkflowRecommendations } from "./ClinicalWorkflow";
import { applyCommand, createPatient } from "./commands";
import { clinicalProtocols } from "./clinical-protocols";
import { demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

function fixture() {
  const now = "2026-10-26T10:00:00.000Z";
  let patient = createPatient(
    { name: "Пациент двух форм", birthDate: "1990-01-01" },
    demoActor,
    now,
    "two-forms",
  );
  for (const protocol of clinicalProtocols) {
    patient = applyCommand(
      patient,
      {
        commandId: `submit-${protocol.id}`,
        expectedRevision: patient.revision,
        mutation: {
          type: "workflow.submit",
          value: {
            id: `assessment-${protocol.id}`,
            protocolVersion: protocol.version,
            measuredAt: now,
            answers: Array(protocol.items).fill(0),
            state: "completed",
            safety: "no",
            immediateDanger: "no",
            note: "",
            assignmentId: "",
          },
        },
      },
      demoActor,
      now,
    );
  }
  return patient;
}

it("показывает последние GAD-7 и PHQ-9 одновременно, включая одинаковое время", () => {
  render(<WorkflowPanel patient={fixture()} />);
  expect(
    screen
      .getByRole("article", { name: "Оценка пациента: assessment-gad7" })
      .closest("details:not([open])"),
  ).toBeNull();
  expect(
    screen
      .getByRole("article", { name: "Оценка пациента: assessment-phq9" })
      .closest("details:not([open])"),
  ).toBeNull();
});

it("не позволяет подтвердить карточку с изменившейся версией источника и предлагает отдельную пересверку", async () => {
  const patient = fixture();
  const recommendation = patient.workflow!.recommendations.find(
    (entry) => !entry.stale,
  )!;
  recommendation.status = "accepted";
  recommendation.source.contentHash = "source-changed";
  const mutate = vi.fn().mockResolvedValue(patient);
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  render(
    <WorkflowRecommendations
      patient={patient}
      actions={actions}
      onlyId={recommendation.id}
    />,
  );
  expect(screen.getByText("Основание изменилось")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Проверить и подтвердить действие" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Изменить" })).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Пересверить рекомендации" }));
  expect(mutate).toHaveBeenCalledWith(
    patient.id,
    { type: "workflow.refresh" },
    patient.revision,
  );
  expect(recommendation.status).toBe("accepted");
});

it("блокирует уже открытое подтверждение после смены основания", async () => {
  const patient = fixture();
  const recommendation = patient.workflow!.recommendations.find(
    (entry) => !entry.stale,
  )!;
  recommendation.status = "accepted";
  const mutate = vi.fn().mockResolvedValue(patient);
  const actions = {
    actor: demoActor,
    busy: false,
    mutate,
  } as unknown as WorkspaceActions;
  const { rerender } = render(
    <WorkflowRecommendations
      patient={patient}
      actions={actions}
      onlyId={recommendation.id}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Проверить и подтвердить действие" }),
  );
  const dialog = screen.getByRole("dialog", {
    name: "Отдельное подтверждение действия",
  });
  await user.click(within(dialog).getByRole("checkbox"));
  const changed = structuredClone(patient);
  changed.workflow!.recommendations.find(
    (entry) => entry.id === recommendation.id,
  )!.source.contentHash = "changed";
  rerender(
    <WorkflowRecommendations
      patient={changed}
      actions={actions}
      onlyId={recommendation.id}
    />,
  );
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Подтвердить действие",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(mutate).not.toHaveBeenCalled();
});
