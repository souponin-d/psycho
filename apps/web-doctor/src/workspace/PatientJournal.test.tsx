import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PatientJournal } from "./PatientJournal";
import { createPatient } from "./commands";
import { demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

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
