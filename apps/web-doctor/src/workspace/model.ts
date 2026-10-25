export type Provenance = "patient" | "clinician" | "relative" | "document";
export type Urgency = "routine" | "important" | "urgent";
export type VisitStatus =
  "scheduled" | "in-progress" | "completed" | "cancelled";
export type EventStatus =
  "created" | "acknowledged" | "assessed" | "acted" | "closed";
export type PlanKind =
  "medication" | "psychotherapy" | "assessment" | "lifestyle" | "follow-up";
export type ScaleKey =
  | "PHQ-9"
  | "GAD-7"
  | "HARS"
  | "HDRS-17"
  | "MADRS"
  | "HCL-32"
  | "HCL-33"
  | "YMRS"
  | "C-SSRS"
  | "CGI"
  | "KOP-25"
  | "custom";

export interface Actor {
  id: string;
  name: string;
  specialty: "psychiatrist" | "physician";
  clinicId: string;
}
export interface Stamp {
  id: string;
  createdAt: string;
  author: string;
}
export interface Evidence {
  sourceIds: string[];
  rationale: string;
}
export interface Profile {
  name: string;
  birthDate: string;
  sex: "female" | "male" | "unspecified";
  phone: string;
  email: string;
  occupation: string;
  address: string;
  emergencyContact: string;
  representative: string;
  preferredContact: string;
  allergies: string;
  conditions: string;
  currentMedication: string;
  familyHistory: string;
  pastEpisodes: string;
  substanceUse: string;
  socialContext: string;
  reproductiveContext: string;
  goals: string;
}
export interface Episode extends Stamp {
  title: string;
  startedOn: string;
  status: "active" | "remission" | "closed";
  phase: "assessment" | "acute" | "continuation" | "maintenance";
  diagnosis: string;
  diagnosisStatus: "hypothesis" | "confirmed";
  endDate: string;
  summary: string;
}
export const encounterFields = [
  "complaints",
  "history",
  "onset",
  "functioning",
  "mentalState",
  "physicalState",
  "sleep",
  "substances",
  "medicationReview",
  "adverseEffects",
  "adherence",
  "mania",
  "psychosis",
  "somaticCauses",
  "suicidalThoughts",
  "intentAndPlan",
  "pastAttempts",
  "meansAccess",
  "protectiveFactors",
  "safetyConclusion",
  "safetyAction",
  "diagnosis",
  "differential",
  "conclusion",
  "recommendations",
  "patientPreference",
] as const;
export type EncounterField = (typeof encounterFields)[number];
export type EncounterNotes = Record<EncounterField, string>;
export interface Visit extends Stamp, Evidence {
  episodeId: string;
  scheduledAt: string;
  durationMinutes: number;
  kind: "initial" | "follow-up" | "unscheduled";
  format: "in-person" | "remote";
  status: VisitStatus;
  reason: string;
  notes: EncounterNotes;
  provenance: Provenance;
  nextVisitAt: string;
  completedAt: string;
  startedAt: string;
  confirmedBy: string;
  cancellationReason: string;
  addenda: (Stamp & { text: string; reason: string })[];
  /** Server/domain snapshot captured once when the visit is completed. */
  completionSnapshot?: {
    patientName: string;
    measurements: Measurement[];
    plan: PlanItem[];
    referrals: Referral[];
  } | null;
}
export interface Measurement extends Stamp {
  visitId: string;
  scale: ScaleKey;
  title: string;
  version: string;
  measuredAt: string;
  score: number | null;
  maximum: number | null;
  answers: (number | null)[];
  completeness: "complete" | "partial" | "not-assessed";
  assessor: "patient" | "clinician";
  window: string;
  sourceId: string;
  interpretation: string;
  provenance: Provenance;
  externalForm: string;
}
export interface PlanItem extends Stamp, Evidence {
  visitId: string;
  kind: PlanKind;
  title: string;
  details: string;
  dose: string;
  schedule: string;
  startDate: string;
  endDate: string;
  dueDate: string;
  status: "draft" | "confirmed" | "completed" | "stopped";
  confirmedAt: string;
  confirmedBy: string;
  changeReason: string;
  replacesId: string;
  instructionUrl: string;
  patientInstructions: string;
  /** Preparatory information only; never activates clinical rules. */
  aviandrReview?: AviandrReview;
}
export type ReviewAnswer = "unknown" | "yes" | "no";
export interface AviandrInputs {
  indication: "unknown" | "gad" | "post-covid" | "other";
  hypersensitivity: ReviewAnswer;
  epilepsy: ReviewAnswer;
  organicBrainDisease: ReviewAnswer;
  liverFailure: ReviewAnswer;
  pregnancy: ReviewAnswer;
  breastfeeding: ReviewAnswer;
  galactoseDisorder: ReviewAnswer;
  cardiovascularDisease: ReviewAnswer;
  maoUse: ReviewAnswer;
  lastMaoDate: string;
  serotonergic: ReviewAnswer;
  sedative: ReviewAnswer;
  cyp2d6: ReviewAnswer;
  alcohol: ReviewAnswer;
  medicationListVerified: ReviewAnswer;
  egfr: number | null;
  egfrUnit: "unknown" | "ml/min" | "ml/min/1.73m2";
  egfrDate: string;
  evidence: string;
}
export interface AviandrContext {
  birthDate: string;
  allergies: string;
  conditions: string;
  currentMedication: string;
  reproductiveContext: string;
  substanceUse: string;
  diagnoses: string[];
  medicines: string[];
}
export interface AviandrFinding {
  id: string;
  status:
    "contraindication" | "caution" | "missing" | "review" | "not-identified";
  title: string;
  detail: string;
  section: string;
}
export interface AviandrReview {
  status: "unapproved";
  sourceVersion: string;
  sourceHash: string;
  sourceDate: string;
  sourceUrl: string;
  context: AviandrContext;
  inputs: AviandrInputs;
  findings: AviandrFinding[];
  checkedAt: string;
  checkedBy: string;
}
export interface SelfReport extends Stamp {
  reportedAt: string;
  receivedAt: string;
  provenance: Provenance;
  state: "completed" | "cannot" | "declined";
  mood: number | null;
  anxiety: number | null;
  sleepHours: number | null;
  functioning: string;
  medication: "taken" | "missed" | "no-mark" | "not-applicable";
  medicationReason: string;
  adverseEffects: string;
  note: string;
  safetyConcern: boolean;
  reviewedAt: string;
}
export interface CareEvent extends Stamp, Evidence {
  title: string;
  detail: string;
  urgency: Urgency;
  status: EventStatus;
  relatedId: string;
  dueAt: string;
  assignee: string;
  assessment: string;
  action: string;
  outcome: string;
  history: { at: string; by: string; status: EventStatus; note: string }[];
}
export interface Consent extends Stamp {
  purpose: "care" | "data" | "communication" | "disclosure";
  status: "documented" | "refused" | "withdrawn";
  signedOn: string;
  documentReference: string;
  person: string;
  scope: string;
  informing: string;
}
export interface Message extends Stamp {
  direction: "doctor" | "patient";
  text: string;
  status: "recorded" | "delivered" | "read";
  deliveredAt: string;
  readAt: string;
}
export interface Referral extends Stamp, Evidence {
  visitId: string;
  destination: string;
  urgency: Urgency;
  category: "required" | "desirable";
  reason: string;
  dueDate: string;
  status: "draft" | "issued" | "attended" | "declined";
  outcome: string;
}
export interface ClinicalDocument extends Stamp {
  title: string;
  documentDate: string;
  issuer: string;
  text: string;
  status: "unverified" | "verified" | "excluded";
  exclusionReason: string;
  facts: {
    id: string;
    field: string;
    quote: string;
    value: string;
    confirmed: boolean;
  }[];
}
export interface AuditEntry extends Stamp {
  action: string;
  targetId: string;
  detail: string;
}
/** Unapproved source forms stay separate from clinical measurements. */
export interface AssessmentDraft extends Stamp {
  sourceId: string;
  sourceHash: string;
  formVersion: string;
  measuredAt: string;
  assessor: "patient" | "clinician";
  responses: Record<string, number | string | null>;
  note: string;
  status: "unapproved";
}
export interface AssessmentFormDefinition {
  sourceId: string;
  sourceHash: string;
  title: string;
  sections: {
    id: string;
    title: string;
    items: {
      id: string;
      label: string;
      options?: { value: number | string; label: string }[];
      min?: number;
      max?: number;
    }[];
  }[];
  warnings: string[];
}
export interface PatientRecord {
  id: string;
  code: string;
  clinicId: string;
  doctorId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  profile: Profile;
  episodes: Episode[];
  visits: Visit[];
  measurements: Measurement[];
  plan: PlanItem[];
  reports: SelfReport[];
  events: CareEvent[];
  consents: Consent[];
  messages: Message[];
  referrals: Referral[];
  documents: ClinicalDocument[];
  audit: AuditEntry[];
  commandIds: string[];
  assessmentDrafts?: AssessmentDraft[];
}
export type Mutation =
  | { type: "assessment.save"; value: AssessmentDraft }
  | { type: "profile.update"; value: Profile }
  | { type: "episode.save"; value: Episode }
  | { type: "visit.save"; value: Visit }
  | { type: "visit.complete"; id: string }
  | { type: "visit.print"; id: string; reason: string }
  | { type: "visit.cancel"; id: string; reason: string }
  | { type: "visit.addendum"; id: string; text: string; reason: string }
  | { type: "measurement.add"; value: Measurement }
  | { type: "plan.save"; value: PlanItem }
  | { type: "plan.confirm"; id: string }
  | {
      type: "plan.status";
      id: string;
      status: "completed" | "stopped";
      reason: string;
    }
  | { type: "report.add"; value: SelfReport }
  | { type: "report.review"; id: string }
  | { type: "event.add"; value: CareEvent }
  | { type: "event.transition"; id: string; status: EventStatus; note: string }
  | { type: "consent.add"; value: Consent }
  | { type: "message.send"; text: string }
  | { type: "referral.save"; value: Referral }
  | { type: "document.add"; value: ClinicalDocument }
  | { type: "document.facts"; id: string; facts: ClinicalDocument["facts"] }
  | { type: "patient.archive"; archived: boolean; reason: string };
export interface Command {
  commandId: string;
  expectedRevision: number;
  mutation: Mutation;
}
export interface SourceDocument {
  id: string;
  title: string;
  edition: string;
  status: string;
  locator: string;
  relativePath: string;
  sha256: string;
  category: "guideline" | "regulation" | "scale";
  activation: "review-required" | "historical" | "conditional";
  officialUrl: string;
}
