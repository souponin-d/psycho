import {
  clinicalProtocols,
  getClinicalProtocol,
  describeClinicalScore,
  type ClinicalProtocol,
} from "./clinical-protocols.ts";
import {
  clinicalRecommendationSpecs,
  type ClinicalRecommendationSpec,
} from "./clinical-routing.ts";
import type { Actor, PatientRecord, PlanItem, Referral } from "./model.ts";
import {
  clinicalFactsContext,
  latestFact,
  factValueText,
  factStatusLabels,
} from "./clinical-facts.ts";

/** Technical fixture only. No diagnostic interpretation or clinical activation. */
export const syntheticProtocol = {
  id: "synthetic-followup",
  version: "synthetic-7-v1",
  title: "Оценка состояния · 7 пунктов",
  window: "Последние 14 дней",
  items: 7,
  minimum: 0,
  maximum: 3,
  status: "synthetic-only" as const,
  source:
    "Технический эталон проекта: 7 целых ответов 0–3; не утверждённая клиническая шкала",
  clinicalApproval: null,
};
export const clinicalRulesVersion = "clinical-review-2026-10-26-v2";
export type WorkflowAction =
  | "discuss"
  | "verify"
  | "scale"
  | "followup"
  | "monitor"
  | "consultation"
  | "investigation";
export type WorkflowDecision = "accept" | "modify" | "reject" | "defer";
export type SafetyStage =
  "created" | "delivered" | "acknowledged" | "assessed" | "acted";
export interface WorkflowSubmission {
  id: string;
  visitId?: string;
  protocolVersion: string;
  measuredAt: string;
  answers: (number | null)[];
  state: "completed" | "declined" | "cannot";
  safety: "yes" | "no" | "unknown";
  note: string;
  assignmentId: string;
  impact?: number | null;
  immediateDanger?: "yes" | "no" | "unknown";
}
export interface WorkflowAssessment extends WorkflowSubmission {
  receivedAt: string;
  receivedBy: Actor;
  completeness: "complete" | "partial" | "declined" | "cannot";
  score: number | null;
  source: ClinicalProtocol;
  interpretation?: {
    label: string;
    sourceUrl: string;
    diagnostic: false;
  } | null;
  provenance: "synthetic-patient";
}
export interface WorkflowRecommendation {
  id: string;
  version: number;
  type:
    | "safety"
    | "clarification"
    | "next-scale"
    | "observation"
    | "adherence"
    | "investigation"
    | "consultation";
  priority: "urgent" | "important" | "routine";
  title: string;
  rationale: string;
  source: ClinicalProtocol;
  limitations: string;
  assessmentId: string;
  factIds: string[];
  contextKey: string;
  action: WorkflowAction;
  dueDate: string;
  destination: string;
  status:
    | "new"
    | "open"
    | "accepted"
    | "modified"
    | "rejected"
    | "deferred"
    | "fulfilled";
  stale: boolean;
  effectId: string;
  effectSnapshot: PlanItem | Referral | null;
  supersededEffects?: {
    id: string;
    snapshot: PlanItem | Referral;
    at: string;
    by: Actor;
    reason: string;
  }[];
  referralReason?: string;
  referralCategory?: "required" | "desirable";
  ruleId?: string;
  ruleVersion?: string;
  createdAt: string;
  history: {
    at: string;
    by: Actor;
    decision: string;
    reason: string;
    action: WorkflowAction;
  }[];
}
export interface WorkflowSafety {
  id: string;
  version: number;
  assessmentId: string;
  kind: "explicit-concern" | "not-assessed" | "phq-item9" | "immediate-danger";
  priority: "urgent" | "important";
  status: SafetyStage;
  evaluation: "not-assessed" | "doctor-assessed";
  detail: string;
  assessment: string;
  action: string;
  deliveredAt: string;
  history: { at: string; by: Actor; status: SafetyStage; note: string }[];
}
export interface WorkflowAssignment {
  id: string;
  recommendationId: string;
  protocolVersion: string;
  dueDate: string;
  status: "issued" | "submitted";
  issuedAt: string;
  issuedBy: Actor;
  assessmentId: string;
  delivery: "synthetic-local";
}
export interface WorkflowContact {
  id: string;
  at: string;
  by: Actor;
  note: string;
  factVersions: Record<string, number>;
  assessmentIds: string[];
  recommendationIds: string[];
  recommendationVersions?: Record<string, number>;
}
export interface ClinicalWorkflowState {
  mode: "synthetic";
  assessments: WorkflowAssessment[];
  recommendations: WorkflowRecommendation[];
  safety: WorkflowSafety[];
  assignments: WorkflowAssignment[];
  contacts: WorkflowContact[];
  serial: number;
  reviewSpecialty?: Actor["specialty"];
}
export type WorkflowMutation =
  | { type: "workflow.refresh" }
  | { type: "workflow.submit"; value: WorkflowSubmission }
  | { type: "workflow.open"; id: string; expectedVersion: number }
  | {
      type: "workflow.decide";
      id: string;
      expectedVersion: number;
      decision: WorkflowDecision;
      reason: string;
      action: WorkflowAction;
      dueDate: string;
      destination?: string;
      projectReason?: string;
    }
  | {
      type: "workflow.execute";
      id: string;
      expectedVersion: number;
      confirmation: true;
    }
  | {
      type: "workflow.safety";
      id: string;
      expectedVersion: number;
      status: Exclude<SafetyStage, "created">;
      note: string;
    }
  | { type: "workflow.contact"; note: string };
