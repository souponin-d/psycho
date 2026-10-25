import {
  encounterFields,
  type Actor,
  type Command,
  type EncounterNotes,
  type Mutation,
  type PatientRecord,
  type Profile,
  type Stamp,
  type Visit,
} from "./model.ts";
import sourceData from "./source-data.json" with { type: "json" };
import { reviewForPlan, validateAviandrReview } from "./aviandr.ts";
import { isCurrentIcd10Selection } from "./terminology.ts";
export class DomainError extends Error {
  public code: string;
  constructor(message: string, code = "validation") {
    super(message);
    this.code = code;
  }
}
function requireValue(
  condition: unknown,
  message: string,
  code = "validation",
): asserts condition {
  if (!condition) throw new DomainError(message, code);
}
function text(value: string, label: string) {
  requireValue(
    typeof value === "string" && value.trim().length > 0,
    `Заполните ${label}.`,
  );
  requireValue(value.length <= 20000, `${label}: не более 20 000 символов.`);
}
function date(value: string, label: string) {
  const day = typeof value === "string" ? value.slice(0, 10) : "";
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
        value,
      ) &&
      Number.isFinite(Date.parse(value)) &&
      Number.isFinite(Date.parse(day)) &&
      new Date(day).toISOString().slice(0, 10) === day,
    `Укажите корректную дату: ${label}.`,
  );
}
function option(value: unknown, allowed: readonly string[]) {
  requireValue(
    typeof value === "string" && allowed.includes(value),
    "Недопустимое значение поля или статуса.",
  );
}
function writableVisit(patient: PatientRecord, id: string) {
  if (!id) return;
  const visit = find(patient.visits, id);
  requireValue(
    !["completed", "cancelled"].includes(visit.status),
    "Нельзя добавлять или менять записи завершённого или отменённого приёма. Создайте новый приём или дополнение.",
  );
}
function record(value: unknown): asserts value is Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "Ожидался объект записи.",
  );
}
function validateMutation(mutation: Mutation) {
  record(mutation);
  text(mutation.type, "тип действия");
  const definitions: Record<string, string> = {
    "assessment.save":
      "id,sourceId,sourceHash,formVersion,measuredAt,assessor,note,status",
    "profile.update":
      "name,birthDate,sex,phone,email,occupation,address,emergencyContact,representative,preferredContact,allergies,currentMedication,familyHistory,pastEpisodes,substanceUse,socialContext,reproductiveContext,goals,clinicalContext",
    "episode.save":
      "id,title,startedOn,status,phase,diagnosis,diagnosisStatus,endDate,summary",
    "visit.save":
      "id,scheduledAt,kind,format,status,reason,provenance,nextVisitAt,completedAt,startedAt,confirmedBy,cancellationReason,rationale",
    "measurement.add":
      "id,visitId,scale,title,version,measuredAt,completeness,assessor,window,sourceId,interpretation,provenance,externalForm",
    "plan.save":
      "id,visitId,kind,title,details,dose,schedule,startDate,endDate,dueDate,status,confirmedAt,confirmedBy,changeReason,replacesId,instructionUrl,patientInstructions,rationale",
    "report.add":
      "id,reportedAt,receivedAt,provenance,state,functioning,medication,medicationReason,adverseEffects,note,reviewedAt",
    "event.add":
      "id,title,detail,urgency,status,relatedId,dueAt,assignee,assessment,action,outcome,rationale",
    "consent.add":
      "id,purpose,status,signedOn,documentReference,person,scope,informing",
    "referral.save":
      "id,visitId,destination,urgency,category,reason,dueDate,status,outcome,rationale",
    "document.add": "id,title,documentDate,issuer,text,status,exclusionReason",
  };
  if (!Object.hasOwn(definitions, mutation.type)) {
    const shapes: Record<string, string> = {
      "visit.complete": "type,id",
      "plan.confirm": "type,id",
      "report.review": "type,id",
      "visit.cancel": "type,id,reason",
      "visit.addendum": "type,id,text,reason",
      "visit.print": "type,id,reason",
      "plan.status": "type,id,status,reason",
      "event.transition": "type,id,status,note",
      "message.send": "type,text",
      "document.facts": "type,id,facts",
      "patient.archive": "type,archived,reason",
    };
    requireValue(
      Object.hasOwn(shapes, mutation.type),
      "Неизвестный тип действия.",
    );
    const keys = shapes[mutation.type]!.split(",");
    requireValue(
      Object.keys(mutation).every((key) => keys.includes(key)),
      "Действие содержит неизвестные поля.",
    );
    for (const key of keys) {
      const value = (mutation as unknown as Record<string, unknown>)[key];
      if (key === "archived")
        requireValue(
          typeof value === "boolean",
          "Ожидался логический признак архива.",
        );
      else if (key === "facts") {
        requireValue(
          Array.isArray(value) && value.length <= 100,
          "Ожидался список не более 100 фактов.",
        );
        for (const fact of value) {
          record(fact);
          requireValue(
            Object.keys(fact).every((field) =>
              ["id", "field", "quote", "value", "confirmed"].includes(field),
            ),
            "Неизвестное поле факта.",
          );
          for (const field of ["id", "field", "quote", "value"])
            text(fact[field] as string, field);
          requireValue(
            typeof fact.confirmed === "boolean",
            "Ожидался признак подтверждения факта.",
          );
        }
        requireValue(
          new Set(value.map((fact) => fact.id)).size === value.length,
          "Идентификаторы фактов должны быть уникальны.",
        );
      } else text(value as string, key);
    }
    if (mutation.type === "plan.status")
      option(mutation.status, ["completed", "stopped"]);
    return;
  }
  const raw = (mutation as unknown as { value: unknown }).value;
  record(raw);
  const extras: Record<string, string> = {
    "assessment.save": "responses",
    "visit.save":
      "notes,diagnoses,durationMinutes,addenda,sourceIds,completionSnapshot",
    "measurement.add": "score,maximum,answers",
    "plan.save": "sourceIds,aviandrReview",
    "report.add": "mood,anxiety,sleepHours,safetyConcern",
    "event.add": "sourceIds,history",
    "referral.save": "sourceIds",
    "document.add": "facts",
  };
  const fields = definitions[mutation.type]!.split(",");
  const allowed = new Set([
    ...fields,
    ...(extras[mutation.type]?.split(",") ?? []),
    "author",
    "createdAt",
  ]);
  requireValue(
    Object.keys(raw).every((key) => allowed.has(key)),
    "Запись содержит неизвестные поля.",
  );
  for (const field of fields)
    if (field !== "clinicalContext")
      requireValue(
        typeof raw[field] === "string" &&
          (raw[field] as string).length <= 20000,
        `Ожидалось текстовое поле: ${field}.`,
      );
  if (mutation.type !== "profile.update") {
    text(raw.id as string, "идентификатор");
    requireValue(
      (raw.id as string).length <= 100,
      "Слишком длинный идентификатор.",
    );
  }
  const numeric = (key: string, max = Number.MAX_VALUE) =>
    requireValue(
      raw[key] === null ||
        (typeof raw[key] === "number" &&
          Number.isFinite(raw[key]) &&
          raw[key] >= 0 &&
          raw[key] <= max),
      `Ожидалось число или null: ${key}.`,
    );
  const array = (key: string): unknown[] => {
    requireValue(Array.isArray(raw[key]), `Ожидался список: ${key}.`);
    return raw[key];
  };
  const optionalDate = (key: string) => {
    if (raw[key] !== "") date(raw[key] as string, key);
  };
  if (allowed.has("sourceIds"))
    requireValue(
      array("sourceIds").length <= 38 &&
        array("sourceIds").every(
          (id) =>
            typeof id === "string" && /^S(0[1-9]|[12][0-9]|3[0-8])$/.test(id),
        ),
      "Неизвестный источник.",
    );
  switch (mutation.type) {
    case "plan.save":
      if (mutation.value.aviandrReview !== undefined)
        validateAviandrReview(mutation.value.aviandrReview);
      break;
    case "profile.update": {
      record(raw.clinicalContext);
      const context = raw.clinicalContext;
      for (const key of ["complaints", "illnessHistory"])
        requireValue(
          typeof context[key] === "string" && context[key].length <= 20000,
          `Ожидалось текстовое поле контекста: ${key}.`,
        );
      requireValue(
        Array.isArray(context.somaticConditions) &&
          context.somaticConditions.every(isCurrentIcd10Selection),
        "Соматические заболевания выбираются из текущего учебного каталога МКБ-10.",
      );
      break;
    }
    case "assessment.save": {
      option(raw.status, ["unapproved"]);
      option(raw.assessor, ["patient", "clinician"]);
      date(raw.measuredAt as string, "дата заполнения");
      const source = sourceData.find((s) => s.id === raw.sourceId);
      requireValue(
        source && /^S(2[1-9]|3[0-8])$/.test(source.id),
        "Для формы нужен источник из реестра шкал.",
      );
      requireValue(
        raw.sourceHash === source.sha256 &&
          raw.formVersion === `source-${source.sha256.slice(0, 12)}-draft-1`,
        "Версия формы не совпадает с источником.",
      );
      record(raw.responses);
      requireValue(
        Object.keys(raw.responses).length <= 400,
        "Слишком много ответов.",
      );
      for (const [key, answer] of Object.entries(raw.responses)) {
        requireValue(
          /^[a-zA-Z0-9_.-]{1,100}$/.test(key),
          "Некорректный идентификатор пункта.",
        );
        requireValue(
          answer === null ||
            (typeof answer === "string" && answer.length <= 2000) ||
            (typeof answer === "number" &&
              Number.isFinite(answer) &&
              answer >= -1000 &&
              answer <= 1000),
          "Ответ должен быть числом, текстом или пропуском.",
        );
      }
      break;
    }
    case "visit.save":
      requireValue(
        Number.isInteger(raw.durationMinutes),
        "Продолжительность должна быть целым числом.",
      );
      record(raw.notes);
      requireValue(
        Object.keys(raw.notes).every((key) =>
          encounterFields.includes(key as (typeof encounterFields)[number]),
        ),
        "Неизвестное поле приёма.",
      );
      for (const key of encounterFields)
        requireValue(
          typeof raw.notes[key] === "string" &&
            (raw.notes[key] as string).length <= 20000,
          `Ожидалось текстовое поле: ${key}.`,
        );
      requireValue(
        array("diagnoses").every(
          (diagnosis) =>
            diagnosis &&
            typeof diagnosis === "object" &&
            isCurrentIcd10Selection(diagnosis) &&
            ["hypothesis", "confirmed"].includes(
              (diagnosis as { status?: unknown }).status as string,
            ),
        ),
        "Диагноз выбирается из текущего учебного каталога МКБ-10.",
      );
      requireValue(
        raw.completionSnapshot == null && array("addenda").length === 0,
        "Снимок и дополнения создаются отдельным подтверждением.",
      );
      option(raw.kind, ["initial", "follow-up", "unscheduled"]);
      option(raw.format, ["in-person", "remote"]);
      option(raw.provenance, ["patient", "clinician", "relative", "document"]);
      optionalDate("nextVisitAt");
      break;
    case "measurement.add":
      numeric("score");
      numeric("maximum");
      requireValue(
        array("answers").length <= 1000 &&
          array("answers").every(
            (answer) =>
              answer === null ||
              (typeof answer === "number" &&
                Number.isFinite(answer) &&
                answer >= 0),
          ),
        "Ожидался числовой ответ или пропуск.",
      );
      option(raw.scale, [
        "PHQ-9",
        "GAD-7",
        "HARS",
        "HDRS-17",
        "MADRS",
        "HCL-32",
        "HCL-33",
        "YMRS",
        "C-SSRS",
        "CGI",
        "KOP-25",
        "custom",
      ]);
      option(raw.completeness, ["complete", "partial", "not-assessed"]);
      option(raw.assessor, ["patient", "clinician"]);
      option(raw.provenance, ["patient", "clinician", "relative", "document"]);
      break;
    case "plan.save":
      option(raw.kind, [
        "medication",
        "psychotherapy",
        "assessment",
        "lifestyle",
        "follow-up",
      ]);
      for (const key of ["startDate", "endDate", "dueDate"]) optionalDate(key);
      break;
    case "report.add":
      numeric("mood", 10);
      numeric("anxiety", 10);
      numeric("sleepHours", 24);
      requireValue(
        typeof raw.safetyConcern === "boolean",
        "Ожидался признак безопасности.",
      );
      option(raw.state, ["completed", "cannot", "declined"]);
      option(raw.medication, ["taken", "missed", "no-mark", "not-applicable"]);
      break;
    case "event.add":
      option(raw.urgency, ["routine", "important", "urgent"]);
      optionalDate("dueAt");
      array("history");
      break;
    case "consent.add":
      option(raw.purpose, ["care", "data", "communication", "disclosure"]);
      option(raw.status, ["documented", "refused", "withdrawn"]);
      break;
    case "referral.save":
      optionalDate("dueDate");
      break;
    case "document.add":
      optionalDate("documentDate");
      option(raw.status, ["unverified", "verified", "excluded"]);
      array("facts");
      break;
  }
}
function find<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((x) => x.id === id);
  requireValue(item, "Запись не найдена.", "not-found");
  return item;
}
function upsert<T extends Stamp>(
  items: T[],
  value: T,
  actor: Actor,
  now: string,
) {
  const i = items.findIndex((x) => x.id === value.id);
  const old = items[i];
  const stamped = {
    ...value,
    author: old?.author ?? actor.name,
    createdAt: old?.createdAt ?? now,
  };
  if (i < 0) items.push(stamped);
  else items[i] = stamped;
}
function add<T extends Stamp>(items: T[], value: T, actor: Actor, now: string) {
  requireValue(
    !items.some((x) => x.id === value.id),
    "Запись с таким идентификатором уже существует.",
    "conflict",
  );
  upsert(items, value, actor, now);
}
export function blankNotes(): EncounterNotes {
  return Object.fromEntries(
    encounterFields.map((key) => [key, ""]),
  ) as EncounterNotes;
}
export function createPatient(
  input: Partial<Profile>,
  actor: Actor,
  now: string,
  id: string,
): PatientRecord {
  const profile: Profile = {
    name: "",
    birthDate: "",
    sex: "unspecified",
    phone: "",
    email: "",
    occupation: "",
    address: "",
    emergencyContact: "",
    representative: "",
    preferredContact: "",
    allergies: "",
    currentMedication: "",
    familyHistory: "",
    pastEpisodes: "",
    substanceUse: "",
    socialContext: "",
    reproductiveContext: "",
    goals: "",
    clinicalContext: {
      complaints: "",
      illnessHistory: "",
      somaticConditions: [],
    },
    ...input,
  };
  validateProfile(profile, now);
  return {
    id,
    code: `П-${id
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(-6)
      .toUpperCase()}`,
    clinicId: actor.clinicId,
    doctorId: actor.id,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    archived: false,
    profile,
    episodes: [],
    visits: [],
    measurements: [],
    plan: [],
    reports: [],
    events: [],
    consents: [],
    messages: [],
    referrals: [],
    documents: [],
    audit: [],
    commandIds: [],
  };
}
function validateProfile(profile: Profile, now: string) {
  for (const [key, value] of Object.entries(profile))
    if (key !== "clinicalContext")
      requireValue(
        typeof value === "string" && value.length <= 20000,
        "Профиль должен содержать текстовые поля не длиннее 20 000 символов.",
      );
  option(profile.sex, ["female", "male", "unspecified"]);
  requireValue(
    profile.clinicalContext &&
      typeof profile.clinicalContext.complaints === "string" &&
      typeof profile.clinicalContext.illnessHistory === "string" &&
      profile.clinicalContext.complaints.length <= 20000 &&
      profile.clinicalContext.illnessHistory.length <= 20000 &&
      profile.clinicalContext.somaticConditions.every(isCurrentIcd10Selection),
    "Контекст пациента содержит недопустимые данные МКБ-10.",
  );
  text(profile.name, "имя пациента");
  date(profile.birthDate, "дата рождения");
  requireValue(
    profile.birthDate.length === 10,
    "Укажите календарную дату рождения.",
  );
  requireValue(
    profile.birthDate <= now.slice(0, 10),
    "Дата рождения не может быть в будущем.",
  );
  requireValue(
    profile.name.trim().length <= 200,
    "Имя: не более 200 символов.",
  );
  if (profile.email)
    requireValue(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email),
      "Проверьте адрес электронной почты.",
    );
}
export function createVisit(id: string, now: string, actor: Actor): Visit {
  return {
    id,
    createdAt: now,
    author: actor.name,
    scheduledAt: now,
    durationMinutes: 45,
    kind: "initial",
    format: "in-person",
    status: "scheduled",
    reason: "",
    notes: blankNotes(),
    diagnoses: [],
    provenance: "patient",
    nextVisitAt: "",
    completedAt: "",
    startedAt: "",
    confirmedBy: "",
    cancellationReason: "",
    addenda: [],
    sourceIds: [],
    rationale: "",
  };
}
export function completionErrors(
  patient: PatientRecord,
  visit: Visit,
): string[] {
  const errors: string[] = [];
  if (!visit.notes.safetyConclusion.trim())
    errors.push("Зафиксируйте заключение по безопасности");
  if (!visit.notes.conclusion.trim()) errors.push("Заполните заключение врача");
  if (!visit.notes.recommendations.trim())
    errors.push("Укажите рекомендации и следующий шаг");
  const consent = patient.consents.filter((c) => c.purpose === "care").at(-1);
  if (consent?.status !== "documented")
    errors.push("Зафиксируйте документированное согласие на помощь");
  if (
    visit.format === "remote" &&
    patient.consents.filter((c) => c.purpose === "communication").at(-1)
      ?.status !== "documented"
  )
    errors.push(
      "Для дистанционного контакта зафиксируйте основание и согласие на связь",
    );
  return errors;
}
export function applyCommand(
  patient: PatientRecord,
  command: Command,
  actor: Actor,
  now: string,
): PatientRecord {
  requireValue(
    patient.clinicId === actor.clinicId && patient.doctorId === actor.id,
    "Нет доступа к этому пациенту.",
    "forbidden",
  );
  requireValue(
    command.commandId && command.commandId.length <= 100,
    "Некорректный идентификатор действия.",
  );
  if (patient.commandIds.includes(command.commandId)) return patient;
  requireValue(
    patient.revision === command.expectedRevision,
    "Карта изменена в другой сессии. Загрузите актуальную версию перед сохранением.",
    "conflict",
  );
  requireValue(
    !patient.archived ||
      command.mutation.type === "patient.archive" ||
      command.mutation.type === "visit.print",
    "Карта в архиве. Сначала возобновите наблюдение.",
  );
  const p = structuredClone(patient);
  const m = command.mutation;
  validateMutation(m);
  let targetId =
    "id" in m ? m.id : "value" in m && "id" in m.value ? m.value.id : p.id;
  const stamp = { createdAt: now, author: actor.name };
  switch (m.type) {
    case "assessment.save": {
      p.assessmentDrafts ??= [];
      const previous = p.assessmentDrafts.find(
        (item) => item.id === m.value.id,
      );
      requireValue(
        !previous ||
          (previous.sourceId === m.value.sourceId &&
            previous.sourceHash === m.value.sourceHash &&
            previous.formVersion === m.value.formVersion),
        "Другая версия формы сохраняется отдельным черновиком.",
      );
      upsert(p.assessmentDrafts, m.value, actor, now);
      break;
    }
    case "profile.update":
      validateProfile(m.value, now);
      p.profile = structuredClone(m.value);
      break;
    case "episode.save": {
      option(m.value.status, ["active", "remission", "closed"]);
      option(m.value.phase, [
        "assessment",
        "acute",
        "continuation",
        "maintenance",
      ]);
      option(m.value.diagnosisStatus, ["hypothesis", "confirmed"]);
      text(m.value.title, "название эпизода");
      date(m.value.startedOn, "начало эпизода");
      if (m.value.diagnosisStatus === "confirmed")
        requireValue(
          actor.specialty === "psychiatrist",
          "Подтверждение психиатрического диагноза доступно психиатру.",
        );
      if (m.value.status === "closed") {
        date(m.value.endDate, "завершение эпизода");
        text(m.value.summary, "итог эпизода");
      }
      upsert(p.episodes, m.value, actor, now);
      break;
    }
    case "visit.save": {
      const old = p.visits.find((v) => v.id === m.value.id);
      requireValue(
        !old || !["completed", "cancelled"].includes(old.status),
        "Завершённый или отменённый приём нельзя переписать. Добавьте отдельное дополнение.",
      );
      requireValue(
        ["scheduled", "in-progress"].includes(m.value.status),
        "Для завершения приёма используйте подтверждение.",
      );
      date(m.value.scheduledAt, "время приёма");
      requireValue(
        m.value.durationMinutes >= 5 && m.value.durationMinutes <= 240,
        "Продолжительность приёма: от 5 до 240 минут.",
      );
      if (
        m.value.diagnoses.some((diagnosis) => diagnosis.status === "confirmed")
      )
        requireValue(
          actor.specialty === "psychiatrist",
          "Подтверждение психиатрического диагноза доступно психиатру.",
        );
      const value = {
        ...m.value,
        completionSnapshot: null,
        addenda: [],
        completedAt: "",
        confirmedBy: "",
        startedAt:
          old?.startedAt || (m.value.status === "in-progress" ? now : ""),
      };
      upsert(p.visits, value, actor, now);
      break;
    }
    case "visit.complete": {
      const v = find(p.visits, m.id);
      requireValue(
        v.status === "in-progress" || v.status === "scheduled",
        "Этот приём уже завершён или отменён.",
      );
      const errors = completionErrors(p, v);
      requireValue(errors.length === 0, errors.join(". "));
      v.status = "completed";
      v.completedAt = now;
      v.confirmedBy = actor.name;
      v.completionSnapshot = structuredClone({
        patientName: p.profile.name,
        measurements: p.measurements.filter((item) => item.visitId === v.id),
        plan: p.plan.filter(
          (item) => item.visitId === v.id && item.status !== "draft",
        ),
        referrals: p.referrals.filter(
          (item) => item.visitId === v.id && item.status !== "draft",
        ),
      });
      break;
    }
    case "visit.cancel": {
      const v = find(p.visits, m.id);
      requireValue(
        v.status !== "completed",
        "Завершённый приём нельзя отменить.",
      );
      text(m.reason, "причину отмены");
      v.status = "cancelled";
      v.cancellationReason = m.reason;
      break;
    }
    case "visit.print": {
      const visit = find(p.visits, m.id);
      requireValue(visit.status === "completed", "Для печати завершите приём.");
      requireValue(m.reason.trim(), "Укажите цель копии.");
      break;
    }
    case "visit.addendum": {
      const v = find(p.visits, m.id);
      requireValue(
        v.status === "completed",
        "Дополнение доступно после завершения приёма.",
      );
      text(m.text, "текст дополнения");
      text(m.reason, "причину дополнения");
      v.addenda.push({
        id: command.commandId,
        ...stamp,
        text: m.text,
        reason: m.reason,
      });
      break;
    }
    case "measurement.add": {
      const v = m.value;
      text(v.title, "название оценки");
      text(v.version, "версию формы");
      text(v.externalForm, "источник результата");
      date(v.measuredAt, "измерение");
      writableVisit(p, v.visitId);
      if (v.completeness === "complete")
        requireValue(
          !v.answers.some((a) => a === null),
          "В полной оценке не может быть пропусков.",
        );
      if (v.completeness !== "complete")
        requireValue(
          v.score === null,
          "Неполная оценка сохраняется без итогового балла.",
        );
      if (v.score !== null)
        requireValue(
          Number.isFinite(v.score) &&
            v.score >= 0 &&
            (v.maximum === null || v.score <= v.maximum),
          "Проверьте итоговый балл и максимум формы.",
        );
      if (["HARS", "HDRS-17", "MADRS", "YMRS", "CGI"].includes(v.scale))
        requireValue(
          v.assessor === "clinician",
          "Эта шкала требует экспертной оценки врача.",
        );
      add(p.measurements, v, actor, now);
      break;
    }
    case "plan.save": {
      const old = p.plan.find((x) => x.id === m.value.id);
      requireValue(
        !old || old.status === "draft",
        "Подтверждённый план нельзя переписать. Создайте новую запись с причиной изменения.",
      );
      text(m.value.title, "назначение");
      requireValue(
        m.value.status === "draft",
        "Сначала сохраните черновик плана.",
      );
      writableVisit(p, m.value.visitId);
      if (old) writableVisit(p, old.visitId);
      if (m.value.replacesId) {
        find(p.plan, m.value.replacesId);
        text(m.value.changeReason, "причину изменения плана");
      }
      upsert(
        p.plan,
        {
          ...m.value,
          ...(m.value.aviandrReview
            ? { aviandrReview: reviewForPlan(p, m.value, now, actor.name) }
            : {}),
          confirmedAt: "",
          confirmedBy: "",
        },
        actor,
        now,
      );
      break;
    }
    case "plan.confirm": {
      const item = find(p.plan, m.id);
      writableVisit(p, item.visitId);
      requireValue(item.status === "draft", "Запись уже подтверждена.");
      text(item.rationale, "основание решения");
      text(item.patientInstructions, "указания пациенту");
      if (item.kind === "medication") {
        text(item.dose, "дозировку");
        text(item.schedule, "режим приёма");
        requireValue(
          /^https:\/\//.test(item.instructionUrl),
          "Добавьте HTTPS-ссылку на проверенную инструкцию препарата.",
        );
      }
      if (item.aviandrReview)
        item.aviandrReview = reviewForPlan(p, item, now, actor.name);
      item.status = "confirmed";
      item.confirmedAt = now;
      item.confirmedBy = actor.name;
      if (item.replacesId) {
        const old = find(p.plan, item.replacesId);
        requireValue(
          old.status === "confirmed",
          "Изменяемая запись уже не действует.",
          "conflict",
        );
        old.status = "stopped";
        old.changeReason = item.changeReason;
      }
      break;
    }
    case "plan.status": {
      const item = find(p.plan, m.id);
      requireValue(
        item.status === "confirmed",
        "Изменить статус можно только у действующего назначения.",
      );
      text(m.reason, "причину изменения");
      item.status = m.status;
      item.changeReason = m.reason;
      break;
    }
    case "report.add": {
      date(m.value.reportedAt, "время самоотчёта");
      for (const v of [m.value.mood, m.value.anxiety])
        requireValue(
          v === null || (Number.isFinite(v) && v >= 0 && v <= 10),
          "Самооценка должна быть от 0 до 10 либо отсутствовать.",
        );
      requireValue(
        m.value.sleepHours === null ||
          (m.value.sleepHours >= 0 && m.value.sleepHours <= 24),
        "Сон: от 0 до 24 часов либо нет данных.",
      );
      add(
        p.reports,
        { ...m.value, receivedAt: now, reviewedAt: "" },
        actor,
        now,
      );
      if (m.value.safetyConcern || m.value.adverseEffects.trim()) {
        add(
          p.events,
          {
            id: `event-${command.commandId}`,
            ...stamp,
            title: m.value.safetyConcern
              ? "Пациент отметил вопрос безопасности"
              : "Нежелательное явление в дневнике",
            detail: m.value.adverseEffects || m.value.note,
            urgency: m.value.safetyConcern ? "urgent" : "important",
            status: "created",
            relatedId: m.value.id,
            dueAt: "",
            assignee: actor.name,
            assessment: "",
            action: "",
            outcome: "",
            history: [
              {
                at: now,
                by: actor.name,
                status: "created",
                note: "Получено явно отмеченное сообщение. Требуется оценка врача.",
              },
            ],
            sourceIds: [],
            rationale:
              "Прямое сообщение пациента, без вычисления клинического риска",
          },
          actor,
          now,
        );
      }
      break;
    }
    case "report.review":
      find(p.reports, m.id).reviewedAt = now;
      break;
    case "event.add": {
      text(m.value.title, "событие");
      add(
        p.events,
        {
          ...m.value,
          status: "created",
          assessment: "",
          action: "",
          outcome: "",
          history: [
            {
              at: now,
              by: actor.name,
              status: "created",
              note: m.value.detail,
            },
          ],
        },
        actor,
        now,
      );
      break;
    }
    case "event.transition": {
      const event = find(p.events, m.id);
      const order = ["created", "acknowledged", "assessed", "acted", "closed"];
      requireValue(
        order.indexOf(m.status) === order.indexOf(event.status) + 1,
        "Соблюдайте порядок этапов: получение, оценка, действие, закрытие.",
      );
      text(m.note, "результат этапа");
      event.status = m.status;
      if (m.status === "assessed") event.assessment = m.note;
      if (m.status === "acted") event.action = m.note;
      if (m.status === "closed") event.outcome = m.note;
      event.history.push({
        at: now,
        by: actor.name,
        status: m.status,
        note: m.note,
      });
      break;
    }
    case "consent.add": {
      text(m.value.documentReference, "ссылку или номер документа");
      text(m.value.person, "лицо, выразившее волю");
      date(m.value.signedOn, "дата документа");
      if (m.value.status === "documented")
        text(m.value.informing, "содержание информирования");
      add(p.consents, m.value, actor, now);
      break;
    }
    case "message.send": {
      requireValue(
        p.consents
          .filter((consent) => consent.purpose === "communication")
          .at(-1)?.status === "documented",
        "Сначала зафиксируйте действующее согласие на дистанционную связь",
      );
      text(m.text, "сообщение");
      targetId = command.commandId;
      p.messages.push({
        id: command.commandId,
        ...stamp,
        direction: "doctor",
        text: m.text,
        status: "recorded",
        deliveredAt: "",
        readAt: "",
      });
      break;
    }
    case "referral.save": {
      option(m.value.status, ["draft", "issued", "attended", "declined"]);
      option(m.value.urgency, ["routine", "important", "urgent"]);
      option(m.value.category, ["required", "desirable"]);
      text(m.value.destination, "адресата направления");
      text(m.value.reason, "причину направления");
      const old = p.referrals.find((x) => x.id === m.value.id);
      if (old && old.status !== "draft") {
        requireValue(
          m.value.status !== "draft" &&
            (old.status === "issued" || old.status === m.value.status),
          "Подтверждённое направление нельзя вернуть на предыдущий этап.",
        );
        requireValue(
          [
            "reason",
            "destination",
            "visitId",
            "category",
            "urgency",
            "dueDate",
            "rationale",
            "sourceIds",
          ].every(
            (key) =>
              JSON.stringify(m.value[key as keyof typeof m.value]) ===
              JSON.stringify(old[key as keyof typeof old]),
          ),
          "Выданное направление сохраняет исходные основания.",
        );
      } else {
        writableVisit(p, m.value.visitId);
        if (old) writableVisit(p, old.visitId);
      }
      if (m.value.status === "attended" || m.value.status === "declined")
        text(m.value.outcome, "результат направления");
      upsert(p.referrals, m.value, actor, now);
      break;
    }
    case "document.add": {
      text(m.value.title, "название документа");
      text(m.value.text, "текст документа");
      if (m.value.status === "excluded")
        text(m.value.exclusionReason, "основание исключения");
      add(
        p.documents,
        {
          ...m.value,
          facts: [],
          status: m.value.status === "excluded" ? "excluded" : "unverified",
        },
        actor,
        now,
      );
      break;
    }
    case "document.facts": {
      const doc = find(p.documents, m.id);
      requireValue(
        doc.status !== "excluded",
        "Материал исключён из клинического использования.",
      );
      for (const fact of m.facts) {
        text(fact.quote, "фрагмент оригинала");
        requireValue(
          doc.text.includes(fact.quote),
          "Фрагмент не найден в оригинале документа.",
        );
        text(fact.value, "значение факта");
      }
      doc.facts = structuredClone(m.facts);
      doc.status =
        m.facts.length && m.facts.every((f) => f.confirmed)
          ? "verified"
          : "unverified";
      break;
    }
    case "patient.archive":
      text(m.reason, "основание изменения статуса карты");
      if (m.archived) {
        requireValue(
          !p.visits.some((visit) =>
            ["scheduled", "in-progress"].includes(visit.status),
          ),
          "Завершите или отмените открытые приёмы перед архивацией.",
        );
        requireValue(
          !p.events.some((event) => event.status !== "closed"),
          "Закройте открытые события перед архивацией.",
        );
      }
      p.archived = m.archived;
      break;
    default: {
      const unreachable: never = m;
      throw new DomainError(`Неизвестное действие: ${String(unreachable)}`);
    }
  }
  p.revision += 1;
  p.updatedAt = now;
  p.commandIds.push(command.commandId);
  p.audit.push({
    id: command.commandId,
    ...stamp,
    action: m.type,
    targetId,
    detail: "reason" in m ? m.reason : "",
  });
  return p;
}
