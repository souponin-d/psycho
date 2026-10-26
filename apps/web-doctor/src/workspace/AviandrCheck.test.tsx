import { installGrlsFixture } from "../../../../tests/grls-fixture";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { CarePlan, PlanForm } from "./CarePlan";
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
  installGrlsFixture();
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
function oldDraft(f: ReturnType<typeof fixture>) {
  const plan = {
    ...f.patient.plan[0]!,
    id: "old-source-aviandr",
    visitId: "",
    kind: "medication" as const,
    medicine: installGrlsFixture(),
    title: installGrlsFixture().tradeName,
    status: "draft" as const,
    details: "Сохранить текст назначения",
    dose: "20 мг",
    schedule: "Схема врача",
    instructionUrl: "https://example.test/instruction",
    startDate: "2026-10-24",
  };
  f.patient.plan = [plan];
  const review = newAviandrReview(f.patient, plan.id);
  review.sourceVersion = "aviandr-2026-07-16-draft-1";
  review.inputs.epilepsy = "yes";
  review.inputs.evidence = "Старое уточнение";
  review.findings = [
    {
      id: "pregnancy",
      title: "Беременность",
      status: "contraindication",
      detail: "Результат сохранённой версии",
      section: "4.6",
    },
  ];
  plan.aviandrReview = review;
  return plan;
}
it("requires explicit refresh for an old source on an unchanged chart and preserves prescription text", async () => {
  const f = fixture();
  const plan = oldDraft(f);
  render(
    <PlanForm
      patient={f.patient}
      existing={plan}
      actions={f.actions}
      onClose={f.onClose}
    />,
  );
  expect(screen.getByText("Источник проверки изменился")).toBeTruthy();
  expect((screen.getByLabelText("Эпилепсия") as HTMLSelectElement).value).toBe(
    "yes",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "Сохранить черновик",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(f.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Обновить контекст и сбросить уточнения",
    }),
  );
  expect(screen.queryByText("Источник проверки изменился")).toBeNull();
  expect((screen.getByLabelText("Эпилепсия") as HTMLSelectElement).value).toBe(
    "unknown",
  );
  expect(
    (screen.getByLabelText(/^Основание уточнений/) as HTMLTextAreaElement)
      .value,
  ).toBe("");
  expect(
    (screen.getByLabelText("Содержание назначения") as HTMLTextAreaElement)
      .value,
  ).toBe("Сохранить текст назначения");
  expect(plan.aviandrReview?.sourceVersion).toBe("aviandr-2026-07-16-draft-1");
  expect(plan.aviandrReview?.inputs.epilepsy).toBe("yes");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() =>
    expect(
      f.onClose,
      screen.queryByRole("alert")?.textContent,
    ).toHaveBeenCalledOnce(),
  );
  const saved = f.patient.plan[0]!;
  expect(saved.aviandrReview?.sourceVersion).toBe("aviandr-2026-07-16-draft-2");
  expect(saved.dose).toBe("20 мг");
  expect(saved.schedule).toBe("Схема врача");
  expect(saved.details).toBe("Сохранить текст назначения");
});
it("disables confirmation of a draft whose source version is obsolete", () => {
  const f = fixture();
  oldDraft(f);
  render(<CarePlan patient={f.patient} actions={f.actions} />);
  const button = screen.getByRole("button", {
    name: "Проверить и подтвердить",
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(
    screen.queryByRole("dialog", { name: "Подтвердить назначение" }),
  ).toBeNull();
  expect(f.mutate).not.toHaveBeenCalled();
});
it("keeps confirmed historical review results and source metadata as the saved snapshot", () => {
  const f = fixture();
  const plan = { ...oldDraft(f), status: "confirmed" as const };
  f.patient.plan = [plan];
  const snapshot = structuredClone(plan);
  render(<CarePlan patient={f.patient} actions={f.actions} />);
  expect(screen.getByText(/aviandr-2026-07-16-draft-1/)).toBeTruthy();
  expect(screen.getByText("Результат сохранённой версии")).toBeTruthy();
  expect(screen.queryByText("Источник проверки изменился")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /сбросить уточнения/ }),
  ).toBeNull();
  expect(plan).toEqual(snapshot);
  expect(f.mutate).not.toHaveBeenCalled();
});
it("selects Aviandr, shows actual chart context, saves and reopens the unapproved review", async () => {
  const f = fixture();
  const view = render(
    <PlanForm patient={f.patient} actions={f.actions} onClose={f.onClose} />,
  );
  openDrug();
  expect(
    within(screen.getByRole("region", { name: "Проверка Авиандра" })).getByText(
      f.patient.profile.allergies,
      { selector: "dd" },
    ),
  ).toBeTruthy();
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
  expect(
    within(screen.getByRole("region", { name: "Проверка Авиандра" })).getByText(
      "Сведения другого врача",
      { selector: "dd" },
    ),
  ).toBeTruthy();
});
it("does not attach an Aviandr review to another drug", async () => {
  const f = fixture();
  render(
    <PlanForm patient={f.patient} actions={f.actions} onClose={f.onClose} />,
  );
  openDrug();
  fireEvent.change(
    screen.getByRole("textbox", { name: /^Поиск препарата в ГРЛС/ }),
    { target: { value: "Парацетамол" } },
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /^Парацетамол ·/i }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Сохранить черновик" }));
  await waitFor(() => expect(f.onClose).toHaveBeenCalledOnce());
  expect(f.patient.plan.at(-1)?.aviandrReview).toBeUndefined();
});

it("updates the shared profile from Aviandr without submitting or losing the medication draft", async () => {
  const f = fixture();
  const props = { actions: f.actions, onClose: f.onClose };
  const view = render(<PlanForm patient={f.patient} {...props} />);
  openDrug();
  fireEvent.change(screen.getByLabelText("Содержание назначения"), {
    target: { value: "Сохранить мой текст" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Уточнить в карте" }));
  fireEvent.change(screen.getByLabelText("Текущие препараты"), {
    target: { value: "Со слов пациента: учебное уточнение" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Профиль и контекст пациента" }),
    ).toBeNull(),
  );
  expect(f.mutate.mock.calls.map((call) => call[1].type)).toEqual([
    "profile.update",
  ]);
  expect(f.onClose).not.toHaveBeenCalled();
  view.rerender(<PlanForm patient={f.patient} {...props} />);
  expect(
    (screen.getByLabelText("Содержание назначения") as HTMLTextAreaElement)
      .value,
  ).toBe("Сохранить мой текст");
  expect(screen.getByText("Данные карты изменились")).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Проверка Авиандра" })).getByText(
      "Со слов пациента: учебное уточнение",
      { selector: "dd" },
    ),
  ).toBeTruthy();
});
