import type { Actor, CareEvent, PatientRecord, PlanItem } from "./model";
import {
  clinicalSignals,
  seriousnessCriteria,
  type ClinicalSupportMutation,
  type ClinicalEvaluation,
  type SupportInput,
  type AdverseEventInput,
} from "./clinical-support-types.ts";
import {
  evaluateSupport,
  supportCatalog,
  supportContextKey,
  stableClinicalValue,
  clinicalDrugClasses,
} from "./clinical-support-engine.ts";
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const inputRouteDestination = (route: SupportInput["route"]) =>
  route === "gad" ? "Психиатр или психотерапевт" : "Психиатр";
function shape(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  check(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Ожидался объект.",
  );
  check(
    Object.keys(value).every((k) => keys.includes(k)) &&
      keys.every((k) => Object.hasOwn(value, k)),
    "Проверьте поля команды.",
  );
}
function text(v: unknown, required = false, max = 4000): asserts v is string {
  check(
    typeof v === "string" && v.length <= max && (!required || !!v.trim()),
    "Проверьте текст или причину.",
  );
}
function id(v: unknown) {
  check(
    typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v),
    "Некорректный идентификатор.",
  );
}
function one(v: unknown, values: readonly string[]) {
  check(typeof v === "string" && values.includes(v), "Недопустимое значение.");
}
function instant(v: unknown, now: string): string {
  check(
    typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        v,
      ) &&
      Number.isFinite(Date.parse(v)) &&
      Date.parse(v) <= Date.parse(now),
    "Проверьте дату: будущее значение недопустимо.",
  );
  check(
    new Date(v.slice(0, 10)).toISOString().slice(0, 10) === v.slice(0, 10),
    "Несуществующая календарная дата.",
  );
  return new Date(v).toISOString();
}
function validateInput(v: SupportInput, now: string): SupportInput {
  shape(v, [
    "route",
    "observations",
    "functioning",
    "depressionSeverity",
    "response",
    "preference",
    "note",
  ]);
  one(v.route, ["gad", "depression"]);
  one(v.functioning, ["preserved", "impaired", "severely-impaired", "unknown"]);
  one(v.depressionSeverity, ["less-severe", "more-severe", "unknown"]);
  one(v.response, [
    "not-started",
    "improving",
    "no-response",
    "worsening",
    "unknown",
  ]);
  one(v.preference, ["psychological", "medication", "combined", "undecided"]);
  text(v.note);
  check(
    Array.isArray(v.observations) &&
      v.observations.length <= clinicalSignals.length &&
      new Set(v.observations.map((o) => o?.key)).size === v.observations.length,
    "Признаки не должны повторяться.",
  );
  for (const o of v.observations) {
    shape(o, ["key", "answer", "provenance", "observedAt", "note"]);
    one(o.key, clinicalSignals);
    one(o.answer, ["yes", "no", "unknown"]);
    one(o.provenance, ["patient", "clinician", "relative", "document"]);
    o.observedAt = instant(o.observedAt, now);
    text(o.note, o.provenance === "document");
  }
  return v;
}
function validateAdverse(v: AdverseEventInput, now: string, p: PatientRecord) {
  shape(v, [
    "symptoms",
    "onsetAt",
    "suspectPlanIds",
    "severity",
    "seriousness",
    "criteria",
    "outcome",
    "dechallenge",
    "rechallenge",
    "causality",
    "provenance",
    "assessment",
  ]);
  text(v.symptoms, true);
  v.onsetAt = instant(v.onsetAt, now);
  text(v.assessment);
  check(
    Array.isArray(v.suspectPlanIds) &&
      v.suspectPlanIds.length <= 30 &&
      new Set(v.suspectPlanIds).size === v.suspectPlanIds.length,
    "Проверьте подозреваемые назначения.",
  );
  for (const pid of v.suspectPlanIds)
    check(
      p.plan.some(
        (m) => m.id === pid && m.kind === "medication" && m.status !== "draft",
      ),
      "Подозреваемое назначение не найдено.",
    );
  one(v.severity, ["mild", "moderate", "severe", "unknown"]);
  one(v.seriousness, ["unknown", "not-serious", "serious"]);
  one(v.outcome, [
    "unknown",
    "ongoing",
    "recovering",
    "recovered",
    "sequelae",
    "fatal",
  ]);
  one(v.dechallenge, ["unknown", "not-done", "improved", "unchanged"]);
  one(v.rechallenge, ["unknown", "not-done", "recurred", "not-recurred"]);
  one(v.causality, [
    "unassessed",
    "unlikely",
    "possible",
    "probable",
    "certain",
    "unclassifiable",
  ]);
  one(v.provenance, ["patient", "clinician", "relative", "document"]);
  check(
    Array.isArray(v.criteria) &&
      new Set(v.criteria).size === v.criteria.length &&
      v.criteria.every((c) => seriousnessCriteria.includes(c)),
    "Проверьте критерии серьёзности.",
  );
  check(
    v.seriousness === "serious"
      ? v.criteria.length > 0
      : v.criteria.length === 0,
    "Серьёзность и её критерии не согласованы.",
  );
  check(
    v.outcome !== "fatal" ||
      (v.seriousness === "serious" && v.criteria.includes("death")),
    "Для летального исхода укажите критерий серьёзности.",
  );
  check(
    v.causality === "unassessed" || v.assessment.trim().length > 0,
    "Обоснуйте врачебную оценку причинности.",
  );
}
export function isSupportMutation(m: {
  type: string;
}): m is ClinicalSupportMutation {
  return [
    "support.evaluate",
    "support.decide",
    "support.adverse",
    "support.route",
  ].includes(m.type);
}
export function isSupportEvaluationCurrent(
  p: PatientRecord,
  e: ClinicalEvaluation,
  actor: Actor,
  now = new Date().toISOString(),
): boolean {
  return (
    p.clinicalSupport?.evaluations.at(-1)?.id === e.id &&
    e.catalogVersion === supportCatalog.version &&
    stableClinicalValue(e.sources) ===
      stableClinicalValue(supportCatalog.sources) &&
    e.contextKey === supportContextKey(p, actor, now)
  );
}
export function assertSupportPlanCurrent(
  p: PatientRecord,
  planId: string,
  actor: Actor,
  now = new Date().toISOString(),
) {
  const d = p.clinicalSupport?.decisions.find((d) => d.planId === planId);
  if (!d) return;
  const e = p.clinicalSupport!.evaluations.find((e) => e.id === d.evaluationId);
  check(
    e && isSupportEvaluationCurrent(p, e, actor, now),
    "Основания проекта изменились. Повторите оценку и решение.",
  );
  const plan = p.plan.find((x) => x.id === planId);
  if (plan?.kind === "medication")
    check(
      plan.medicine &&
        clinicalDrugClasses(plan.medicine.inn).some((c) =>
          d.option.drugClasses.includes(c),
        ),
      "Выберите препарат из рассматриваемой группы или создайте отдельное врачебное назначение.",
    );
}
export function assertSupportReferralCurrent(
  p: PatientRecord,
  id: string,
  actor: Actor,
  now = new Date().toISOString(),
) {
  const d = p.clinicalSupport?.routeDecisions?.find((d) => d.referralId === id);
  if (!d) return;
  const e = p.clinicalSupport!.evaluations.find((e) => e.id === d.evaluationId);
  check(
    e && isSupportEvaluationCurrent(p, e, actor, now),
    "Основания направления изменились. Повторите оценку и решение.",
  );
}
function newCareEvent(
  id: string,
  title: string,
  detail: string,
  urgency: CareEvent["urgency"],
  relatedId: string,
  actor: Actor,
  now: string,
): CareEvent {
  return {
    id,
    title,
    detail,
    urgency,
    relatedId,
    status: "created",
    dueAt: "",
    assignee: actor.id,
    assessment: "",
    action: "",
    outcome: "",
    sourceIds: [],
    rationale:
      "Требуется клиническое рассмотрение; исходные сведения сохранены.",
    history: [
      {
        at: now,
        by: actor.name,
        status: "created",
        note: "Создано по структурированным сведениям.",
      },
    ],
    createdAt: now,
    author: actor.name,
  };
}
export function applySupportMutation(
  p: PatientRecord,
  m: ClinicalSupportMutation,
  actor: Actor,
  now: string,
): void {
  id(m.id);
  if (m.type === "support.route") {
    shape(m, ["type", "id", "evaluationId", "findingId", "decision", "reason"]);
    text(m.reason);
    id(m.evaluationId);
    text(m.findingId, true);
    one(m.decision, ["accept", "decline", "defer"]);
    const state = p.clinicalSupport,
      e = state?.evaluations.find((e) => e.id === m.evaluationId);
    check(
      state && e && isSupportEvaluationCurrent(p, e, actor, now),
      "Оценка устарела. Обновите клиническую поддержку.",
    );
    const f = e.result.findings.find((f) => f.id === m.findingId);
    check(f && f.action === "consultation", "Нет предложения консультации.");
    check(
      m.decision === "accept" || m.reason.trim(),
      "Укажите основание решения.",
    );
    state.routeDecisions ??= [];
    check(
      !state.routeDecisions.some(
        (d) =>
          d.id === m.id || (d.evaluationId === e.id && d.findingId === f.id),
      ),
      "Решение уже сохранено.",
    );
    const referralId = m.decision === "accept" ? "cs-ref-" + m.id : "";
    if (referralId) {
      check(
        !p.referrals.some((r) => r.id === referralId),
        "Проект уже существует.",
      );
      p.referrals.push({
        id: referralId,
        createdAt: now,
        author: actor.name,
        visitId: "",
        destination:
          f.priority === "urgent"
            ? "Срочная очная оценка"
            : inputRouteDestination(e.input.route),
        urgency: f.priority,
        category: f.category ?? "desirable",
        reason: f.detail,
        dueDate: "",
        status: "draft",
        outcome: "",
        sourceIds: [],
        rationale: e.sources
          .filter((s) => f.sourceIds.includes(s.id))
          .map(
            (s) =>
              s.title + " · " + s.version + " · " + s.section + " · " + s.url,
          )
          .join("\n"),
      });
    }
    state.routeDecisions.push({
      id: m.id,
      evaluationId: e.id,
      findingId: f.id,
      decision: m.decision,
      reason: m.reason,
      referralId,
      createdAt: now,
      by: structuredClone(actor),
      finding: structuredClone(f),
    });
    return;
  }
  if (m.type === "support.evaluate") {
    shape(m, ["type", "id", "input"]);
    const input = validateInput(structuredClone(m.input), now);
    const result = evaluateSupport(p, input, actor, now);
    p.clinicalSupport ??= { evaluations: [], decisions: [], adverseEvents: [] };
    const state = p.clinicalSupport;
    check(
      state.evaluations.length < 500 &&
        !state.evaluations.some((e) => e.id === m.id),
      "Оценка уже существует или достигнут лимит истории.",
    );
    state.evaluations.push({
      id: m.id,
      input,
      result,
      contextKey: supportContextKey(p, actor, now),
      catalogVersion: supportCatalog.version,
      sources: structuredClone(supportCatalog.sources),
      createdAt: now,
      by: structuredClone(actor),
    });
    for (const f of result.findings.filter(
      (f) => f.kind === "safety" && f.id !== "suicide-interview",
    )) {
      const relatedId = "clinical-risk-" + f.id;
      if (
        p.events.some((e) => e.relatedId === relatedId && e.status !== "closed")
      )
        continue;
      p.events.push(
        newCareEvent(
          "cs-risk-" + m.id + "-" + f.id,
          f.title,
          f.detail,
          f.priority,
          relatedId,
          actor,
          now,
        ),
      );
    }
    state.evaluations.at(-1)!.contextKey = supportContextKey(p, actor, now);
    return;
  }
  if (m.type === "support.decide") {
    shape(m, ["type", "id", "evaluationId", "optionId", "decision", "reason"]);
    id(m.evaluationId);
    text(m.optionId, true, 100);
    text(m.reason);
    one(m.decision, ["accept", "decline", "defer"]);
    const state = p.clinicalSupport,
      e = state?.evaluations.find((e) => e.id === m.evaluationId);
    check(
      e && state && isSupportEvaluationCurrent(p, e, actor, now),
      "Оценка устарела. Обновите клиническую поддержку.",
    );
    const option = e.result.options.find((o) => o.id === m.optionId);
    check(option, "Вариант не найден.");
    check(
      !state.decisions.some(
        (d) =>
          d.id === m.id ||
          (d.evaluationId === e.id && d.optionId === option.id),
      ),
      "Решение уже сохранено.",
    );
    check(
      m.decision !== "accept" || option.status !== "defer",
      "Сначала уточните состояние и применимость маршрута.",
    );
    check(
      (m.decision === "accept" && option.status === "discuss") ||
        m.reason.trim(),
      "Укажите основание решения или уточнения.",
    );
    let planId = "";
    if (m.decision === "accept") {
      planId = "cs-plan-" + m.id;
      check(
        !p.plan.some((item) => item.id === planId),
        "Проект уже существует.",
      );
      const rationale = [
        option.summary,
        ...option.reasons,
        "Решение: " + (m.reason || "Вариант согласован"),
        ...e.sources
          .filter((s) => option.sourceIds.includes(s.id))
          .map(
            (s) =>
              s.title + " · " + s.version + " · " + s.section + " · " + s.url,
          ),
      ].join("\n");
      const plan: PlanItem = {
        id: planId,
        createdAt: now,
        author: actor.name,
        visitId: "",
        kind: option.kind,
        title: option.title,
        details: option.summary + "\n" + option.monitoring.join("\n"),
        dose: "",
        schedule: "",
        startDate: "",
        endDate: "",
        dueDate: "",
        status: "draft",
        confirmedAt: "",
        confirmedBy: "",
        changeReason: "",
        replacesId: "",
        instructionUrl: "",
        patientInstructions: "",
        sourceIds: [],
        rationale,
        ...(option.kind === "medication" ? { medicine: null } : {}),
      };
      p.plan.push(plan);
    }
    state.decisions.push({
      id: m.id,
      evaluationId: e.id,
      optionId: option.id,
      decision: m.decision,
      reason: m.reason,
      planId,
      createdAt: now,
      by: structuredClone(actor),
      option: structuredClone(option),
    });
    return;
  }
  shape(m, ["type", "id", "expectedVersion", "input", "reason"]);
  text(m.reason);
  check(
    Number.isInteger(m.expectedVersion) && m.expectedVersion >= 0,
    "Нужна версия записи.",
  );
  const input = structuredClone(m.input);
  validateAdverse(input, now, p);
  const old = p.clinicalSupport?.adverseEvents.find((a) => a.id === m.id),
    last = old?.versions.at(-1);
  check(
    (last?.version ?? 0) === m.expectedVersion,
    "Нежелательное явление изменилось.",
  );
  check(!last || m.reason.trim(), "Укажите причину изменения.");
  p.clinicalSupport ??= { evaluations: [], decisions: [], adverseEvents: [] };
  check(
    p.clinicalSupport.adverseEvents.length < 500,
    "Достигнут лимит истории.",
  );
  const entry = old ?? { id: m.id, eventId: "cs-event-" + m.id, versions: [] };
  if (!old) p.clinicalSupport.adverseEvents.push(entry);
  entry.versions.push({
    version: m.expectedVersion + 1,
    input,
    plans: structuredClone(
      p.plan.filter((x) => input.suspectPlanIds.includes(x.id)),
    ),
    createdAt: now,
    by: structuredClone(actor),
    reason: m.reason,
  });
  const urgency = input.seriousness === "serious" ? "urgent" : "important";
  const detail =
    input.symptoms +
    "; тяжесть: " +
    input.severity +
    "; серьёзность: " +
    input.seriousness +
    "; причинность: " +
    input.causality +
    ". " +
    input.assessment;
  let event = p.events.find((e) => e.id === entry.eventId);
  if (!event) {
    event = newCareEvent(
      entry.eventId,
      "Нежелательное явление",
      detail,
      urgency,
      m.id,
      actor,
      now,
    );
    p.events.push(event);
  } else {
    event.history.push({
      at: now,
      by: actor.name,
      status: event.status,
      note:
        "Предыдущая версия: " +
        event.assessment +
        "; " +
        event.action +
        "; " +
        event.outcome,
    });
    event.detail = detail;
    event.urgency = urgency;
    {
      event.status = "created";
      event.assessment = "";
      event.action = "";
      event.outcome = "";
    }
    event.history.push({
      at: now,
      by: actor.name,
      status: event.status,
      note: "Уточнение НЯ, версия " + entry.versions.length + ": " + m.reason,
    });
  }
}
