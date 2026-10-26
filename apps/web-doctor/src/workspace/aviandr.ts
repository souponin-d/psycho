import { clinicalFactsContext } from "./clinical-facts.ts";
import catalog from "./aviandr-rules.json" with { type: "json" };
import type {
  AviandrContext,
  AviandrFinding,
  AviandrInputs,
  AviandrReview,
  PatientRecord,
  PlanItem,
} from "./model";

export const aviandr = catalog;
export const isAviandrSourceCurrent = (review: AviandrReview) =>
  review.sourceVersion === catalog.version &&
  review.sourceHash === catalog.sha256 &&
  review.sourceDate === catalog.sourceDate &&
  review.sourceUrl === catalog.url &&
  review.status === catalog.status;
export const isAviandr = (title: string) =>
  /(?:^|[^а-яa-z])(?:авиандр|aviandr|маритупирдин|maritupirdine)(?:$|[^а-яa-z])/iu.test(
    title,
  );
export function aviandrContext(
  patient: PatientRecord,
  planId: string,
): AviandrContext {
  const {
    birthDate,
    allergies,
    clinicalContext,
    currentMedication,
    reproductiveContext,
    substanceUse,
  } = patient.profile;
  return {
    ...(patient.clinicalFacts?.length
      ? { clinicalFacts: clinicalFactsContext(patient) }
      : {}),
    birthDate,
    allergies,
    conditions: clinicalContext.somaticConditions
      .map((item) => `${item.code} ${item.title}`)
      .join("; "),
    currentMedication,
    reproductiveContext,
    substanceUse,
    diagnoses: patient.episodes
      .filter((e) => e.status !== "closed")
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => `${e.title} | ${e.diagnosis} | ${e.diagnosisStatus}`)
      .concat(
        patient.visits
          .filter((v) => v.status !== "cancelled")
          .slice()
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .flatMap((v) =>
            v.diagnoses
              .slice()
              .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
              .map(
                (d) =>
                  `${v.id} | ${d.code} | ${d.title} | ${d.status} | ${d.sourceVersion}`,
              ),
          ),
      ),
    medicines: patient.plan
      .filter(
        (p) =>
          p.id !== planId && p.kind === "medication" && p.status !== "draft",
      )
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(
        (p) =>
          `${p.title} | ${p.dose} | ${p.schedule} | ${p.startDate} | ${p.endDate} | ${p.status} | ${p.changeReason}`,
      ),
  };
}
export const sameAviandrContext = (a: AviandrContext, b: AviandrContext) =>
  (Object.keys(b) as (keyof AviandrContext)[]).every(
    (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );
export function newAviandrReview(
  patient: PatientRecord,
  planId: string,
): AviandrReview {
  return {
    status: "unapproved",
    sourceVersion: catalog.version,
    sourceHash: catalog.sha256,
    sourceDate: catalog.sourceDate,
    sourceUrl: catalog.url,
    context: aviandrContext(patient, planId),
    inputs: {
      indication: "unknown",
      hypersensitivity: "unknown",
      epilepsy: "unknown",
      organicBrainDisease: "unknown",
      liverFailure: "unknown",
      pregnancy: "unknown",
      breastfeeding: "unknown",
      galactoseDisorder: "unknown",
      cardiovascularDisease: "unknown",
      maoUse: "unknown",
      lastMaoDate: "",
      serotonergic: "unknown",
      sedative: "unknown",
      cyp2d6: "unknown",
      alcohol: "unknown",
      medicationListVerified: "unknown",
      egfr: null,
      egfrUnit: "unknown",
      egfrDate: "",
      evidence: "",
    },
    findings: [],
    checkedAt: "",
    checkedBy: "",
  };
}
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
function check(
  condition: unknown,
  message = "Некорректные данные проверки Авиандра.",
): asserts condition {
  if (!condition) throw new Error(message);
}
export function validateAviandrReview(value: AviandrReview) {
  check(value && typeof value === "object" && !Array.isArray(value));
  check(
    Object.keys(value).every((k) =>
      [
        "status",
        "sourceVersion",
        "sourceHash",
        "sourceDate",
        "sourceUrl",
        "context",
        "inputs",
        "findings",
        "checkedAt",
        "checkedBy",
      ].includes(k),
    ),
  );
  check(
    value.status === "unapproved" &&
      value.sourceVersion === catalog.version &&
      value.sourceHash === catalog.sha256 &&
      value.sourceDate === catalog.sourceDate &&
      value.sourceUrl === catalog.url,
    "Версия проверки Авиандра не утверждена или не совпадает с источником.",
  );
  const input = value.inputs;
  check(input && typeof input === "object" && !Array.isArray(input));
  const flags = [
    ...catalog.rules.map((r) => r.id),
    "maoUse",
    "medicationListVerified",
  ];
  check(
    Object.keys(input).length === flags.length + 6 &&
      Object.keys(input).every((k) =>
        [
          ...flags,
          "indication",
          "lastMaoDate",
          "egfr",
          "egfrUnit",
          "egfrDate",
          "evidence",
        ].includes(k),
      ),
  );
  for (const key of flags)
    check(
      ["unknown", "yes", "no"].includes(
        input[key as keyof AviandrInputs] as string,
      ),
    );
  check(["unknown", "gad", "post-covid", "other"].includes(input.indication));
  check(["unknown", "ml/min", "ml/min/1.73m2"].includes(input.egfrUnit));
  check(
    input.egfr === null ||
      (typeof input.egfr === "number" &&
        Number.isFinite(input.egfr) &&
        input.egfr >= 0 &&
        input.egfr <= 300),
  );
  for (const key of ["egfrDate", "lastMaoDate"] as const)
    check(
      input[key] === "" ||
        (typeof input[key] === "string" && validDate(input[key])),
    );
  check(typeof input.evidence === "string" && input.evidence.length <= 20000);
  check(
    value.context &&
      typeof value.context === "object" &&
      !Array.isArray(value.context),
  );
  const context = value.context;
  check(
    Object.keys(context).length ===
      (context.clinicalFacts === undefined ? 8 : 9) &&
      Object.keys(context).every((k) =>
        [
          "birthDate",
          "allergies",
          "conditions",
          "currentMedication",
          "reproductiveContext",
          "substanceUse",
          "diagnoses",
          "medicines",
          "clinicalFacts",
        ].includes(k),
      ),
  );
  for (const [key, v] of Object.entries(context)) {
    if (key === "diagnoses" || key === "medicines" || key === "clinicalFacts")
      check(
        Array.isArray(v) &&
          v.length <= 1000 &&
          v.every((s) => typeof s === "string" && s.length <= 200000),
      );
    else check(typeof v === "string" && v.length <= 20000);
  }
}
export function evaluateAviandr(
  review: AviandrReview,
  startDate: string,
): AviandrFinding[] {
  const input = review.inputs;
  const rows: AviandrFinding[] = [];
  const add = (
    id: string,
    title: string,
    status: AviandrFinding["status"],
    detail: string,
    section: string,
  ) => rows.push({ id, title, status, detail, section });
  const startValid = validDate(startDate);
  if (!startValid || !validDate(review.context.birthDate))
    add(
      "age",
      "Возраст на дату начала",
      "missing",
      "Нужны корректные дата рождения и дата начала лечения.",
      "4.1, 4.2",
    );
  else {
    const birth = review.context.birthDate;
    const age =
      Number(startDate.slice(0, 4)) -
      Number(birth.slice(0, 4)) -
      (startDate.slice(5) < birth.slice(5) ? 1 : 0);
    add(
      "age",
      "Возраст на дату начала",
      age < 18 ? "contraindication" : age === 18 ? "review" : "not-identified",
      age === 18
        ? "18 лет: формулировки возрастной границы в разделах 4.1 и 4.2 требуют клинической сверки."
        : `${age} лет. Проверяется только возрастное ограничение.`,
      "4.1, 4.2",
    );
  }
  add(
    "indication",
    "Основание назначения",
    input.indication === "unknown"
      ? "missing"
      : input.indication === "other"
        ? "review"
        : "not-identified",
    input.indication === "gad" || input.indication === "post-covid"
      ? "Врач выбрал контекст из раздела показаний. Диагноз и применимость подтверждает врач."
      : "Требуется сопоставить диагноз и клинический контекст с зарегистрированным показанием.",
    "4.1",
  );
  for (const rule of catalog.rules) {
    const answer = input[rule.id as keyof AviandrInputs];
    add(
      rule.id,
      rule.title,
      answer === "unknown"
        ? "missing"
        : answer === "yes"
          ? (rule.positive as AviandrFinding["status"])
          : "not-identified",
      answer === "unknown"
        ? "Не уточнено. Отсутствие сведений не считается отсутствием ограничения."
        : answer === "yes"
          ? "По уточнению врача выявлено условие из ОХЛП. Правило не утверждено; требуется клиническая оценка."
          : "По уточнению врача условие не отмечено. Это не исключает рисков препарата.",
      rule.section,
    );
  }
  const renalStatus =
    input.egfr === null || !input.egfrDate || !startValid
      ? "missing"
      : input.egfrUnit !== "ml/min" || input.egfrDate > startDate
        ? "review"
        : input.egfr < 60
          ? "contraindication"
          : "review";
  add(
    "renal",
    "Функция почек",
    renalStatus,
    renalStatus === "contraindication"
      ? "СКФ ниже 60 мл/мин. Условие противопоказания из ОХЛП; требуется клиническая оценка."
      : "Нужны СКФ с датой и единицами и оценка актуальности врачом. Индексированные единицы автоматически не пересчитываются; значение ≥60 само по себе не подтверждает применимость.",
    "4.2, 4.3",
  );
  let maoStatus: AviandrFinding["status"] = "missing";
  if (input.maoUse === "yes") maoStatus = "contraindication";
  else if (input.maoUse === "no" && !input.lastMaoDate)
    maoStatus = "not-identified";
  else if (
    input.maoUse === "no" &&
    startValid &&
    validDate(input.lastMaoDate)
  ) {
    const days =
      (Date.parse(startDate) - Date.parse(input.lastMaoDate)) / 86400000;
    maoStatus =
      days < 0 ? "review" : days < 14 ? "contraindication" : "not-identified";
  }
  add(
    "mao",
    "Ингибиторы МАО и срок после отмены",
    maoStatus,
    input.maoUse === "no" && !input.lastMaoDate
      ? "Врач указал отсутствие приёма, в том числе недавнего. Если препарат отменён, укажите дату отмены."
      : "Сопоставляются приём и дата отмены с началом лечения. В ОХЛП указан интервал 2 недели; правило не утверждено.",
    "4.3, 4.5",
  );
  add(
    "medicines",
    "Полнота лекарственного анамнеза",
    input.medicationListVerified === "yes" ? "review" : "missing",
    "Названия из свободного текста автоматически не классифицируются. Врач сверяет все действующие и недавно отменённые лекарства, безрецептурные средства и добавки; затем уточняет группы взаимодействий.",
    "4.5",
  );
  add(
    "regimen",
    "Доза, режим и длительность",
    "review",
    "Схему вводит врач и сопоставляет с разделом 4.2. Автоматический подбор и проверка свободного текста дозировки не выполняются.",
    "4.2",
  );
  return rows;
}
export function prepareAviandrReview(
  patient: PatientRecord,
  planId: string,
  review: AviandrReview,
  now: string,
  actor: string,
  startDate = now.slice(0, 10),
): AviandrReview {
  validateAviandrReview(review);
  check(
    sameAviandrContext(review.context, aviandrContext(patient, planId)),
    "Данные карты изменились. Сверьте контекст проверки Авиандра заново.",
  );
  check(
    validDate(startDate),
    "Нужна корректная дата начала проверки Авиандра.",
  );
  check(
    !review.inputs.egfrDate || review.inputs.egfrDate <= now.slice(0, 10),
    "Дата СКФ не может быть в будущем.",
  );
  check(
    !review.inputs.lastMaoDate || review.inputs.lastMaoDate <= now.slice(0, 10),
    "Дата состоявшейся отмены МАО не может быть в будущем.",
  );
  return {
    ...structuredClone(review),
    findings: evaluateAviandr(review, startDate),
    checkedAt: now,
    checkedBy: actor,
    status: "unapproved",
  };
}
export function reviewForPlan(
  patient: PatientRecord,
  plan: PlanItem,
  now: string,
  actor: string,
): AviandrReview | undefined {
  if (!plan.aviandrReview) return undefined;
  check(
    plan.kind === "medication" && isAviandr(plan.title),
    "Проверка Авиандра допустима только для этого препарата.",
  );
  return prepareAviandrReview(
    patient,
    plan.id,
    plan.aviandrReview,
    now,
    actor,
    plan.startDate,
  );
}
