import catalog from "./clinical-support-catalog.json" with { type: "json" };
import type { Actor, PatientRecord } from "./model";
import { latestFact } from "./clinical-facts.ts";
import type {
  ClinicalSignal,
  SupportCatalog,
  SupportInput,
  SupportResult,
  SupportFinding,
  SupportOptionResult,
} from "./clinical-support-types";
export const supportCatalog = catalog as SupportCatalog;
export const supportSignalLabels: Record<ClinicalSignal, string> = {
  suicidalIntent: "Актуальное суицидальное намерение",
  suicidePlan: "Актуальный суицидальный план",
  recentAttempt: "Недавняя попытка или подготовительные действия",
  unableStaySafe: "Не может обеспечить собственную безопасность",
  severeSelfNeglect: "Выраженная утрата способности заботиться о себе",
  currentMania: "Признаки текущей мании или гипомании",
  maniaHistory: "Мания или гипомания в анамнезе",
  psychosis: "Психотические симптомы",
  confusion: "Острое нарушение сознания или внимания",
  substanceProblem: "Проблемное употребление / интоксикация / отмена веществ",
  pregnancy: "Беременность",
  breastfeeding: "Грудное вскармливание",
  renalImpairment: "Нарушение функции почек",
  hepaticImpairment: "Нарушение функции печени",
  qtRisk: "Удлинение QT или значимый аритмический риск",
  seizures: "Судорожные приступы / эпилепсия",
  bleedingRisk: "Повышенный риск кровотечения",
  medicationListComplete: "Сверен фактический приём всех лекарств и добавок",
  priorAdequateTrial: "Подтверждена достаточная предыдущая попытка лечения",
  treatmentWorsening: "Ухудшение после начала или изменения лечения",
};
export function newSupportInput(): SupportInput {
  return {
    route: "gad",
    observations: [],
    functioning: "unknown",
    depressionSeverity: "unknown",
    response: "unknown",
    preference: "undecided",
    note: "",
  };
}
export const stableClinicalValue = (value: unknown): string =>
  JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
export function supportContextKey(
  p: PatientRecord,
  actor: Actor,
  now = new Date().toISOString(),
): string {
  return stableClinicalValue({
    asOf: now.slice(0, 10),
    safety: p.workflow?.safety ?? [],
    riskEvents: p.events
      .filter((e) => e.relatedId.startsWith("clinical-risk-"))
      .map((e) => ({ id: e.id, status: e.status, urgency: e.urgency })),
    catalog: supportCatalog,
    profile: p.profile,
    clinicalFacts: p.clinicalFacts ?? [],
    episodes: p.episodes,
    visits: p.visits.map((v) => ({
      id: v.id,
      status: v.status,
      diagnoses: v.diagnoses,
    })),
    plan: p.plan.filter((m) => m.kind === "medication" && m.status !== "draft"),
    assessments: p.workflow?.assessments ?? [],
    adverse: p.clinicalSupport?.adverseEvents ?? [],
    adherence: p.adherence ?? null,
    specialty: actor.specialty,
  });
}
const normalize = (v: string) =>
  v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
