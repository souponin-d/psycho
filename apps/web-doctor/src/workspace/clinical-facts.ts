import type { Actor, PatientRecord } from "./model";
import {
  isAllowedIcd10Selection,
  type TerminologySelection,
} from "./terminology.ts";
import { grlsCatalog, type MedicineSelection } from "./grls.ts";

export type ClinicalFactCategory =
  "diagnosis" | "somatic" | "medication" | "allergy";
export type ClinicalFactStatus =
  | "unverified"
  | "confirmed"
  | "clarification"
  | "contradictory"
  | "unknown"
  | "inactive";
export type ClinicalFactValue =
  | { category: ClinicalFactCategory; state: "unknown" }
  | { category: ClinicalFactCategory; state: "unresolved"; text: string }
  | {
      category: "diagnosis";
      state: "known";
      condition: TerminologySelection;
      diagnosticStatus: "hypothesis" | "confirmed";
    }
  | { category: "somatic"; state: "known"; condition: TerminologySelection }
  | {
      category: "medication";
      state: "known";
      medicine: MedicineSelection;
      details: string;
    }
  | { category: "allergy"; state: "known"; substance: string; reaction: string }
  | { category: "allergy"; state: "none-known" };
export interface ClinicalFactOrigin {
  kind: "patient" | "document" | "clinician" | "relative" | "legacy";
  reference: string;
  quote: string;
  observedAt: string;
  legacyContent?: ClinicalFactValue;
}
export interface ClinicalFactVersion {
  version: number;
  content: ClinicalFactValue;
  origin: ClinicalFactOrigin;
  status: ClinicalFactStatus;
  changedAt: string;
  changedBy: Actor;
  verifiedAt: string;
  verifiedBy: Actor | null;
  reason: string;
}
export interface ClinicalFact {
  id: string;
  versions: ClinicalFactVersion[];
}
export interface ClinicalFactDraft {
  id: string;
  expectedVersion: number;
  content: ClinicalFactValue;
  origin: ClinicalFactOrigin;
  reason: string;
}
export type ClinicalFactDecision =
  "confirm" | "clarify" | "contradict" | "unknown" | "inactivate";
export type ClinicalFactMutation =
  | { type: "fact.save"; value: ClinicalFactDraft }
  | {
      type: "fact.review";
      id: string;
      expectedVersion: number;
      decision: ClinicalFactDecision;
      reason: string;
    };
