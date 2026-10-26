import type { Actor, PlanItem, Provenance } from "./model";

export const clinicalSignals = [
  "suicidalIntent",
  "suicidePlan",
  "recentAttempt",
  "unableStaySafe",
  "severeSelfNeglect",
  "currentMania",
  "maniaHistory",
  "psychosis",
  "confusion",
  "substanceProblem",
  "pregnancy",
  "breastfeeding",
  "renalImpairment",
  "hepaticImpairment",
  "qtRisk",
  "seizures",
  "bleedingRisk",
  "medicationListComplete",
  "priorAdequateTrial",
  "treatmentWorsening",
] as const;
export type ClinicalSignal = (typeof clinicalSignals)[number];
export type SupportAnswer = "yes" | "no" | "unknown";
export interface ClinicalObservation {
  key: ClinicalSignal;
  answer: SupportAnswer;
  provenance: Provenance;
  observedAt: string;
  note: string;
}
export interface SupportInput {
  route: "gad" | "depression";
  observations: ClinicalObservation[];
  functioning: "preserved" | "impaired" | "severely-impaired" | "unknown";
  depressionSeverity: "less-severe" | "more-severe" | "unknown";
  response:
    "not-started" | "improving" | "no-response" | "worsening" | "unknown";
  preference: "psychological" | "medication" | "combined" | "undecided";
  note: string;
}
export interface SupportSource {
  id: string;
  title: string;
  version: string;
  url: string;
  section: string;
  limitation: string;
}
export interface SupportOption {
  id: string;
  routes: ("gad" | "depression")[];
  title: string;
  kind: "medication" | "psychotherapy" | "lifestyle" | "follow-up";
  position: "first" | "alternative" | "adjunct";
  summary: string;
  drugClasses: string[];
  monitoring: string[];
  sourceIds: string[];
}
export interface SupportDrugClass {
  id: string;
  title: string;
  inns: string[];
}
export interface SupportInteraction {
  id: string;
  left: string;
  right: string;
  title: string;
  detail: string;
  sourceIds: string[];
}
export interface SupportCatalog {
  version: string;
  status: "literature-reviewed";
  sources: SupportSource[];
  options: SupportOption[];
  drugClasses: SupportDrugClass[];
  interactions: SupportInteraction[];
}
export interface SupportFinding {
  id: string;
  kind:
    | "safety"
    | "routing"
    | "interaction"
    | "allergy"
    | "monitoring"
    | "data-gap";
  priority: "routine" | "important" | "urgent";
  title: string;
  detail: string;
  sourceIds: string[];
  relatedIds: string[];
  category?: "required" | "desirable";
  action: "verify" | "discuss" | "consultation" | "followup";
}
export interface SupportOptionResult extends SupportOption {
  status: "discuss" | "clarify" | "defer";
  reasons: string[];
}
export interface SupportResult {
  options: SupportOptionResult[];
  findings: SupportFinding[];
  recognizedMedicines: {
    id: string;
    title: string;
    inn: string;
    classes: string[];
    provenance: string;
  }[];
  unknownMedicines: string[];
  diagnosisConfirmed: boolean;
}
export interface ClinicalEvaluation {
  id: string;
  input: SupportInput;
  result: SupportResult;
  contextKey: string;
  catalogVersion: string;
  sources: SupportSource[];
  createdAt: string;
  by: Actor;
}
export interface SupportDecision {
  id: string;
  evaluationId: string;
  optionId: string;
  decision: "accept" | "decline" | "defer";
  reason: string;
  planId: string;
  createdAt: string;
  by: Actor;
  option: SupportOptionResult;
}
export const seriousnessCriteria = [
  "death",
  "life-threatening",
  "hospitalization",
  "disability",
  "congenital",
  "medically-important",
] as const;
export interface AdverseEventInput {
  symptoms: string;
  onsetAt: string;
  suspectPlanIds: string[];
  severity: "mild" | "moderate" | "severe" | "unknown";
  seriousness: "unknown" | "not-serious" | "serious";
  criteria: (typeof seriousnessCriteria)[number][];
  outcome:
    "unknown" | "ongoing" | "recovering" | "recovered" | "sequelae" | "fatal";
  dechallenge: "unknown" | "not-done" | "improved" | "unchanged";
  rechallenge: "unknown" | "not-done" | "recurred" | "not-recurred";
  causality:
    | "unassessed"
    | "unlikely"
    | "possible"
    | "probable"
    | "certain"
    | "unclassifiable";
  provenance: Provenance;
  assessment: string;
}
export interface AdverseEventVersion {
  version: number;
  input: AdverseEventInput;
  plans: PlanItem[];
  createdAt: string;
  by: Actor;
  reason: string;
}
export interface AdverseEventRecord {
  id: string;
  eventId: string;
  versions: AdverseEventVersion[];
}
export interface ClinicalSupportState {
  routeDecisions?: {
    id: string;
    evaluationId: string;
    findingId: string;
    decision: "accept" | "decline" | "defer";
    reason: string;
    referralId: string;
    createdAt: string;
    by: Actor;
    finding: SupportFinding;
  }[];
  evaluations: ClinicalEvaluation[];
  decisions: SupportDecision[];
  adverseEvents: AdverseEventRecord[];
}
export type ClinicalSupportMutation =
  | {
      type: "support.route";
      id: string;
      evaluationId: string;
      findingId: string;
      decision: "accept" | "decline" | "defer";
      reason: string;
    }
  | { type: "support.evaluate"; id: string; input: SupportInput }
  | {
      type: "support.decide";
      id: string;
      evaluationId: string;
      optionId: string;
      decision: SupportDecision["decision"];
      reason: string;
    }
  | {
      type: "support.adverse";
      id: string;
      expectedVersion: number;
      input: AdverseEventInput;
      reason: string;
    };
