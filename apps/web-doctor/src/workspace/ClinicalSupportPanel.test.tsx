import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ClinicalSupportPanel } from "./ClinicalSupportPanel";
import { demoActor, seedPatients } from "./seed";
import type { ClinicalEvaluation } from "./clinical-support-types";
import type { WorkspaceActions } from "./useWorkspace";
import { supportCatalog, supportContextKey } from "./clinical-support-engine";

afterEach(cleanup);
function fixture() {
  const patient = seedPatients(new Date("2026-10-26T09:00:00Z"))[0]!;
  const mutate = vi.fn(async () => patient);
  const actions = {
    busy: false,
    mutate,
    actor: demoActor,
  } as unknown as WorkspaceActions;
  return { patient, mutate, actions };
}
function currentEvaluation(f: ReturnType<typeof fixture>): ClinicalEvaluation {
  return {
    id: "first",
    contextKey: supportContextKey(f.patient, demoActor),
    catalogVersion: supportCatalog.version,
    sources: structuredClone(supportCatalog.sources),
    createdAt: "2026-10-26T09:00:00Z",
    by: demoActor,
    input: {
      route: "gad",
      observations: [],
      functioning: "unknown",
      depressionSeverity: "unknown",
      response: "unknown",
      preference: "undecided",
      note: "",
    },
    result: {
      diagnosisConfirmed: false,
      findings: [],
      recognizedMedicines: [],
      unknownMedicines: [],
      options: [
        { ...supportCatalog.options[0]!, status: "discuss", reasons: [] },
      ],
    },
  };
}
it("disables decisions on a stale saved clinical evaluation", () => {
  const f = fixture();
  f.patient.clinicalSupport = {
    evaluations: [
      {
        id: "old-evaluation",
        contextKey: "old-context",
        catalogVersion: "old",
        createdAt: "2026-10-25T09:00:00Z",
        by: demoActor,
        input: {
          route: "gad",
          observations: [],
          functioning: "unknown",
          depressionSeverity: "unknown",
          response: "unknown",
          preference: "undecided",
          note: "",
        },
        sources: [],
        result: {
          diagnosisConfirmed: false,
          findings: [],
          recognizedMedicines: [],
          unknownMedicines: [],
          options: [
            {
              id: "cbt",
              title: "Когнитивно-поведенческая терапия",
              routes: ["gad"],
              kind: "psychotherapy",
              position: "first",
              summary: "Обсудить вариант",
              drugClasses: [],
              monitoring: [],
              sourceIds: [],
              status: "discuss",
              reasons: [],
            },
          ],
        },
      } satisfies ClinicalEvaluation,
    ],
    decisions: [],
    adverseEvents: [],
  };
  render(
    <ClinicalSupportPanel
      patient={f.patient}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  expect(screen.getByText(/Оценка устарела/)).toBeTruthy();
  for (const name of ["Принять", "Отклонить", "Отложить"]) {
    const button = screen.getByRole("button", { name });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(f.mutate).not.toHaveBeenCalled();
});
it("requires a seriousness criterion and keeps seriousness separate from symptom severity", async () => {
  const f = fixture();
  render(
    <ClinicalSupportPanel
      patient={f.patient}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Записать нежелательное явление" }),
  );
  fireEvent.change(screen.getByLabelText(/^Симптомы и проявления/), {
    target: { value: "Выраженная сонливость" },
  });
  fireEvent.change(screen.getByLabelText("Выраженность симптомов"), {
    target: { value: "severe" },
  });
  fireEvent.change(screen.getByLabelText(/^Серьёзность исхода/), {
    target: { value: "serious" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить явление" }));
  expect(
    await screen.findByText("Укажите хотя бы один критерий серьёзности."),
  ).toBeTruthy();
  expect(f.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Госпитализация или её продление" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Сохранить явление" }));
  await waitFor(() => expect(f.mutate).toHaveBeenCalledOnce());
  const call = f.mutate.mock.calls[0] as unknown as [
    string,
    {
      type: string;
      input: { severity: string; seriousness: string; criteria: string[] };
    },
  ];
  expect(call[1].type).toBe("support.adverse");
  expect(call[1].input).toMatchObject({
    severity: "severe",
    seriousness: "serious",
    criteria: ["hospitalization"],
  });
});
it("submits unknown observations without silently treating missing information as no", async () => {
  const f = fixture();
  render(
    <ClinicalSupportPanel
      patient={f.patient}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Сопоставить варианты" }));
  await waitFor(() => expect(f.mutate).toHaveBeenCalledOnce());
  const call = f.mutate.mock.calls[0] as unknown as [
    string,
    { type: string; input: { observations: { answer: string }[] } },
  ];
  expect(call[1].type).toBe("support.evaluate");
  expect(call[1].input.observations).toHaveLength(20);
  expect(call[1].input.observations.every((o) => o.answer === "unknown")).toBe(
    true,
  );
});
it("does not transfer an open decision to a newer evaluation received in another session", () => {
  const f = fixture();
  const evaluation = currentEvaluation(f);
  f.patient.clinicalSupport = {
    evaluations: [evaluation],
    decisions: [],
    adverseEvents: [],
  };
  const view = render(
    <ClinicalSupportPanel
      patient={f.patient}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Принять" }));
  const changed = structuredClone(f.patient);
  changed.revision++;
  changed.clinicalSupport!.evaluations.push({
    ...structuredClone(evaluation),
    id: "second",
  });
  view.rerender(
    <ClinicalSupportPanel
      patient={changed}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  const save = screen.getByRole("button", { name: "Сохранить решение" });
  expect((save as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save);
  expect(f.mutate).not.toHaveBeenCalled();
});
it("sends an explicit referral decision without issuing the referral", async () => {
  const f = fixture();
  const evaluation = currentEvaluation(f);
  evaluation.result.findings = [
    {
      id: "route",
      kind: "routing",
      priority: "important",
      title: "Оценка психиатра",
      detail: "Клиническое основание",
      sourceIds: ["depression-ru"],
      relatedIds: [],
      category: "required",
      action: "consultation",
    },
  ];
  f.patient.clinicalSupport = {
    evaluations: [evaluation],
    decisions: [],
    adverseEvents: [],
  };
  render(
    <ClinicalSupportPanel
      patient={f.patient}
      actor={demoActor}
      actions={f.actions}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Подготовить направление" }),
  );
  expect(f.mutate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Сохранить решение о направлении" }),
  );
  await waitFor(() => expect(f.mutate).toHaveBeenCalledOnce());
  const call = f.mutate.mock.calls[0] as unknown as [
    string,
    { type: string; evaluationId: string; findingId: string; decision: string },
  ];
  expect(call[1]).toMatchObject({
    type: "support.route",
    evaluationId: "first",
    findingId: "route",
    decision: "accept",
  });
});
