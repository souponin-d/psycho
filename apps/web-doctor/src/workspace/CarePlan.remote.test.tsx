import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlanForm } from "./CarePlan";
import { createPatient, createVisit } from "./commands";
import { demoActor } from "./seed";
import type { PlanItem } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { newAviandrReview } from "./aviandr";

function fixture() {
  const now = "2026-10-27T10:00:00.000Z";
  const patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "remote-ui",
  );
  const office = createVisit("office", now, demoActor);
  Object.assign(office, {
    status: "completed",
    format: "in-person",
    confirmedById: demoActor.id,
    diagnoses: [{ code: "F41.1", title: "ГТР", status: "confirmed" }],
  });
  const remote = createVisit("remote", now, demoActor);
  Object.assign(remote, { status: "in-progress", format: "remote" });
  const active = createVisit("active", now, demoActor);
  Object.assign(active, { status: "in-progress", format: "in-person" });
  patient.visits.push(office, remote, active);
  const original = {
    id: "original",
    createdAt: now,
    author: demoActor.name,
    confirmedById: demoActor.id,
    visitId: "office",
    kind: "medication",
    title: "Прежний препарат",
    dose: "20 мг",
    schedule: "09:00",
    details: "Исходное назначение",
    startDate: "2026-10-26",
    endDate: "",
    dueDate: "",
    status: "confirmed",
    confirmedAt: now,
    confirmedBy: demoActor.name,
    replacesId: "",
    changeReason: "",
    instructionUrl: "https://example.test/",
    patientInstructions: "Исходные указания",
    rationale: "Основание",
    sourceIds: [],
  } as PlanItem;
  patient.plan.push(original);
  const draft = {
    ...original,
    id: "draft",
    status: "draft" as const,
    confirmedAt: "",
    replacesId: original.id,
    visitId: "remote",
    changeReason: "Коррекция",
  };
  const mutate = vi.fn().mockResolvedValue(undefined);
  const actions = {
    actor: demoActor,
    mutate,
    busy: false,
  } as unknown as WorkspaceActions;
  return { patient, draft, mutate, actions };
}

it("блокирует неизменяемые поля при дистанционной коррекции, сохраняя дозировку и причину", async () => {
  const { patient, draft, actions, mutate } = fixture();
  render(
    <PlanForm
      patient={patient}
      existing={draft}
      actions={actions}
      onClose={vi.fn()}
    />,
  );
  expect(
    (screen.getByLabelText("Режим приёма") as HTMLInputElement).disabled ||
      screen.getByLabelText("Режим приёма").closest("fieldset:disabled"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Дозировка").closest("fieldset:disabled"),
  ).toBeNull();
  expect(
    screen.getByText(/Дистанционно можно изменить только дозировку/),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Дозировка"), {
    target: { value: "10 мг" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  const saved = mutate.mock.calls[0]![1].value;
  expect(saved.dose).toBe("10 мг");
  expect(saved.schedule).toBe("09:00");
  expect(saved.visitId).toBe("remote");
});

it("при переходе с очного на дистанционный приём восстанавливает запрещённые изменения", () => {
  const { patient, draft, actions } = fixture();
  render(
    <PlanForm
      patient={patient}
      existing={{
        ...draft,
        visitId: "active",
        schedule: "21:00",
        details: "Изменено",
      }}
      actions={actions}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Приём, на котором принято решение"), {
    target: { value: "remote" },
  });
  expect(
    (screen.getByLabelText("Режим приёма") as HTMLInputElement).value,
  ).toBe("09:00");
  expect(
    (screen.getByLabelText("Содержание назначения") as HTMLTextAreaElement)
      .value,
  ).toBe("Исходное назначение");
});

it("снимает проверку Авиандра при восстановлении исходного другого препарата", () => {
  const { patient, draft, actions } = fixture();
  render(
    <PlanForm
      patient={patient}
      existing={{
        ...draft,
        visitId: "active",
        title: "Авиандр",
        aviandrReview: newAviandrReview(patient, draft.id),
      }}
      actions={actions}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Приём, на котором принято решение"), {
    target: { value: "remote" },
  });
  expect(
    (
      screen.getByLabelText(
        /Препарат, форма и наименование/,
      ) as HTMLInputElement
    ).value,
  ).toBe("Прежний препарат");
  expect(
    screen.queryByRole("complementary", { name: "Дополнительная информация" }),
  ).toBeNull();
});

it("не отправляет дистанционную коррекцию без подтверждённого основания и снимает ограничение при выборе очного приёма", () => {
  const { patient, draft, actions } = fixture();
  delete patient.plan[0]!.confirmedById;
  render(
    <PlanForm
      patient={patient}
      existing={draft}
      actions={actions}
      onClose={vi.fn()}
    />,
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Сохранить черновик",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByText(
      "Для дистанционной коррекции нужно исходное назначение этого врача.",
    ),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Приём, на котором принято решение"), {
    target: { value: "active" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Сохранить черновик",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    (screen.getByLabelText("Режим приёма") as HTMLInputElement).disabled,
  ).toBe(false);
});