export function assertMedicationCandidate(
  p: PatientRecord,
  plan: import("./model").PlanItem,
) {
  if (plan.kind !== "medication" || !plan.medicine) return;
  const names = [
    plan.medicine.inn,
    plan.medicine.tradeName,
    ...plan.medicine.inn.split(/[+;,]/),
  ].map(normalize);
  const allergy = (p.clinicalFacts ?? []).some((f) => {
    const v = latestFact(f),
      c = v.content;
    return (
      v.status !== "inactive" &&
      c.category === "allergy" &&
      c.state === "known" &&
      names.includes(normalize(c.substance))
    );
  });
  if (allergy)
    throw new Error(
      "Выбранный препарат совпадает с записью об аллергии. Уточните и оформите аллергологический статус до подтверждения.",
    );
}
export function clinicalDrugClasses(inn: string): string[] {
  const parts = inn.split(/[+;,]/).map(normalize);
  return supportCatalog.drugClasses
    .filter((c) => c.inns.some((n) => parts.includes(normalize(n))))
    .map((c) => c.id);
}
export function supportOptionClasses(classes: string[]): string[] {
  return [
    ...new Set(
      classes.flatMap((id) => {
        const base = supportCatalog.drugClasses.find((c) => c.id === id);
        return !base
          ? [id]
          : supportCatalog.drugClasses
              .filter((c) =>
                base.inns.every((n) =>
                  c.inns.some((x) => normalize(x) === normalize(n)),
                ),
              )
              .map((c) => c.id);
      }),
    ),
  ];
}
function conditionFacts(p: PatientRecord) {
  const facts = (p.clinicalFacts ?? []).flatMap((f) => {
    const v = latestFact(f),
      c = v.content;
    return c.state === "known" &&
      (c.category === "diagnosis" || c.category === "somatic") &&
      v.status !== "inactive"
      ? [
          {
            id: f.id,
            code: c.condition.code,
            confirmed:
              v.status === "confirmed" &&
              (c.category !== "diagnosis" ||
                c.diagnosticStatus === "confirmed"),
            status: v.status,
          },
        ]
      : [];
  });
  for (const e of p.episodes)
    if (e.status !== "closed" && e.diagnosisCode)
      facts.push({
        id: e.id,
        code: e.diagnosisCode.code,
        confirmed: e.diagnosisStatus === "confirmed",
        status: "confirmed",
      });
  for (const v of p.visits.filter((v) => v.status === "completed"))
    for (const d of v.diagnoses)
      if (!facts.some((f) => f.code === d.code))
        facts.push({
          id: v.id,
          code: d.code,
          confirmed: d.status === "confirmed",
          status: "confirmed",
        });
  return facts;
}
export function evaluateSupport(
  p: PatientRecord,
  input: SupportInput,
  actor: Actor,
  now: string,
): SupportResult {
  const findings: SupportFinding[] = [];
  const add = (
    id: string,
    kind: SupportFinding["kind"],
    priority: SupportFinding["priority"],
    title: string,
    detail: string,
    sourceIds: string[],
    relatedIds: string[] = [],
    action: SupportFinding["action"] = "verify",
    category?: SupportFinding["category"],
  ) => {
    findings.push({
      id,
      kind,
      priority,
      title,
      detail,
      sourceIds,
      relatedIds,
      action,
      ...(category ? { category } : {}),
    });
  };
  const conditions = conditionFacts(p);
  const code = (prefixes: string[]) =>
    conditions.some(
      (c) =>
        !["contradictory", "clarification", "unknown"].includes(c.status) &&
        prefixes.some((x) => c.code === x || c.code.startsWith(x + ".")),
    );
  const psychoticHistory = code([
    "F20",
    "F21",
    "F22",
    "F23",
    "F24",
    "F25",
    "F28",
    "F29",
  ]);
  const derived: Partial<Record<ClinicalSignal, boolean>> = {
    maniaHistory: code(["F31"]),
    renalImpairment: code(["N18", "N19"]),
    hepaticImpairment: code(["K72"]),
    seizures: code(["G40"]),
  };
  const answer = (key: ClinicalSignal) =>
    input.observations.find((o) => o.key === key)?.answer ?? "unknown";
  const yes = (key: ClinicalSignal) => answer(key) === "yes" || !!derived[key];
  for (const key of Object.keys(derived) as ClinicalSignal[])
    if (derived[key] && answer(key) === "no")
      add(
        "conflict-" + key,
        "data-gap",
        "important",
        "Противоречивые сведения: " + supportSignalLabels[key],
        "Отрицательный ответ расходится со структурированной записью карты. Положительное основание сохраняется до уточнения.",
        ["medicines-nice"],
      );
  const age =
    Number(now.slice(0, 4)) -
    Number(p.profile.birthDate.slice(0, 4)) -
    (now.slice(5, 10) < p.profile.birthDate.slice(5) ? 1 : 0);
  const adult =
    Number.isFinite(age) &&
    age >= 18 &&
    /^\d{4}-\d{2}-\d{2}$/.test(p.profile.birthDate);
  if (!adult)
    add(
      "population",
      "data-gap",
      "important",
      "Вне взрослого маршрута",
      "Нужна отдельная оценка применимости по возрасту; стандартные взрослые варианты отложены.",
      ["gad-ru", "depression-ru"],
    );
  const lastPhq = (p.workflow?.assessments ?? [])
    .slice()
    .reverse()
    .filter((a) => a.source.scale === "PHQ-9")
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0];
  const lastDanger =
    (p.workflow?.assessments ?? [])
      .slice()
      .reverse()
      .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0]
      ?.immediateDanger === "yes";
  const danger =
    lastDanger ||
    (p.workflow?.safety ?? []).some(
      (e) => e.kind === "immediate-danger" && e.status !== "acted",
    ) ||
    p.events.some(
      (e) =>
        e.relatedId === "clinical-risk-immediate-danger" &&
        !["acted", "closed"].includes(e.status),
    ) ||
    (
      [
        "suicidalIntent",
        "suicidePlan",
        "recentAttempt",
        "unableStaySafe",
      ] as ClinicalSignal[]
    ).some(yes);
  if (danger)
    add(
      "immediate-danger",
      "safety",
      "urgent",
      "Срочная очная оценка рисков",
      "Есть прямое сообщение о намерении, плане, недавних действиях либо невозможности сохранить безопасность. Уточните актуальность и организуйте срочную очную помощь; сумма шкалы не отменяет сигнал.",
      ["depression-ru", "safety-nice"],
      [],
      "consultation",
      "required",
    );
  else if ((lastPhq?.answers[8] ?? 0) > 0)
    add(
      "suicide-interview",
      "safety",
      "important",
      "Уточнить мысли о смерти или самоповреждении",
      "Положительный пункт 9 требует прямого интервью о намерении, плане, действиях и поддержке. Сам по себе он не устанавливает кризис.",
      ["depression-nice", "safety-nice"],
      [lastPhq!.id],
      "verify",
    );
  else if (
    ["suicidalIntent", "suicidePlan", "recentAttempt", "unableStaySafe"].some(
      (k) => answer(k as ClinicalSignal) === "unknown",
    )
  )
    add(
      "safety-unknown",
      "data-gap",
      "important",
      "Риски требуют уточнения",
      "Отсутствие сведений и низкая сумма шкалы не исключают опасности.",
      ["safety-nice"],
    );
  const acute =
    yes("currentMania") ||
    yes("psychosis") ||
    yes("confusion") ||
    yes("severeSelfNeglect");
  if (acute)
    add(
      "acute-assessment",
      "safety",
      "urgent",
      "Срочная оценка текущего состояния",
      "Отмечены маниакальные, психотические проявления, острое нарушение сознания или выраженная утрата самообслуживания. Нужна очная оценка психических и соматических причин.",
      ["depression-ru", "bipolar-nice"],
      [],
      "consultation",
      "required",
    );
  const bipolar = yes("maniaHistory") || yes("currentMania");
  if (psychoticHistory && !yes("psychosis"))
    add(
      "psychotic-history",
      "routing",
      "important",
      "Уточнить анамнез психотического расстройства",
      "Исторический диагноз не доказывает текущие психотические симптомы. Уточните состояние и индивидуальный план специалиста.",
      ["depression-ru"],
      conditions.filter((c) => /^F2/.test(c.code)).map((c) => c.id),
      actor.specialty === "psychiatrist" ? "discuss" : "consultation",
      "required",
    );
  if (bipolar)
    add(
      "bipolar-assessment",
      "routing",
      "important",
      "Уточнить биполярный спектр",
      "Анамнез или признаки мании требуют отдельной диагностической ветки; стандартные варианты лечения униполярной депрессии не переносятся автоматически.",
      ["bipolar-nice", "depression-ru"],
      [],
      actor.specialty === "psychiatrist" ? "discuss" : "consultation",
      "required",
    );
  else if (answer("maniaHistory") === "unknown")
    add(
      "mania-unknown",
      "data-gap",
      "important",
      "Уточнить анамнез мании и гипомании",
      "Спросите о периодах повышенного настроения, активности и сниженной потребности во сне; сведения пока отсутствуют.",
      ["bipolar-nice", "depression-ru"],
    );
  const diagnosisConfirmed = conditions.some(
    (c) =>
      c.confirmed &&
      (input.route === "gad"
        ? c.code === "F41.1"
        : /^(F32|F33)(\.|$)/.test(c.code)),
  );
  if (!diagnosisConfirmed)
    add(
      "diagnosis-review",
      "data-gap",
      "important",
      "Уточнить клиническое основание",
      "Выбранный маршрут и сумма опросника не заменяют диагноз, длительность симптомов и дифференциальную оценку.",
      [input.route === "gad" ? "gad-ru" : "depression-ru"],
    );
  if (
    actor.specialty !== "psychiatrist" &&
    (input.route === "depression" || diagnosisConfirmed)
  )
    add(
      "specialist-route",
      "routing",
      "important",
      input.route === "depression"
        ? "Оценка психиатра"
        : "Наблюдение психиатра или психотерапевта",
      input.route === "depression"
        ? "Депрессивный синдром требует специализированной клинической оценки."
        : "При подтверждённом ГТР согласуйте специализированное наблюдение.",
      [input.route === "gad" ? "gad-ru" : "depression-ru"],
      [],
      "consultation",
      input.route === "depression" ? "required" : "desirable",
    );
  if (yes("substanceProblem"))
    add(
      "substances",
      "routing",
      "important",
      "Оценить влияние веществ",
      "Уточните приём, интоксикацию и отмену; симптомы могут требовать другого маршрута.",
      ["gad-ru", "depression-ru"],
      [],
      actor.specialty === "psychiatrist" ? "discuss" : "consultation",
      "required",
    );
  if (input.response === "worsening" || yes("treatmentWorsening"))
    add(
      "worsening",
      "monitoring",
      "important",
      "Пересмотреть ухудшение на фоне лечения",
      "Оцените риски, активацию, нежелательные явления, фактический приём и альтернативные причины. Доза не изменяется автоматически.",
      ["depression-nice", "gad-nice"],
      [],
      "discuss",
    );
  if (input.response === "no-response")
    add(
      "response-review",
      "monitoring",
      "important",
      "Проверить причины отсутствия ответа",
      "Уточните диагноз, длительность и достаточность курса, фактический приём, переносимость и предпочтения до смены терапии.",
      ["depression-ru", "gad-ru"],
      [],
      "discuss",
    );
  for (const signal of [
    "pregnancy",
    "breastfeeding",
    "renalImpairment",
    "hepaticImpairment",
    "qtRisk",
    "seizures",
    "bleedingRisk",
  ] as ClinicalSignal[])
    if (yes(signal))
      add(
        "factor-" + signal,
        "monitoring",
        "important",
        supportSignalLabels[signal],
        "Сопоставьте точное состояние, актуальные показатели и ограничения инструкции выбранного препарата. Наличие фактора не задаёт степень нарушения или дозу.",
        ["medicines-nice"],
        conditions.filter((c) => c.confirmed).map((c) => c.id),
      );
  const recognizedMedicines: SupportResult["recognizedMedicines"] = [],
    unknownMedicines: string[] = [];
  const addMedicine = (
    id: string,
    title: string,
    inn: string,
    provenance: string,
  ) => {
    if (
      recognizedMedicines.some(
        (m) =>
          normalize(m.inn) === normalize(inn) &&
          normalize(m.title) === normalize(title),
      )
    )
      return;
    const classes = clinicalDrugClasses(inn);
    recognizedMedicines.push({ id, title, inn, classes, provenance });
    if (
      !classes.length ||
      inn.split(/[+;,]/).some((part) => !clinicalDrugClasses(part).length)
    )
      unknownMedicines.push(title);
  };
  for (const m of p.plan)
    if (
      m.kind === "medication" &&
      m.status === "confirmed" &&
      (!m.startDate || m.startDate <= now.slice(0, 10)) &&
      (!m.endDate || m.endDate >= now.slice(0, 10))
    )
      addMedicine(
        m.id,
        m.title,
        m.medicine?.inn ?? "",
        "Назначение врача; фактический приём требует сверки",
      );
  for (const f of p.clinicalFacts ?? []) {
    const v = latestFact(f),
      c = v.content;
    if (
      c.category === "medication" &&
      c.state === "known" &&
      v.status !== "inactive"
    )
      addMedicine(
        f.id,
        c.medicine.tradeName,
        c.medicine.inn,
        v.status === "confirmed"
          ? "Подтверждённый факт"
          : "Сведения требуют уточнения",
      );
  }
  if (p.profile.currentMedication.trim())
    unknownMedicines.push("Неструктурированный лекарственный анамнез");
  if (answer("medicationListComplete") !== "yes" || unknownMedicines.length)
    add(
      "medications-unknown",
      "data-gap",
      "important",
      "Сверить фактический приём лекарств",
      "Проверка охватывает распознанные МНН и перечисленные взаимодействия. Неизвестные средства, БАД и недавние отмены требуют уточнения; отсутствие совпадения не исключает рисков.",
      ["medicines-nice"],
      recognizedMedicines.map((m) => m.id),
    );
  for (const rule of supportCatalog.interactions)
    for (let i = 0; i < recognizedMedicines.length; i++)
      for (let j = i + 1; j < recognizedMedicines.length; j++) {
        const a = recognizedMedicines[i]!,
          b = recognizedMedicines[j]!;
        if (
          (a.classes.includes(rule.left) && b.classes.includes(rule.right)) ||
          (b.classes.includes(rule.left) && a.classes.includes(rule.right))
        )
          add(
            "interaction-" + rule.id + "-" + a.id + "-" + b.id,
            "interaction",
            "important",
            rule.title,
            a.title + " + " + b.title + ". " + rule.detail,
            rule.sourceIds,
            [a.id, b.id],
            "discuss",
          );
      }
  const allergyFacts = (p.clinicalFacts ?? [])
    .map((f) => ({ id: f.id, v: latestFact(f) }))
    .filter(
      (f) => f.v.content.category === "allergy" && f.v.status !== "inactive",
    );
  const allergiesKnown = allergyFacts.some(
    (f) =>
      f.v.status === "confirmed" &&
      (f.v.content.state === "known" || f.v.content.state === "none-known"),
  );
  if (!allergiesKnown)
    add(
      "allergy-unknown",
      "data-gap",
      "important",
      "Уточнить аллергологический анамнез",
      "Аллергия, непереносимость и нежелательное явление — разные сведения. Отсутствие записи не означает отсутствия аллергии.",
      ["allergy-nice"],
    );
  for (const f of allergyFacts) {
    const c = f.v.content;
    if (c.category !== "allergy" || c.state !== "known") continue;
    for (const m of recognizedMedicines)
      if (
        [m.inn, m.title, ...m.inn.split(/[+;,]/)].some(
          (n) => normalize(n) === normalize(c.substance),
        )
      )
        add(
          "allergy-" + f.id + "-" + m.id,
          "allergy",
          "important",
          "Совпадение с записью об аллергии",
          m.title +
            ": " +
            c.reaction +
            ". Статус записи: " +
            f.v.status +
            ". Сверьте действующее вещество и компоненты.",
          ["allergy-nice"],
          [f.id, m.id],
          "discuss",
        );
  }
  for (const ae of p.clinicalSupport?.adverseEvents ?? []) {
    const v = ae.versions.at(-1)!;
    if (v.input.outcome === "recovered") continue;
    add(
      "adverse-" + ae.id,
      "monitoring",
      v.input.seriousness === "serious" ? "urgent" : "important",
      "Рассмотреть нежелательное явление",
      v.input.symptoms +
        ". Тяжесть: " +
        v.input.severity +
        "; серьёзность: " +
        v.input.seriousness +
        ". Причинность: " +
        v.input.causality +
        ".",
      ["ich-e2d", "who-umc"],
      v.input.suspectPlanIds,
      "discuss",
    );
  }
  const options: SupportOptionResult[] = supportCatalog.options
    .filter((o) => o.routes.includes(input.route))
    .map((o) => {
      const reasons: string[] = [];
      let status: SupportOptionResult["status"] = "discuss";
      if (!adult || danger || acute) {
        status = "defer";
        reasons.push(
          "Сначала оценка текущего состояния и применимости маршрута.",
        );
      } else if (o.kind === "medication") {
        const optionClasses = supportOptionClasses(o.drugClasses);
        if (bipolar || yes("pregnancy") || yes("breastfeeding")) {
          status = "defer";
          reasons.push(
            "Нужна отдельная специализированная оценка перед выбором стандартной лекарственной схемы.",
          );
        } else if (
          !diagnosisConfirmed ||
          answer("maniaHistory") === "unknown" ||
          !allergiesKnown ||
          answer("medicationListComplete") !== "yes" ||
          unknownMedicines.length
        ) {
          status = "clarify";
          reasons.push(
            "Уточните клиническое основание, анамнез мании, аллергию и фактический приём.",
          );
        }
        if (
          input.route === "depression" &&
          input.depressionSeverity === "unknown"
        ) {
          if (status !== "defer") status = "clarify";
          reasons.push(
            "Клиническая выраженность депрессии не оценена; она не определяется одной суммой PHQ-9.",
          );
        }
        if (
          input.route === "depression" &&
          input.depressionSeverity === "less-severe" &&
          input.preference !== "medication" &&
          input.preference !== "combined"
        ) {
          if (status !== "defer") status = "clarify";
          reasons.push(
            "При менее выраженной депрессии обсудите психологические варианты и информированное предпочтение до лекарства.",
          );
        }
        for (const rule of supportCatalog.interactions)
          for (const m of recognizedMedicines)
            if (
              (optionClasses.includes(rule.left) &&
                m.classes.includes(rule.right)) ||
              (optionClasses.includes(rule.right) &&
                m.classes.includes(rule.left))
            ) {
              if (status !== "defer") status = "clarify";
              reasons.push(
                "Возможное взаимодействие с " +
                  m.title +
                  ": " +
                  rule.title +
                  ". " +
                  rule.detail,
              );
            }
        if (
          [
            "renalImpairment",
            "hepaticImpairment",
            "qtRisk",
            "seizures",
            "bleedingRisk",
          ].some((k) => yes(k as ClinicalSignal))
        ) {
          if (status !== "defer") status = "clarify";
          reasons.push(
            "Есть индивидуальные факторы: проверьте ограничения конкретного РУ и мониторинг.",
          );
        }
        reasons.push(
          "Класс в рекомендациях не подтверждает показание каждого препарата. Сверьте выбранное РУ, форму, инструкцию и режим.",
        );
      }
      if (!reasons.length)
        reasons.push(
          "Обсудите ожидаемый эффект, доступность и предпочтения пациента.",
        );
      return { ...structuredClone(o), status, reasons: [...new Set(reasons)] };
    });
  return {
    options,
    findings,
    recognizedMedicines,
    unknownMedicines: [...new Set(unknownMedicines)],
    diagnosisConfirmed,
  };
}