export const isWorkflowMutation = (m: {
  type: string;
}): m is WorkflowMutation =>
  [
    "workflow.refresh",
    "workflow.submit",
    "workflow.open",
    "workflow.decide",
    "workflow.execute",
    "workflow.safety",
    "workflow.contact",
  ].includes(m.type);
export const workflowActionLabels: Record<WorkflowAction, string> = {
  discuss: "Обсудить на приёме",
  verify: "Уточнить данные",
  scale: "Выдать самоопросник",
  followup: "Контрольный контакт",
  monitor: "Проверить приверженность",
  consultation: "Подготовить консультацию",
  investigation: "Подготовить обследование",
};
export const workflowStatusLabels: Record<
  WorkflowRecommendation["status"],
  string
> = {
  new: "Новая",
  open: "Открыта",
  accepted: "Принята",
  modified: "Изменена",
  rejected: "Отклонена",
  deferred: "Отложена до приёма",
  fulfilled: "Действие подтверждено",
};
export const safetyStageLabels: Record<SafetyStage, string> = {
  created: "Создано",
  delivered: "Доставлено в локальную очередь",
  acknowledged: "Принято в работу",
  assessed: "Клинически оценено врачом",
  acted: "Действие подтверждено",
};
export class WorkflowError extends Error {
  public code: string;
  constructor(message: string, code = "validation") {
    super(message);
    this.code = code;
  }
}
function check(ok: unknown, message: string, code = "validation"): asserts ok {
  if (!ok) throw new WorkflowError(message, code);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(
    !!value && typeof value === "object" && !Array.isArray(value),
    "Ожидался объект учебного контура.",
  );
}
function only(value: object, keys: string[]) {
  check(
    Object.keys(value).every((k) => keys.includes(k)),
    "Неизвестные поля учебной команды.",
  );
}
function text(
  value: unknown,
  required = false,
  max = 20000,
): asserts value is string {
  check(
    typeof value === "string" &&
      value.length <= max &&
      (!required || value.trim().length > 0),
    required
      ? "Укажите текст или причину решения."
      : "Проверьте текстовое поле.",
  );
}
function instant(value: unknown, now: string) {
  text(value, true);
  check(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) ===
        value.slice(0, 10) &&
      Date.parse(value) <= Date.parse(now),
    "Проверьте дату результата; будущее недопустимо.",
  );
}
function calendar(value: unknown, now: string, required = false) {
  text(value, required);
  if (value)
    check(
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value &&
        value >= now.slice(0, 10),
      "Укажите корректный будущий срок.",
    );
}
function state(patient: PatientRecord): ClinicalWorkflowState {
  return (patient.workflow ??= {
    mode: "synthetic",
    assessments: [],
    recommendations: [],
    safety: [],
    assignments: [],
    contacts: [],
    serial: 0,
  });
}
export function workflowContextKey(
  patient: PatientRecord,
  actor?: Actor,
): string {
  return JSON.stringify({
    facts: clinicalFactsContext(patient),
    assessments: (patient.workflow?.assessments ?? []).map((a) => a.id),
    documents: (patient.clinicalFacts ?? [])
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .flatMap((f) => {
        const origin = latestFact(f).origin;
        if (origin.kind !== "document") return [];
        const doc = patient.documents.find((d) => d.id === origin.reference);
        return [
          {
            factId: f.id,
            documentId: origin.reference,
            status: doc?.status ?? "missing",
            quotePresent: !!doc?.text.includes(origin.quote),
          },
        ];
      }),
    medications: patient.plan
      .filter((p) => p.kind === "medication" && p.status !== "draft")
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => ({
        id: p.id,
        status: p.status,
        title: p.title,
        recordId: p.medicine?.recordId ?? "",
        sourceVersion: p.medicine?.sourceVersion ?? "",
        dose: p.dose,
        schedule: p.schedule,
        startDate: p.startDate,
        endDate: p.endDate,
      })),
    rulesVersion: clinicalRulesVersion,
    specialty: actor?.specialty ?? patient.workflow?.reviewSpecialty ?? "",
    protocols: clinicalProtocols
      .map((p) => ({ version: p.version, contentHash: p.contentHash ?? "" }))
      .sort((a, b) =>
        a.version < b.version ? -1 : a.version > b.version ? 1 : 0,
      ),
  });
}
const canonicalSource = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
export function isWorkflowSourceCurrent(r: WorkflowRecommendation): boolean {
  const known =
    r.source.version === syntheticProtocol.version
      ? syntheticProtocol
      : getClinicalProtocol(r.source.version);
  return (
    !!known &&
    canonicalSource(r.source) === canonicalSource(known) &&
    (known.status === "synthetic-only" ||
      r.ruleVersion === clinicalRulesVersion)
  );
}
export function isWorkflowRecommendationCurrent(
  p: PatientRecord,
  r: WorkflowRecommendation,
  actor?: Actor,
) {
  return (
    !r.stale &&
    r.contextKey === workflowContextKey(p, actor) &&
    isWorkflowSourceCurrent(r)
  );
}
export function workflowComparison(patient: PatientRecord, id: string) {
  const result = patient.workflow?.assessments.find((a) => a.id === id);
  check(result, "Оценка не найдена.");
  const comparable = (patient.workflow?.assessments ?? [])
    .filter(
      (a) =>
        a.id !== id &&
        a.protocolVersion === result.protocolVersion &&
        a.source.window === result.source.window &&
        a.completeness === "complete" &&
        Date.parse(a.measuredAt) < Date.parse(result.measuredAt),
    )
    .sort(
      (a, b) =>
        Date.parse(a.measuredAt) - Date.parse(b.measuredAt) ||
        a.id.localeCompare(b.id),
    );
  const previous = comparable.at(-1);
  return {
    baseline: comparable[0],
    previous,
    delta:
      result.score !== null && previous?.score != null
        ? result.score - previous.score
        : null,
    answerChanges: previous
      ? result.answers.flatMap((value, i) =>
          value !== previous.answers[i]
            ? [
                {
                  item: i + 1,
                  previous: previous.answers[i] ?? null,
                  current: value,
                },
              ]
            : [],
        )
      : [],
  };
}
export function changesSinceContact(patient: PatientRecord) {
  const contact = patient.workflow?.contacts.at(-1);
  return {
    contact,
    facts: (patient.clinicalFacts ?? []).filter(
      (f) =>
        !contact ||
        contact.factVersions[f.id] !== latestFact(f).version ||
        ["unverified", "clarification", "contradictory", "unknown"].includes(
          latestFact(f).status,
        ),
    ),
    results: (patient.workflow?.assessments ?? []).filter(
      (a) => !contact?.assessmentIds.includes(a.id),
    ),
    recommendations: (patient.workflow?.recommendations ?? []).filter(
      (r) => !r.stale && !["rejected", "fulfilled"].includes(r.status),
    ),
  };
}
export function reconcileWorkflow(
  patient: PatientRecord,
  actor: Actor,
  now: string,
) {
  actor = {
    id: actor.id,
    name: actor.name,
    clinicId: actor.clinicId,
    specialty: actor.specialty,
  };
  const w = patient.workflow;
  if (!w) return;
  w.reviewSpecialty = actor.specialty;
  const contextKey = workflowContextKey(patient, actor);
  for (const r of w.recommendations)
    if (
      (r.contextKey !== contextKey || !isWorkflowSourceCurrent(r)) &&
      !r.stale
    ) {
      r.stale = true;
      r.version++;
    }
  const ordered = w.assessments
    .slice()
    .reverse()
    .sort(
      (a, b) =>
        Date.parse(b.measuredAt) - Date.parse(a.measuredAt) ||
        Date.parse(b.receivedAt) - Date.parse(a.receivedAt),
    );
  const latest = ordered[0];
  const latestVersions = ordered.filter(
    (a, i) =>
      ordered.findIndex((b) => a.protocolVersion === b.protocolVersion) === i,
  );
  const specs: ClinicalRecommendationSpec[] = [];
  for (const latest of latestVersions) {
    if (latest.source.status !== "synthetic-only") {
      const current = getClinicalProtocol(latest.protocolVersion);
      if (
        !current ||
        canonicalSource(current) !== canonicalSource(latest.source)
      )
        specs.push({
          key: `source:${latest.id}`,
          type: "clarification",
          action: "verify",
          title: "Сверить версию методики",
          rationale:
            "Источник методики изменился. Проверьте версию и применимость результата.",
          factIds: [],
          priority: "important",
          assessmentId: latest.id,
          source: current ?? syntheticProtocol,
          ...(current ? { ruleId: "source-review-v1" } : {}),
        });
      else specs.push(...clinicalRecommendationSpecs(patient, latest, actor));
      continue;
    }
    const base = { assessmentId: latest.id, source: latest.source };
    specs.push({
      ...base,
      key: `result:${latest.id}`,
      type:
        latest.completeness === "complete" ? "observation" : "clarification",
      action: latest.completeness === "complete" ? "discuss" : "verify",
      title:
        latest.completeness === "complete"
          ? "Рассмотреть новую оценку"
          : "Уточнить неполные сведения или отказ",
      rationale: `${latest.completeness === "complete" ? "Полная оценка" : latest.completeness === "partial" ? "Есть пропуски" : latest.completeness === "declined" ? "Отказ от заполнения" : "Анкета не заполнена"}: ${latest.score === null ? "итог не рассчитан" : `сумма ${latest.score} из 21`}.`,
      factIds: [],
      priority: "routine",
    });
    if (latest.completeness === "complete")
      specs.push({
        ...base,
        key: `repeat:${latest.id}`,
        type: "next-scale",
        action: "scale",
        title: "Согласовать следующее измерение",
        rationale:
          "Оценка заполнена. Согласуйте необходимость и дату повторения.",
        factIds: [],
        priority: "routine",
      });
  }
  for (const f of patient.clinicalFacts ?? []) {
    const v = latestFact(f);
    if (!["confirmed", "inactive"].includes(v.status))
      specs.push({
        assessmentId: latest?.id ?? "",
        source: latest
          ? (getClinicalProtocol(latest.protocolVersion) ?? syntheticProtocol)
          : syntheticProtocol,
        key: `fact:${f.id}`,
        type: "clarification",
        action: "verify",
        title: "Проверить клинический факт",
        rationale: `${factValueText(v.content)}; ${factStatusLabels[v.status]}.`,
        factIds: [f.id],
        priority: v.status === "contradictory" ? "important" : "routine",
      });
  }
  for (const spec of specs) {
    if (
      w.recommendations.some(
        (r) =>
          !r.stale &&
          r.contextKey === contextKey &&
          r.title === spec.title &&
          r.assessmentId === spec.assessmentId &&
          JSON.stringify(r.factIds) === JSON.stringify(spec.factIds),
      )
    )
      continue;
    check(
      w.recommendations.length < 2000,
      "Достигнут лимит рекомендаций; история не удаляется автоматически.",
    );
    w.recommendations.push({
      id: `wf-r-${++w.serial}`,
      version: 1,
      type: spec.type,
      priority: spec.priority,
      title: spec.title,
      rationale: spec.rationale,
      source: structuredClone(spec.source),
      limitations:
        "Учебный сценарий. Не устанавливает диагноз, не выбирает лечение, не подтверждает безопасность. Клинические правила не утверждены.",
      assessmentId: spec.assessmentId,
      factIds: spec.factIds,
      contextKey,
      action: spec.action,
      dueDate: "",
      destination: spec.destination ?? "",
      status: "new",
      stale: false,
      effectId: "",
      effectSnapshot: null,
      ...(spec.source.status !== "synthetic-only"
        ? { ruleVersion: clinicalRulesVersion }
        : {}),
      ...(spec.referralCategory
        ? { referralCategory: spec.referralCategory }
        : {}),
      ...(spec.ruleId ? { ruleId: spec.ruleId } : {}),
      createdAt: now,
      history: [
        {
          at: now,
          by: structuredClone(actor),
          decision: "created",
          reason: spec.key,
          action: spec.action,
        },
      ],
    });
  }
}
function currentRecommendation(
  patient: PatientRecord,
  id: string,
  version: number,
  actor?: Actor,
) {
  const r = state(patient).recommendations.find((r) => r.id === id);
  check(r, "Рекомендация не найдена.");
  check(
    isWorkflowRecommendationCurrent(patient, r, actor),
    "Основание устарело. Откройте актуальную рекомендацию.",
    "conflict",
  );
  check(r.version === version, "Версия решения изменилась.", "conflict");
  return r;
}
function effect(
  patient: PatientRecord,
  r: WorkflowRecommendation,
  actor: Actor,
  now: string,
) {
  const id = `workflow-effect-${r.id}-v${r.version}`;
  check(
    !patient.plan.some((p) => p.id === id) &&
      !patient.referrals.some((p) => p.id === id),
    "Проект уже существует.",
    "conflict",
  );
  r.effectId = id;
  const rationale = `${r.rationale}\nИсточник: ${r.source.id}/${r.source.version}; ${r.source.status}. ${r.limitations}`;
  if (r.action === "consultation" || r.action === "investigation") {
    const previous = patient.referrals
      .map(
        (f) =>
          `${f.destination}: ${f.status}${f.outcome ? ` · ${f.outcome}` : ""}`,
      )
      .join("; ");
    const referral: Referral = {
      id,
      createdAt: now,
      author: actor.name,
      visitId: "",
      sourceIds: [],
      rationale,
      destination: r.destination,
      urgency: r.priority,
      category: r.referralCategory ?? "desirable",
      reason: `${r.referralReason || rationale}\nРанее зарегистрированные направления: ${previous || "нет сведений"}. Недостающие или непроверенные данные: ${
        (patient.clinicalFacts ?? [])
          .filter(
            (f) =>
              latestFact(f).status !== "confirmed" &&
              latestFact(f).status !== "inactive",
          )
          .map((f) => factValueText(latestFact(f).content))
          .join("; ") || "полнота врачом не подтверждена"
      }.`,
      dueDate: r.dueDate,
      status: "draft",
      outcome: "",
    };
    patient.referrals.push(referral);
    r.effectSnapshot = structuredClone(referral);
  } else {
    const plan: PlanItem = {
      id,
      createdAt: now,
      author: actor.name,
      visitId: "",
      kind: r.action === "scale" ? "assessment" : "follow-up",
      title: workflowActionLabels[r.action],
      details: r.rationale,
      dose: "",
      schedule: "",
      startDate: "",
      endDate: "",
      dueDate: r.dueDate,
      status: "draft",
      confirmedAt: "",
      confirmedBy: "",
      changeReason: "",
      replacesId: "",
      instructionUrl: "",
      patientInstructions:
        r.action === "scale"
          ? "Заполнить согласованный самоопросник к выбранному сроку."
          : "Обсудить сведения и дальнейшие действия с врачом.",
      sourceIds: [],
      rationale,
    };
    patient.plan.push(plan);
    r.effectSnapshot = structuredClone(plan);
  }
}
export function applyWorkflowMutation(
  patient: PatientRecord,
  m: WorkflowMutation,
  actor: Actor,
  now: string,
) {
  object(m);
  actor = {
    id: actor.id,
    name: actor.name,
    clinicId: actor.clinicId,
    specialty: actor.specialty,
  };
  const w = state(patient);
  if (m.type === "workflow.submit") {
    only(m, ["type", "value"]);
    const v = m.value;
    object(v);
    only(v, [
      "id",
      "visitId",
      "protocolVersion",
      "measuredAt",
      "answers",
      "state",
      "safety",
      "note",
      "assignmentId",
      "impact",
      "immediateDanger",
    ]);
    text(v.id, true, 100);
    if (v.visitId !== undefined) {
      text(v.visitId, false, 100);
      if (v.visitId) {
        const visit = patient.visits.find((entry) => entry.id === v.visitId);
        check(
          visit &&
            (visit.status === "scheduled" || visit.status === "in-progress") &&
            !patient.audit.some(
              (entry) =>
                entry.action === "visit.print" && entry.targetId === v.visitId,
            ),
          "Связанный приём недоступен для добавления результатов.",
        );
      }
    }
    const old = v.protocolVersion === syntheticProtocol.version;
    const protocol: ClinicalProtocol | undefined = old
      ? syntheticProtocol
      : getClinicalProtocol(v.protocolVersion);
    check(protocol, "Неизвестная версия учебного протокола.");
    instant(v.measuredAt, now);
    if (!old) {
      const birth = patient.profile.birthDate;
      const age =
        Number(v.measuredAt.slice(0, 4)) -
        Number(birth.slice(0, 4)) -
        (v.measuredAt.slice(5, 10) < birth.slice(5, 10) ? 1 : 0);
      check(age >= 18, "Шкала доступна только взрослым на дату измерения.");
    }
    const immediate = v.immediateDanger ?? "unknown";
    check(
      ["yes", "no", "unknown"].includes(immediate),
      "Проверьте ответ о непосредственной опасности.",
    );
    check(
      v.impact === undefined ||
        v.impact === null ||
        (typeof v.impact === "number" &&
          Number.isInteger(v.impact) &&
          v.impact >= 0 &&
          v.impact <= 3),
      "Проверьте ответ о влиянии симптомов.",
    );
    text(v.note);
    text(v.assignmentId, false, 100);
    check(
      ["completed", "declined", "cannot"].includes(v.state) &&
        ["yes", "no", "unknown"].includes(v.safety),
      "Проверьте полноту и ответы о рисках.",
    );
    check(
      Array.isArray(v.answers) &&
        v.answers.length === protocol.items &&
        Array.from(v.answers).every(
          (a) => a === null || (Number.isInteger(a) && a >= 0 && a <= 3),
        ),
      "Нужны семь ответов 0–3 либо явные пропуски.",
    );
    if (v.state !== "completed")
      check(
        v.answers.every((a) => a === null),
        "При отказе или невозможности заполнения ответы должны оставаться неизвестными.",
      );
    check(
      !w.assessments.some((a) => a.id === v.id),
      "Результат уже получен; исправление сохраняется отдельным результатом.",
      "conflict",
    );
    check(w.assessments.length < 1000, "Достигнут лимит оценок.");
    if (v.assignmentId) {
      const assignment = w.assignments.find((a) => a.id === v.assignmentId);
      check(
        assignment &&
          assignment.status === "issued" &&
          assignment.protocolVersion === v.protocolVersion,
        "Задание не найдено, выполнено или имеет другую версию.",
      );
      assignment.status = "submitted";
      assignment.assessmentId = v.id;
    }
    const impactRequired =
      protocol.scale === "PHQ-9" && v.answers.some((a) => a !== null && a > 0);
    const completeness =
      v.state === "completed"
        ? v.answers.every((a) => a !== null) &&
          (!impactRequired || (v.impact !== undefined && v.impact !== null))
          ? "complete"
          : "partial"
        : v.state;
    const score =
      completeness === "complete"
        ? v.answers.reduce<number>((sum, a) => sum + (a ?? 0), 0)
        : null;
    w.assessments.push({
      ...structuredClone(v),
      measuredAt: new Date(v.measuredAt).toISOString(),
      receivedAt: now,
      receivedBy: structuredClone(actor),
      completeness,
      score,
      source: structuredClone(protocol),
      ...(!old
        ? {
            impact: v.impact ?? null,
            immediateDanger: immediate,
            interpretation: describeClinicalScore(protocol, score),
          }
        : {}),
      provenance: "synthetic-patient",
    });
    const positive9 = protocol.scale === "PHQ-9" && (v.answers[8] ?? 0) > 0;
    const needSafety = old
      ? v.safety !== "no" || completeness !== "complete"
      : immediate === "yes" ||
        positive9 ||
        v.safety !== "no" ||
        immediate === "unknown" ||
        completeness !== "complete";
    if (needSafety) {
      const kind: WorkflowSafety["kind"] = old
        ? v.safety === "yes"
          ? "explicit-concern"
          : "not-assessed"
        : immediate === "yes"
          ? "immediate-danger"
          : positive9
            ? "phq-item9"
            : v.safety === "yes"
              ? "explicit-concern"
              : "not-assessed";
      const detail =
        kind === "immediate-danger"
          ? "Пациент сообщает о непосредственной опасности. Требуется срочная очная оценка."
          : kind === "phq-item9"
            ? "Положительный ответ на пункт 9 PHQ-9. Уточните мысли, намерение, план и необходимость срочной помощи."
            : kind === "explicit-concern"
              ? "Пациент сообщил о риске. Требуется оценка врача."
              : "Риски не оценены: ответ неизвестен, пропущен или не получен.";
      check(w.safety.length < 1000, "Достигнут лимит событий риска.");
      w.safety.push({
        id: `wf-s-${v.id}`,
        version: 1,
        assessmentId: v.id,
        kind,
        priority:
          kind === "immediate-danger" || (old && v.safety === "yes")
            ? "urgent"
            : "important",
        status: "created",
        evaluation: "not-assessed",
        detail,
        assessment: "",
        action: "",
        deliveredAt: "",
        history: [
          {
            at: now,
            by: structuredClone(actor),
            status: "created",
            note: "Учебное событие; факт клинического риска системой не установлен.",
          },
        ],
      });
    }
  } else if (m.type === "workflow.refresh") {
    only(m, ["type"]);
  } else if (m.type === "workflow.contact") {
    only(m, ["type", "note"]);
    text(m.note);
    check(w.contacts.length < 1000, "Достигнут лимит контактов.");
    w.contacts.push({
      id: `wf-contact-${w.contacts.length + 1}`,
      at: now,
      by: structuredClone(actor),
      note: m.note,
      factVersions: Object.fromEntries(
        (patient.clinicalFacts ?? []).map((f) => [f.id, latestFact(f).version]),
      ),
      assessmentIds: w.assessments.map((a) => a.id),
      recommendationIds: w.recommendations
        .filter((r) => !r.stale)
        .map((r) => r.id),
      recommendationVersions: Object.fromEntries(
        w.recommendations.filter((r) => !r.stale).map((r) => [r.id, r.version]),
      ),
    });
  } else if (m.type === "workflow.safety") {
    only(m, ["type", "id", "expectedVersion", "status", "note"]);
    text(m.id, true, 105);
    text(m.note, true);
    const event = w.safety.find((e) => e.id === m.id);
    check(event, "Событие риска не найдено.");
    check(
      event.version === m.expectedVersion,
      "Версия события изменилась.",
      "conflict",
    );
    const order: SafetyStage[] = [
      "created",
      "delivered",
      "acknowledged",
      "assessed",
      "acted",
    ];
    check(
      order.indexOf(m.status) === order.indexOf(event.status) + 1,
      "Соблюдайте этапы доставки, принятия, оценки и действия.",
    );
    event.status = m.status;
    event.version++;
    if (m.status === "delivered") event.deliveredAt = now;
    if (m.status === "assessed") {
      event.assessment = m.note;
      event.evaluation = "doctor-assessed";
    }
    if (m.status === "acted") event.action = m.note;
    event.history.push({
      at: now,
      by: structuredClone(actor),
      status: m.status,
      note: m.note,
    });
  } else {
    text(m.id, true, 100);
    check(
      Number.isInteger(m.expectedVersion) && m.expectedVersion > 0,
      "Нужна версия рекомендации.",
    );
    const r = currentRecommendation(patient, m.id, m.expectedVersion, actor);
    if (m.type === "workflow.open") {
      only(m, ["type", "id", "expectedVersion"]);
      check(r.status === "new", "Рекомендация уже открыта.");
      r.status = "open";
      r.version++;
      r.history.push({
        at: now,
        by: structuredClone(actor),
        decision: "opened",
        reason: "Просмотр не выполняет действие",
        action: r.action,
      });
    } else if (m.type === "workflow.decide") {
      only(m, [
        "type",
        "id",
        "expectedVersion",
        "decision",
        "reason",
        "action",
        "dueDate",
        "destination",
        "projectReason",
      ]);
      check(
        ["new", "open", "deferred"].includes(r.status) ||
          (["accepted", "modified"].includes(r.status) &&
            ["modify", "reject"].includes(m.decision)),
        "По рекомендации уже принято решение.",
        "conflict",
      );
      check(
        ["accept", "modify", "reject", "defer"].includes(m.decision),
        "Неизвестное решение.",
      );
      check(
        Object.hasOwn(workflowActionLabels, m.action),
        "Неизвестное действие.",
      );
      text(m.reason, m.decision === "modify" || m.decision === "reject");
      check(
        m.decision === "modify" || m.action === r.action,
        "Изменение действия требует причины и решения «Изменить».",
      );
      calendar(
        m.dueDate,
        now,
        (m.decision === "accept" || m.decision === "modify") &&
          ["scale", "followup"].includes(m.action),
      );
      if (m.destination !== undefined) text(m.destination, false, 500);
      if (
        ["consultation", "investigation"].includes(m.action) &&
        ["accept", "modify"].includes(m.decision)
      )
        text(m.destination, true, 500);
      if (m.projectReason !== undefined) text(m.projectReason, true);
      if (r.effectId) {
        const old =
          patient.plan.find((p) => p.id === r.effectId) ??
          patient.referrals.find((p) => p.id === r.effectId);
        check(
          old?.status === "draft",
          "Выполненное действие нельзя пересмотреть как проект.",
          "conflict",
        );
        (r.supersededEffects ??= []).push({
          id: r.effectId,
          snapshot: structuredClone(old),
          at: now,
          by: structuredClone(actor),
          reason: m.reason,
        });
        r.effectId = "";
        r.effectSnapshot = null;
      }
      r.referralReason = m.projectReason ?? r.rationale;
      r.action = m.action;
      r.dueDate = m.dueDate;
      r.destination = m.destination ?? "";
      r.status = (
        {
          accept: "accepted",
          modify: "modified",
          reject: "rejected",
          defer: "deferred",
        } as const
      )[m.decision];
      r.version++;
      r.history.push({
        at: now,
        by: structuredClone(actor),
        decision: m.decision,
        reason: m.reason,
        action: r.action,
      });
      if (m.decision === "accept" || m.decision === "modify")
        effect(patient, r, actor, now);
    } else if (m.type === "workflow.execute") {
      only(m, ["type", "id", "expectedVersion", "confirmation"]);
      check(m.confirmation === true, "Нужно отдельное подтверждение врачом.");
      check(
        r.status === "accepted" || r.status === "modified",
        "Сначала примите решение.",
      );
      const plan = patient.plan.find((p) => p.id === r.effectId);
      const referral = patient.referrals.find((p) => p.id === r.effectId);
      check(
        JSON.stringify(plan ?? referral) === JSON.stringify(r.effectSnapshot),
        "Проект изменён. Требуется отдельное актуальное решение.",
        "conflict",
      );
      if (plan) {
        check(
          plan.status === "draft" && plan.kind !== "medication",
          "Учебное подтверждение применимо только к своему обычному проекту.",
        );
        check(
          plan.title === workflowActionLabels[r.action] &&
            plan.details === r.rationale &&
            plan.dueDate === r.dueDate,
          "Проект изменён вручную. Подтвердите его в соответствующем разделе.",
          "conflict",
        );
        plan.status = "confirmed";
        plan.confirmedAt = now;
        plan.confirmedBy = actor.name;
      } else {
        check(
          referral &&
            referral.status === "draft" &&
            referral.destination === r.destination &&
            referral.dueDate === r.dueDate,
          "Проект направления изменён или уже выдан.",
          "conflict",
        );
        referral.status = "issued";
      }
      if (r.action === "scale") {
        calendar(r.dueDate, now, true);
        check(
          !w.assignments.some((a) => a.recommendationId === r.id),
          "Задание уже выдано.",
          "conflict",
        );
        w.assignments.push({
          id: `wf-assignment-${r.id}`,
          recommendationId: r.id,
          protocolVersion: r.source.version,
          dueDate: r.dueDate,
          status: "issued",
          issuedAt: now,
          issuedBy: structuredClone(actor),
          assessmentId: "",
          delivery: "synthetic-local",
        });
      }
      r.status = "fulfilled";
      r.version++;
      r.history.push({
        at: now,
        by: structuredClone(actor),
        decision: "action-confirmed",
        reason:
          "Отдельное врачебное подтверждение проекта; не завершение медицинской помощи",
        action: r.action,
      });
    } else throw new WorkflowError("Неизвестная учебная команда.");
  }
  reconcileWorkflow(patient, actor, now);
}

export function workflowEffectOwner(p: PatientRecord, id: string) {
  return p.workflow?.recommendations.find(
    (r) => r.effectId === id || r.supersededEffects?.some((e) => e.id === id),
  );
}
