import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PatientJournal } from "./PatientJournal";
import { createPatient } from "./commands";
import { demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";
import type { SelfReport } from "./model";

it("показывает последнее полученное исправление, сохраняя предыдущие ответы и просмотр в истории", () => {
  const now = "2026-10-27T10:00:00.000Z";
  const patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "versions",
  );
  const report = (
    id: string,
    receivedAt: string,
    note: string,
    entityId = "report:2026-10-27",
  ) =>
    ({
      id,
      createdAt: receivedAt,
      author: "Пациент",
      reportedAt: now,
      receivedAt,
      provenance: "patient",
      state: "completed",
      mood: null,
      anxiety: null,
      sleepHours: null,
      functioning: "",
      medication: "no-mark",
      medicationReason: "",
      adverseEffects: "",
      note,
      safetyConcern: false,
      reviewedAt: "",
      mobile: {
        id,
        entityId,
        day: "2026-10-27",
        formVersion: "syncli-report-v1",
        reportedAt: now,
        fields: {
          feeling: { valence: 4, energy: 2 },
          sleep: "Обычно",
          anxiety: 3,
          functioning: 7,
          tolerability: "Без трудностей",
        },
        label: "",
        note,
      },
    }) as SelfReport;
  const old = report("old", now, "Первая версия");
  old.safetyConcern = true;
  const updated = report(
    "new",
    "2026-10-27T11:00:00.000Z",
    "Исправленная версия",
  );
  updated.reportedAt = "2026-10-26T09:00:00.000Z";
  patient.reports.push(
    updated,
    old,
    report("separate", now, "Отдельная запись", "another"),
  );
  const mutate = vi.fn().mockResolvedValue(undefined);
  render(
    <PatientJournal
      patient={patient}
      actions={{ mutate } as unknown as WorkspaceActions}
    />,
  );
  const history = screen.getByText("История изменений · 1").closest("details")!;
  expect(history.open).toBe(false);
  expect(within(history).getByText("Первая версия")).toBeTruthy();
  expect(within(history).getByText(/Отмечен вопрос безопасности/)).toBeTruthy();
  const current = screen.getByText("Исправленная версия").closest("article")!;
  expect(
    within(current).getByText("Есть прежняя запись с вопросом безопасности"),
  ).toBeTruthy();
  expect(screen.getByText("Отдельная запись").closest("article")).not.toBe(
    current,
  );
  fireEvent.click(
    within(history).getByRole("button", { name: "Отметить просмотр" }),
  );
  expect(mutate).toHaveBeenCalledWith(patient.id, {
    type: "report.review",
    id: "old",
  });
  expect(patient.reports).toHaveLength(3);
  expect(patient.reports.map((r) => r.id)).toEqual(["new", "old", "separate"]);
});

it("показывает исходные ответы мобильного самоотчёта без пересчёта сна и состояния", () => {
  const now = "2026-10-26T10:00:00.000Z";
  const patient = createPatient(
    { name: "Синтетический пациент", birthDate: "1990-01-01" },
    demoActor,
    now,
    "test-mobile-report",
  );
  patient.reports.push({
    id: "report-1",
    createdAt: now,
    author: "Пациент",
    reportedAt: now,
    receivedAt: now,
    provenance: "patient",
    state: "completed",
    mood: null,
    anxiety: null,
    sleepHours: null,
    functioning: "",
    medication: "no-mark",
    medicationReason: "",
    adverseEffects: "",
    note: "Заметка",
    safetyConcern: false,
    reviewedAt: "",
    mobile: {
      id: "report-1",
      entityId: "report:2026-10-26",
      day: "2026-10-26",
      formVersion: "syncli-report-v1",
      reportedAt: now,
      fields: {
        feeling: { valence: 4, energy: 2 },
        sleep: "Обычно",
        anxiety: 3,
        functioning: 7,
        tolerability: "Без трудностей",
      },
      note: "Заметка",
      label: "",
    },
  });
  render(
    <PatientJournal
      patient={patient}
      actions={{ mutate: vi.fn() } as unknown as WorkspaceActions}
    />,
  );
  expect(screen.getByText(/радость 4 \/ 6, энергия 2 \/ 6/)).toBeTruthy();
  expect(screen.getByText("Сон: Обычно")).toBeTruthy();
  expect(screen.getByText("Тревога: 3 / 10")).toBeTruthy();
  expect(screen.getByText("Силы на дела: 7 / 10")).toBeTruthy();
  expect(screen.getByText("Переносимость: Без трудностей")).toBeTruthy();
  expect(screen.queryByText(/Сон: нет данных/)).toBeNull();
});
