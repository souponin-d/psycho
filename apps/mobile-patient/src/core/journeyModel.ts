import type { ChatMessage } from "./chat.ts";
import type { FeelingPoint } from "./feelings.ts";

export type DayKey = string;
export type Instant = { utcMs: number; zone: string; offsetMinutes: number };
export type ReportField =
  "feeling" | "sleep" | "anxiety" | "functioning" | "tolerability";
export type FormId = "gad7" | "phq9";
export type QuestionnaireAssignment = {
  id: string;
  day: DayKey;
  formId: FormId;
  questionCount: number;
};
export type PlanVersion = {
  id: string;
  status?: "unavailable";
  effectiveFrom?: DayKey;
  startedAt: DayKey;
  doctor: string;
  medication: {
    name: string;
    dosageLabel: string;
    slots: { id: string; time: string; label: string }[];
  };
  reportFields: ReportField[];
  tests: QuestionnaireAssignment[];
  visit: { day: DayKey; time: string; specialist: string; place: string };
};
export type ReportFields = {
  feeling?: FeelingPoint;
  sleep?: string;
  anxiety?: number;
  functioning?: number;
  tolerability?: string;
};
type EventBase = {
  id: string;
  entityId?: string;
  day: DayKey;
  at: number;
  recordedDay: DayKey;
  gameEligible?: boolean;
};
export type DoseEvent = EventBase & {
  kind: "dose";
  source?: "notification";
  action?: "select" | "correct";
  slotId: string;
  status: "taken" | "missed" | "unknown";
  occurredAt?: string;
  note?: string;
};
export type ReportEvent = EventBase & {
  kind: "report";
  source?: "server";
  fields: ReportFields;
  note: string;
  required: boolean;
  label?: string;
  deleted?: boolean;
};
export type QuestionnaireEvent = EventBase & {
  kind: "questionnaire";
  assignmentId: string;
  formId: FormId;
  answers: number[];
  formVersion?: string;
  impact?: number;
};
export type ContactEvent = EventBase & {
  kind: "contact";
  description: string;
  severity: "Лёгкая" | "Заметная" | "Сильная";
  preference: "planned" | "earlier";
  onset: DayKey;
};
export type PatientEvent =
  DoseEvent | ReportEvent | QuestionnaireEvent | ContactEvent;
export type DayAssessment = {
  day: DayKey;
  complete: boolean;
  missing: string[];
};
export type ClosedDay = DayAssessment & { sealedAt: number };
export type Reward = { id: string; itemId: string; day: DayKey };
export type Placement = {
  instanceId: string;
  itemId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
};
export type Outfit = { color: string; clothing: string; accessory: string };
export type WorldSection = {
  anchorDay: DayKey;
  territory: "shore" | "garden";
  ambience?: "morning" | "dusk" | "mist";
  flora?: "flowers" | "ferns";
  placements: Placement[];
};
export type WorldState = {
  anchorDay?: DayKey;
  sections?: WorldSection[];
  territory: "shore" | "garden";
  ambience?: "morning" | "dusk" | "mist";
  flora?: "flowers" | "ferns";
  placements: Placement[];
  outfits: { fluffy: Outfit; cloud: Outfit };
};
export type ContactDraftFields = {
  description: string;
  onset: DayKey;
  severity?: ContactEvent["severity"];
  preference?: ContactEvent["preference"];
};
export type PatientDraft = {
  id: string;
  day: DayKey;
  kind: "report" | "questionnaire" | "contact";
  step?: number;
  formVersion?: string;
  contact?: ContactDraftFields;
  fields?: ReportFields;
  note?: string;
  label?: string;
  answers?: (number | null)[];
  impact?: number;
};
export type LegacyRecord = {
  id: string;
  day: string;
  time: string;
  mood: string;
  sleep: string;
  note: string;
  label?: string;
  feeling?: FeelingPoint;
};
export type OnboardingProgress = {
  version: 1;
  step: number;
  name: string;
  goal: string;
  code: string;
  morning: string;
  practiceDose: boolean;
  practiceFeeling?: FeelingPoint;
  practiceItem: { x: number; y: number };
  completed: boolean;
};
export type JourneyState = {
  chat?: ChatMessage[];
  chatDraft?: string;
  onboarding?: OnboardingProgress;
  shown?: Record<string, true>;
  version: 2;
  scenarioId: string;
  seedDay: DayKey;
  connected: boolean;
  goal: string;
  plan: PlanVersion;
  planVersions?: PlanVersion[];
  events: PatientEvent[];
  closedDays: Record<DayKey, ClosedDay>;
  lastObservedDay: DayKey;
  rewards: Reward[];
  drafts: Record<string, PatientDraft>;
  world: WorldState;
  legacyArchive: LegacyRecord[];
  activity?: Partial<Record<"history" | "question" | "customized", true>>;
};
export type PatientCommand =
  | { type: "chat:append"; messages: ChatMessage[] }
  | { type: "chat:draft"; text: string }
  | { type: "chat:clear" }
  | {
      type: "event";
      draftId?: string;
      event:
        | Omit<DoseEvent, "at" | "recordedDay">
        | Omit<ReportEvent, "at" | "recordedDay">
        | Omit<QuestionnaireEvent, "at" | "recordedDay">
        | Omit<ContactEvent, "at" | "recordedDay">;
    }
  | { type: "draft"; draft: PatientDraft }
  | { type: "server:reports"; reports: ReportEvent[] }
  | { type: "draft:remove"; id: string }
  | { type: "connect"; code: string }
  | { type: "goal"; goal: string }
  | { type: "world"; world: WorldState }
  | { type: "world:section"; day: DayKey }
  | { type: "activity"; activity: "history" | "question" }
  | { type: "onboarding:save"; progress: OnboardingProgress }
  | { type: "seen"; key: string }
  | { type: "tick" }
  | { type: "reset" };
