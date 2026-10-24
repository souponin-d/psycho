import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { PlanForm } from "./CarePlan";
import { newAviandrReview } from "./aviandr";
import { applyCommand } from "./commands";
import { demoActor, seedPatients } from "./seed";
import type { Mutation, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
afterEach(cleanup);
it("shows the actual saved and local Aviandr answers before resolving a concurrent edit", () => {
  const f = fixture();
  const patient = structuredClone(f.patient);
  const plan = {
    ...patient.plan[0]!,
    id: "conflict-aviandr",
    kind: "medication" as const,
    title: "Авиандр",
    status: "draft" as const,
    aviandrReview: newAviandrReview(patient, "conflict-aviandr"),
  };
  patient.plan.push(plan);
  const props = { actions: f.actions, onClose: f.onClose, existing: plan };
  const view = render(<PlanForm patient={patient} {...props} />);
  fireEvent.change(screen.getByLabelText("Эпилепсия"), {
    target: { value: "yes" },
  });
  const changed = structuredClone(patient);
  changed.revision++;
  changed.plan.at(-1)!.aviandrReview!.inputs.epilepsy = "no";
  view.rerender(<PlanForm patient={changed} {...props} />);
  expect(screen.queryByText("[object Object]")).toBeNull();
  expect(screen.getByText(/Эпилепсия: да/)).toBeTruthy();
  expect(screen.getByText(/Эпилепсия: нет/)).toBeTruthy();
});
function fixture() {
  let patient = seedPatients(new Date("2026-10-24T09:00:00Z"))[0]!;
  const onClose = vi.fn();
  const mutate = vi.fn(
    async (_id: string, mutation: Mutation, expectedRevision?: number) => {
      patient = applyCommand(
        patient,
        {
          commandId: crypto.randomUUID(),
          expectedRevision: expectedRevision ?? patient.revision,
          mutation,
        },
        demoActor,
        "2026-10-24T10:00:00Z",
      );
      return patient;
    },
  );
  return {
    get patient() {
      return patient;
    },
    onClose,
    mutate,
    actions: {
      actor: demoActor,
      busy: false,
      mutate,
    } as unknown as WorkspaceActions,
  };
}
function openDrug() {
  fireEvent.change(screen.getByLabelText("Тип назначения"), {
    target: { value: "medication" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Выбрать Авиандр" }));
}
it("selects Aviandr, shows actual chart context, saves and reopens the unapproved review", async () => {
  const f = fixture();
  const view = render(
    <PlanForm patient={f.patient} actions={f.actions} onClose={f.onClose} />,
  );
  openDrug();
  expect(screen.getByText(f.patient.profile.allergies)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Эпилепсия"), {
    target: { value: "yes" },
  });
  fireEvent.change(screen.getByLabelText(/^Основание уточнений/), {
    target: { value: "Со слов пациента на текущем приёме" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(f.onClose).toHaveBeenCalledOnce());
  const saved = f.patient.plan.at(-1)!;
  expect(saved.aviandrReview?.status).toBe("unapproved");
  expect(
    saved.aviandrReview?.findings.find((r) => r.id === "epilepsy")?.status,
  ).toBe("contraindication");
  expect(saved.status).toBe("draft");
  view.unmount();
  render(
    <PlanForm
      patient={f.patient}
      actions={f.actions}
      onClose={f.onClose}
      existing={saved}
    />,
  );
  expect((screen.getByLabelText("Эпилепсия") as HTMLSelectElement).value).toBe(
    "yes",
  );
  expect(
    (screen.getByLabelText(/^Основание уточнений/) as HTMLTextAreaElement)
      .value,
  ).toBe("Со слов пациента на текущем приёме");
});
it("preserves draft text on chart refresh and asks to explicitly reset stale clarifications", () => {
  const f = fixture();
  const props = { actions: f.actions, onClose: f.onClose };
  const view = render(<PlanForm patient={f.patient} {...props} />);
  openDrug();
  fireEvent.change(screen.getByLabelText("Содержание назначения"), {
    target: { value: "Мой текст" },
  });
  const changed = structuredClone(f.patient) as PatientRecord;
  changed.profile.currentMedication = "Сведения другого врача";
  changed.revision++;
  view.rerender(<PlanForm patient={changed} {...props} />);
  expect(screen.getByText(/Данные карты изменились/)).toBeTruthy();
  expect(
    (screen.getByLabelText("Содержание назначения") as HTMLTextAreaElement)
      .value,
  ).toBe("Мой текст");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Обновить контекст и сбросить уточнения",
    }),
  );
  expect(screen.queryByText(/Данные карты изменились/)).toBeNull();
  expect(screen.getByText("Сведения другого врача")).toBeTruthy();
});
it("does not attach an Aviandr review to another drug", async () => {
  const f = fixture();
  render(
    <PlanForm patient={f.patient} actions={f.actions} onClose={f.onClose} />,
  );
  openDrug();
  fireEvent.change(screen.getByLabelText(/^Препарат, форма и наименование/), {
    target: { value: "Другой препарат" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(f.onClose).toHaveBeenCalledOnce());
  expect(f.patient.plan.at(-1)?.aviandrReview).toBeUndefined();
});
