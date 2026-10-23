export type Scale = "PHQ-9" | "GAD-7";
export type Group =
  | "Тревожная симптоматика"
  | "Депрессивная симптоматика"
  | "Смешанная симптоматика";
export type Department = { id: string; name: string };
export type Doctor = {
  id: string;
  name: string;
  departmentId: string;
  capacity: number;
};
export type Patient = {
  id: string;
  name: string;
  doctorId: string;
  group: Group;
  ageBand: string;
  enrolled: string;
  closed: string | null;
};
export type ExpectedForm = { id: string; patientId: string; day: string };
export type Report = {
  id: string;
  patientId: string;
  expectedId: string;
  day: string;
  mood: string;
  note: string;
};
export type Visit = {
  id: string;
  patientId: string;
  day: string;
  time: string;
  status: "done" | "cancelled" | "missed" | "scheduled";
  kind: "Первичный" | "Повторный";
};
export type Observation = {
  id: string;
  patientId: string;
  day: string;
  scale: Scale;
  version: string;
  value: number;
};
export type Signal = {
  id: string;
  patientId: string;
  day: string;
  title: string;
  status: "open" | "accepted" | "closed";
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
};
export type ClinicDataset = {
  scenario: "normal" | "empty" | "long";
  departments: Department[];
  doctors: Doctor[];
  patients: Patient[];
  expectedForms: ExpectedForm[];
  reports: Report[];
  visits: Visit[];
  observations: Observation[];
  signals: Signal[];
  outages: string[];
};
export type ClinicFilter = {
  from: string;
  to: string;
  departmentId: string;
  doctorId: string;
  group: string;
};
export type DemoCommand =
  | {
      id: string;
      kind: "report";
      patientId: string;
      expectedId: string;
      day: string;
      mood: string;
      note: string;
      requestContact: boolean;
      at: string;
    }
  | { id: string; kind: "accept" | "respond"; signalId: string; at: string }
  | {
      id: string;
      kind: "schedule";
      patientId: string;
      day: string;
      time: string;
      at: string;
    }
  | {
      id: string;
      kind: "roles";
      employeeId: string;
      before: ("coordinator" | "director" | "system")[];
      after: ("coordinator" | "director" | "system")[];
      at: string;
    }
  | { id: string; kind: "request"; patientId: string; at: string };
export const dayNumber = (day: string) =>
  Date.parse(`${day}T00:00:00Z`) / 86400000;
export const addDays = (day: string, amount: number) =>
  new Date((dayNumber(day) + amount) * 86400000).toISOString().slice(0, 10);
export const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
export const timeLabel = (stamp: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(stamp));
