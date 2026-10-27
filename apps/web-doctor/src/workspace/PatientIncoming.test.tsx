import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createPatient } from "./commands";
import { demoActor } from "./seed";
import { PatientIncoming, patientIncoming } from "./PatientIncoming";
import type { PatientRecord } from "./model";

it("показывает сообщения, самоотчёты, шкалы и отметки пациента с переходом в раздел", () => {
  const patient = createPatient(
    { name: "Анна Тестова", birthDate: "1990-01-01" },
    demoActor,
    "2026-10-01T00:00:00Z",
    "incoming",
  );
  patient.messages.push({
    id: "msg",
    createdAt: "2026-10-02T12:00:00Z",
    author: "Пациент",
    direction: "patient",
    text: "Вопрос врачу",
    status: "recorded",
    deliveredAt: "",
    readAt: "",
  });
  patient.reports.push({
    id: "report",
    createdAt: "2026-10-03T12:00:00Z",
    author: "Пациент",
    reportedAt: "2026-10-03T12:00:00Z",
    receivedAt: "2026-10-03T12:00:00Z",
    provenance: "patient",
    state: "completed",
    mood: null,
    anxiety: null,
    sleepHours: null,
    functioning: "",
    medication: "no-mark",
    medicationReason: "",
    adverseEffects: "",
    note: "Дневник",
    safetyConcern: false,
    reviewedAt: "",
  });
  patient.workflow = {
    mode: "synthetic",
    assessments: [
      {
        id: "scale",
        receivedAt: "2026-10-04T12:00:00Z",
        receivedBy: { id: "p", name: "Пациент", specialty: "patient" },
        source: { title: "GAD-7" },
      },
    ],
    recommendations: [],
    safety: [],
    assignments: [],
    contacts: [],
    serial: 0,
  } as unknown as PatientRecord["workflow"];
  patient.adherence = {
    schedules: [],
    records: [
      {
        id: "dose",
        scheduleId: "s",
        scheduleVersion: 1,
        plannedAt: "2026-10-05T09:00:00Z",
        version: 1,
        status: "taken",
        reportedAt: "2026-10-05T12:00:00Z",
        provenance: "patient",
        reason: "",
        history: [
          {
            version: 1,
            status: "taken",
            reportedAt: "2026-10-05T12:00:00Z",
            provenance: "patient",
            reason: "",
            at: "2026-10-05T12:00:00Z",
            by: { id: "p", name: "Пациент", specialty: "patient" },
          },
        ],
      },
    ],
  } as unknown as PatientRecord["adherence"];
  const navigate = vi.fn();
  render(<PatientIncoming patients={[patient]} navigate={navigate} />);
  expect(screen.getByText("Вопрос врачу")).toBeTruthy();
  expect(screen.getByText("Дневник")).toBeTruthy();
  expect(screen.getByText("GAD-7")).toBeTruthy();
  expect(screen.getByText(/Отметка о приёме/)).toBeTruthy();
  const item = screen.getByText("Вопрос врачу").closest("article")!;
  fireEvent.click(within(item).getByRole("button", { name: "Открыть" }));
  expect(navigate).toHaveBeenCalledWith(`/patients/${patient.id}/messages`);
  expect(screen.getAllByRole("article").map((row) => row.textContent)).toEqual([
    expect.stringContaining("Отметка о приёме"),
    expect.stringContaining("GAD-7"),
    expect.stringContaining("Дневник"),
    expect.stringContaining("Вопрос врачу"),
  ]);
  for (const [text, target] of [
    ["Дневник", "journal"],
    ["GAD-7", "overview"],
    [/Принял/, "plan"],
  ]) {
    const row = screen.getByText(text!).closest("article")!;
    fireEvent.click(within(row).getByRole("button", { name: "Открыть" }));
    expect(navigate).toHaveBeenLastCalledWith(
      `/patients/${patient.id}/${target}`,
    );
  }
});

it("не показывает данные архивной карты и сообщения врача", () => {
  const patient = createPatient(
    { name: "Архив", birthDate: "1990-01-01" },
    demoActor,
    "2026-10-01T00:00:00Z",
    "archive",
  );
  patient.messages.push({
    id: "doctor",
    createdAt: "2026-10-02T12:00:00Z",
    author: "Врач",
    direction: "doctor",
    text: "Ответ врача",
    status: "recorded",
    deliveredAt: "",
    readAt: "",
  });
  render(<PatientIncoming patients={[patient]} navigate={vi.fn()} />);
  expect(screen.queryByText("Ответ врача")).toBeNull();
  patient.archived = true;
  patient.messages[0]!.direction = "patient";
  expect(patientIncoming([patient])).toEqual([]);
});

it("помечает исправленную отметку как предыдущую и указывает назначение", () => {
  const patient = createPatient(
    { name: "Анна Тестова", birthDate: "1990-01-01" },
    demoActor,
    "2026-10-01T00:00:00Z",
    "history",
  );
  patient.adherence = {
    schedules: [{ id: "s", version: 1, planSnapshot: { title: "Препарат А" } }],
    records: [
      {
        id: "dose",
        scheduleId: "s",
        scheduleVersion: 1,
        plannedAt: "2026-10-05T09:00:00Z",
        version: 2,
        history: [
          {
            version: 1,
            status: "taken",
            at: "2026-10-05T12:00:00Z",
            by: { specialty: "patient" },
          },
          {
            version: 2,
            status: "missed",
            at: "2026-10-05T13:00:00Z",
            by: { specialty: "patient" },
          },
        ],
      },
    ],
  } as unknown as PatientRecord["adherence"];
  const rows = patientIncoming([patient]);
  expect(rows).toHaveLength(2);
  expect(rows[0]!.detail).toContain("Препарат А");
  expect(rows[0]!.detail).toContain("Пропустил");
  expect(rows[0]!.detail).not.toContain("Предыдущая отметка");
  expect(rows[1]!.detail).toContain("Предыдущая отметка: Принял");
});