export interface LegacyClinicalFact {
  key: string;
  content: ClinicalFactValue;
  origin: ClinicalFactOrigin;
  label: string;
  changed: boolean;
}
export const factCategoryLabels: Record<ClinicalFactCategory, string> = {
  diagnosis: "Диагнозы и рабочие гипотезы",
  somatic: "Соматические заболевания",
  medication: "Лекарства",
  allergy: "Аллергии",
};
export const factStatusLabels: Record<ClinicalFactStatus, string> = {
  unverified: "Не проверено",
  confirmed: "Подтверждено врачом",
  clarification: "Требует уточнения",
  contradictory: "Противоречие",
  unknown: "Неизвестно",
  inactive: "Неактуально",
};
export const factOriginLabels: Record<ClinicalFactOrigin["kind"], string> = {
  patient: "Со слов пациента",
  document: "Из документа",
  clinician: "Сведения врача",
  relative: "Со слов родственника",
  legacy: "Прежняя запись: источник требует уточнения",
};
const categories = Object.keys(factCategoryLabels);
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
export const latestFact = (fact: ClinicalFact) => fact.versions.at(-1)!;
export function factValueText(value: ClinicalFactValue): string {
  if (value.state === "unknown")
    return "Сведений нет; это не отрицательный ответ";
  if (value.state === "unresolved") return value.text;
  if (value.category === "allergy")
    return value.state === "none-known"
      ? "Известные аллергии отрицает — явное сообщение"
      : "" + value.substance + (value.reaction ? ` · ${value.reaction}` : "");
  if (value.category === "medication")
    return `${value.medicine.tradeName} · ${value.medicine.inn} · РУ ${value.medicine.registrationNumber}${value.details ? ` · ${value.details}` : ""}`;
  return `${value.condition.code} · ${value.condition.title}${value.category === "diagnosis" ? ` · ${value.diagnosticStatus === "confirmed" ? "Подтверждённый диагноз" : "Рабочая гипотеза"}` : ""}`;
}
export function legacyClinicalFacts(
  patient: PatientRecord,
  includeRecorded = false,
): LegacyClinicalFact[] {
  const rows: LegacyClinicalFact[] = [];
  const add = (
    key: string,
    content: ClinicalFactValue,
    quote: string,
    label: string,
  ) => {
    if (!quote.trim()) return;
    const origin: ClinicalFactOrigin = {
      kind: "legacy",
      reference: key,
      quote,
      observedAt: "",
      legacyContent: structuredClone(content),
    };
    const previous = (patient.clinicalFacts ?? [])
      .flatMap((f) => f.versions)
      .filter((v) => v.origin.kind === "legacy" && v.origin.reference === key);
    if (
      !includeRecorded &&
      previous.some((v) => stable(v.origin) === stable(origin))
    )
      return;
    rows.push({ key, content, origin, label, changed: previous.length > 0 });
  };
  for (const [field, category, label] of [
    ["allergies", "allergy", "Аллергии из профиля"],
    ["currentMedication", "medication", "Лекарства из профиля"],
  ] as const) {
    const text = patient.profile[field];
    if (text.trim())
      add(
        `profile:${field}`,
        { category, state: "unresolved", text },
        text,
        label,
      );
  }
  patient.profile.clinicalContext.somaticConditions.forEach((condition, i) =>
    add(
      `profile:somatic:${i}`,
      { category: "somatic", state: "known", condition },
      `${condition.code} ${condition.title} · ${condition.sourceVersion}`,
      "Соматика из профиля",
    ),
  );
  patient.episodes.forEach((e) => {
    if (e.status === "closed" || !e.diagnosis.trim()) return;
    add(
      `episode:${e.id}`,
      e.diagnosisCode
        ? {
            category: "diagnosis",
            state: "known",
            condition: e.diagnosisCode,
            diagnosticStatus: e.diagnosisStatus,
          }
        : { category: "diagnosis", state: "unresolved", text: e.diagnosis },
      `${e.diagnosis} · ${e.diagnosisStatus}`,
      `Эпизод: ${e.title}`,
    );
  });
  patient.visits
    .filter((v) => v.status !== "cancelled")
    .forEach((v) =>
      v.diagnoses.forEach((d, i) => {
        const { status, ...condition } = d;
        add(
          `visit:${v.id}:${i}`,
          {
            category: "diagnosis",
            state: "known",
            condition,
            diagnosticStatus: status,
          },
          `${d.code} ${d.title} · ${status} · ${d.sourceVersion}`,
          `Диагноз из приёма ${v.scheduledAt}`,
        );
      }),
    );
  patient.plan
    .filter((p) => p.kind === "medication" && p.status === "confirmed")
    .forEach((p) =>
      add(
        `plan:${p.id}`,
        p.medicine
          ? {
              category: "medication",
              state: "known",
              medicine: p.medicine,
              details: "Назначено в плане; фактический приём не подтверждён",
            }
          : { category: "medication", state: "unresolved", text: p.title },
        `${p.title} · ${p.dose} · ${p.schedule}`,
        "Назначение в плане, не подтверждение приёма",
      ),
    );
  return rows;
}
export class ClinicalFactError extends Error {
  public code: string;
  constructor(message: string, code = "validation") {
    super(message);
    this.code = code;
  }
}
function check(ok: unknown, message: string, code = "validation"): asserts ok {
  if (!ok) throw new ClinicalFactError(message, code);
}
function object(value: unknown): asserts value is Record<string, unknown> {
  check(
    !!value && typeof value === "object" && !Array.isArray(value),
    "Ожидался объект клинического факта.",
  );
}
function only(value: object, keys: string[]) {
  check(
    Object.keys(value).every((k) => keys.includes(k)),
    "Клинический факт содержит неизвестные поля.",
  );
}
function str(
  value: unknown,
  label: string,
  required = false,
  max = 20000,
): asserts value is string {
  check(
    typeof value === "string" &&
      value.length <= max &&
      (!required || value.trim().length > 0),
    `Проверьте ${label}.`,
  );
}
function validateOrigin(
  patient: PatientRecord,
  origin: ClinicalFactOrigin,
  previous: ClinicalFactVersion | undefined,
  now: string,
) {
  object(origin);
  only(origin, ["kind", "reference", "quote", "observedAt", "legacyContent"]);
  check(
    origin.kind === "legacy" || !Object.hasOwn(origin, "legacyContent"),
    "Снимок прежней записи допустим только для её источника.",
  );
  check(
    Object.keys(factOriginLabels).includes(origin.kind),
    "Неизвестное происхождение факта.",
  );
  str(origin.reference, "источник", true, 500);
  str(origin.quote, "исходный текст", true, 100000);
  str(origin.observedAt, "дату источника");
  if (origin.observedAt)
    check(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$/.test(
        origin.observedAt,
      ) &&
        Number.isFinite(Date.parse(origin.observedAt)) &&
        new Date(`${origin.observedAt.slice(0, 10)}T00:00:00Z`)
          .toISOString()
          .slice(0, 10) === origin.observedAt.slice(0, 10) &&
        Date.parse(origin.observedAt) <= Date.parse(now),
      "Проверьте дату источника: нужен момент с часовым поясом, не из будущего.",
    );
  if (origin.kind === "document") {
    const doc = patient.documents.find((d) => d.id === origin.reference);
    check(
      doc && doc.status !== "excluded" && doc.text.includes(origin.quote),
      "Документ или цитата не найдены в текущей карте либо документ исключён.",
    );
  }
  if (origin.kind === "legacy")
    check(
      legacyClinicalFacts(patient, true).some(
        (r) => stable(r.origin) === stable(origin),
      ) ||
        (previous && stable(previous.origin) === stable(origin)),
      "Прежняя запись не найдена; источник нельзя выдумать.",
    );
}
function condition(value: ClinicalFactValue): TerminologySelection | undefined {
  return value.state === "known" &&
    (value.category === "diagnosis" || value.category === "somatic")
    ? value.condition
    : undefined;
}
function medicine(value: ClinicalFactValue): MedicineSelection | undefined {
  return value.state === "known" && value.category === "medication"
    ? value.medicine
    : undefined;
}
function validateContent(
  content: ClinicalFactValue,
  previous: ClinicalFactVersion | undefined,
  legacy: LegacyClinicalFact | undefined,
  actor: Actor,
  now: string,
) {
  object(content);
  check(categories.includes(content.category), "Неизвестная категория факта.");
  if (legacy)
    check(
      legacy.content.category === content.category,
      "Категория прежней записи не совпадает.",
    );
  if (previous)
    check(
      previous.content.category === content.category,
      "Категорию факта нельзя переписать; создайте отдельный факт.",
    );
  if (content.state === "unknown") {
    only(content, ["category", "state"]);
    return;
  }
  if (content.state === "unresolved") {
    only(content, ["category", "state", "text"]);
    str(content.text, "прежний текст", true);
    check(
      (legacy && stable(legacy.content) === stable(content)) ||
        (previous && stable(previous.content) === stable(content)),
      "Неразобранный текст сохраняется только из прежней записи; уточните структуру.",
    );
    return;
  }
  if (content.category === "allergy" && content.state === "none-known") {
    only(content, ["category", "state"]);
    return;
  }
  check(content.state === "known", "Неизвестное состояние факта.");
  if (content.category === "diagnosis" || content.category === "somatic") {
    only(
      content,
      content.category === "diagnosis"
        ? ["category", "state", "condition", "diagnosticStatus"]
        : ["category", "state", "condition"],
    );
    object(content.condition);
    only(content.condition, [
      "system",
      "sourceOid",
      "sourceVersion",
      "code",
      "title",
    ]);
    check(
      isAllowedIcd10Selection(content.condition, [
        ...(previous && condition(previous.content)
          ? [condition(previous.content)!]
          : []),
        ...(legacy && condition(legacy.content)
          ? [condition(legacy.content)!]
          : []),
      ]),
      "Выберите запись МКБ-10.",
    );
    if (content.category === "diagnosis") {
      check(
        ["hypothesis", "confirmed"].includes(content.diagnosticStatus),
        "Проверьте статус диагноза.",
      );
      if (content.diagnosticStatus === "confirmed")
        check(
          actor.specialty === "psychiatrist" ||
            (legacy && stable(legacy.content) === stable(content)) ||
            (previous && stable(previous.content) === stable(content)),
          "Подтверждение диагноза доступно психиатру.",
          "forbidden",
        );
    }
  } else if (content.category === "medication") {
    only(content, ["category", "state", "medicine", "details"]);
    str(content.details, "сведения о приёме");
    check(
      grlsCatalog.allowed(
        content.medicine,
        previous
          ? medicine(previous.content)
          : legacy
            ? medicine(legacy.content)
            : undefined,
        now.slice(0, 10),
      ),
      "Выберите препарат из ГРЛС либо сохраните исходный исторический снимок.",
    );
  } else {
    only(content, ["category", "state", "substance", "reaction"]);
    str(content.substance, "аллерген", true, 500);
    str(content.reaction, "реакцию");
  }
}
export function applyClinicalFactMutation(
  patient: PatientRecord,
  mutation: ClinicalFactMutation,
  actor: Actor,
  now: string,
) {
  object(mutation);
  only(
    mutation,
    mutation.type === "fact.save"
      ? ["type", "value"]
      : ["type", "id", "expectedVersion", "decision", "reason"],
  );
  const draft = mutation.type === "fact.save" ? mutation.value : mutation;
  object(draft);
  if (mutation.type === "fact.save")
    only(draft, ["id", "expectedVersion", "content", "origin", "reason"]);
  str(draft.id, "идентификатор", true, 100);
  str(draft.reason, "причину");
  check(
    Number.isInteger(draft.expectedVersion) && draft.expectedVersion >= 0,
    "Проверьте версию факта.",
  );
  const list = (patient.clinicalFacts ??= []);
  const fact = list.find((f) => f.id === draft.id);
  const previous = fact ? latestFact(fact) : undefined;
  check(
    (previous?.version ?? 0) === draft.expectedVersion,
    "Версия клинического факта изменилась. Загрузите актуальные сведения.",
    "conflict",
  );
  check(
    !previous || previous.status !== "inactive",
    "Неактуальный факт остаётся в истории; создайте новый факт.",
  );
  let content: ClinicalFactValue,
    origin: ClinicalFactOrigin,
    status: ClinicalFactStatus;
  if (mutation.type === "fact.save") {
    const d = mutation.value;
    content = d.content;
    origin = d.origin;
    validateOrigin(patient, origin, previous, now);
    const legacy =
      origin.kind === "legacy"
        ? legacyClinicalFacts(patient, true).find(
            (r) => stable(r.origin) === stable(origin),
          )
        : undefined;
    if (!previous && legacy)
      check(
        !list.some((f) =>
          f.versions.some((v) => stable(v.origin) === stable(legacy.origin)),
        ),
        "Эта прежняя запись уже перенесена в контекст.",
        "conflict",
      );
    validateContent(content, previous, legacy, actor, now);
    if (previous || (legacy && stable(legacy.content) !== stable(content)))
      str(d.reason, "причину исправления", true);
    status = content.state === "unknown" ? "unknown" : "unverified";
  } else {
    check(previous, "Клинический факт не найден.");
    content = previous.content;
    origin = previous.origin;
    const statuses: Record<ClinicalFactDecision, ClinicalFactStatus> = {
      confirm: "confirmed",
      clarify: "clarification",
      contradict: "contradictory",
      unknown: "unknown",
      inactivate: "inactive",
    };
    check(
      Object.hasOwn(statuses, mutation.decision),
      "Неизвестное решение по факту.",
    );
    status = statuses[mutation.decision];
    if (mutation.decision === "confirm") {
      check(
        content.state !== "unknown" && content.state !== "unresolved",
        "Сначала уточните структурированное значение факта.",
      );
      if (content.category === "diagnosis")
        check(
          actor.specialty === "psychiatrist",
          "Подтверждение диагноза доступно психиатру.",
          "forbidden",
        );
      validateOrigin(patient, origin, previous, now);
    }
    if (mutation.decision === "unknown")
      check(
        content.state === "unknown",
        "Неизвестно не подменяет известные сведения; исправьте значение отдельной версией.",
      );
    if (
      mutation.decision === "contradict" ||
      mutation.decision === "inactivate"
    )
      str(mutation.reason, "причину решения", true);
  }
  check(list.length < 500 || !!fact, "Достигнут лимит фактов карты.");
  check(
    !fact || fact.versions.length < 200,
    "История факта достигла лимита; обратитесь к администратору.",
  );
  const version: ClinicalFactVersion = {
    version: (previous?.version ?? 0) + 1,
    content: structuredClone(content),
    origin: structuredClone(origin),
    status,
    changedAt: now,
    changedBy: structuredClone(actor),
    verifiedAt: status === "confirmed" ? now : "",
    verifiedBy: status === "confirmed" ? structuredClone(actor) : null,
    reason: draft.reason,
  };
  if (fact) fact.versions.push(version);
  else list.push({ id: draft.id, versions: [version] });
}
export function clinicalFactsContext(patient: PatientRecord): string[] {
  return (patient.clinicalFacts ?? [])
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((f) => {
      const v = latestFact(f);
      return `${f.id} | ${v.version} | ${v.content.category} | ${v.status} | ${factValueText(v.content)} | ${v.origin.kind} | ${v.origin.reference} | ${v.origin.observedAt} | ${v.origin.quote}`;
    });
}
