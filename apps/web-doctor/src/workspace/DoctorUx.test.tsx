import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PatientView } from "./PatientView";
import { Events } from "./Events";
import { seedPatients, demoActor } from "./seed";
import type { WorkspaceActions } from "./useWorkspace";

const now = new Date("2026-10-24T10:00:00Z");
const actions = {
  actor: demoActor,
  busy: false,
  mutate: vi.fn(),
} as unknown as WorkspaceActions;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("opens the existing in-progress visit from the patient header instead of creating a duplicate", () => {
  const patient = seedPatients(now)[0]!;
  const visit = patient.visits.find((v) => v.status === "scheduled")!;
  visit.status = "in-progress";
  const navigate = vi.fn();
  render(
    <PatientView
      patient={patient}
      actor={demoActor}
      actions={actions}
      navigate={navigate}
      server={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Продолжить приём" }));
  expect(navigate).toHaveBeenCalledWith(
    `/patients/${patient.id}/visits/${visit.id}`,
  );
  expect(actions.mutate).not.toHaveBeenCalled();
});
it("opens a medication draft directly from the patient card", () => {
  const patient = seedPatients(now)[0]!;
  render(
    <PatientView
      patient={patient}
      actor={demoActor}
      actions={actions}
      navigate={vi.fn()}
      server={false}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Назначить препарат" }));
  const dialog = screen.getByRole("dialog");
  expect(
    (within(dialog).getByLabelText("Тип назначения") as HTMLSelectElement)
      .value,
  ).toBe("medication");
  expect(
    within(dialog).getByRole("button", { name: "Выбрать Авиандр" }),
  ).toBeTruthy();
});
it("filters overdue tasks without treating the deadline as clinical urgency", () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const patient = seedPatients(now)[1]!;
  const event = patient.events[0]!;
  event.dueAt = new Date(now.getTime() - 1000).toISOString();
  event.urgency = "important";
  patient.events.push({
    ...structuredClone(event),
    id: "closed",
    title: "Закрытая задача",
    status: "closed",
  });
  render(<Events patients={[patient]} actions={actions} navigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Просрочено/ }));
  expect(screen.getByText(event.title)).toBeTruthy();
  expect(screen.queryByText("Закрытая задача")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Срочно/ }));
  expect(screen.queryByText(event.title)).toBeNull();
  expect(screen.getByText("Срочных событий нет")).toBeTruthy();
});

it("uses local calendar days for Today and excludes equality and closed tasks from Overdue", () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const patient = seedPatients(now)[1]!;
  const event = patient.events[0]!;
  event.dueAt = now.toISOString();
  event.title = "Срок ровно сейчас";
  event.urgency = "routine";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  patient.events.push({
    ...structuredClone(event),
    id: "tomorrow",
    title: "Завтра",
    dueAt: tomorrow.toISOString(),
    urgency: "urgent",
  });
  render(<Events patients={[patient]} actions={actions} navigate={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Просрочено/ }));
  expect(screen.queryByText("Срок ровно сейчас")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Сегодня/ }));
  expect(screen.getByText("Срок ровно сейчас")).toBeTruthy();
  expect(screen.queryByText("Завтра")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Срочно/ }));
  expect(screen.getByText("Завтра")).toBeTruthy();
});
