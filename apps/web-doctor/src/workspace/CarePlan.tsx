import { workflowEffectOwner } from "./clinical-workflow";
import { CandidateMedicineReview } from "./CandidateMedicineReview";
import { assertSupportPlanCurrent } from "./clinical-support";
import { ClinicalFacts } from "./ClinicalFacts";
import { useState, type FormEvent } from "react";
import type {
  Actor,
  AviandrReview,
  PatientRecord,
  PlanItem,
  Referral,
} from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { formatDate, planKind, today } from "./labels";
import { SourceLinks, SourcePicker } from "./SourceLibrary";
import { TherapyReference } from "./TherapyReference";
import { AviandrCheck, AviandrSummary } from "./AviandrCheck";
import { MedicinePicker, MedicineSummary } from "./MedicinePicker";
import { grlsCatalog, type MedicineSelection } from "./grls";
import { loadGrlsCatalog } from "./grls-loader";
import { assertMedicationVisit } from "./medication-policy";
function supportPlanIssue(
  patient: PatientRecord,
  item: PlanItem,
  actor: Actor,
): string {
  if (item.status !== "draft") return "";
  try {
    assertSupportPlanCurrent(patient, item.id, actor);
    return "";
  } catch (error) {
    return message(error);
  }
}
import {
  aviandr,
  aviandrContext,
  evaluateAviandr,
  isAviandr,
  isAviandrSourceCurrent,
  newAviandrReview,
  sameAviandrContext,
} from "./aviandr";
import {
  CurrentDraftValues,
  DraftConflict,
  useDraftGuard,
} from "./DraftConflict";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Icon,
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

const planLabels: Record<string, string> = {
  medicine: "Препарат и регистрационные сведения ГРЛС",
  kind: "Тип назначения",
  title: "Название",
  details: "Содержание назначения",
  dose: "Дозировка",
  schedule: "Режим приёма",
  startDate: "Дата начала",
  endDate: "Дата окончания",
  dueDate: "Контрольная дата",
  status: "Статус",
  confirmedAt: "Время подтверждения",
  confirmedBy: "Подтвердил",
  changeReason: "Причина изменения",
  instructionUrl: "Инструкция препарата",
  patientInstructions: "Указания пациенту",
  sourceIds: "Источники",
  rationale: "Обоснование решения врача",
  aviandrReview: "Подготовительная проверка Авиандра",
};
function planValues(item: PlanItem) {
  return {
    ...item,
    medicine: item.medicine
      ? `${item.medicine.registrationNumber} · ${item.medicine.registrationStatus} · ${item.medicine.sourceVersion} · ${item.medicine.forms} · ${item.medicine.manufacturers} · ${item.medicine.holder}`
      : "Историческая запись без ГРЛС",
    aviandrReview: item.aviandrReview
      ? reviewComparison(item.aviandrReview)
      : "Не выполнялась",
    kind: planKind[item.kind],
    status: {
      draft: "Черновик",
      confirmed: "Подтверждено",
      completed: "Выполнено",
      stopped: "Прекращено",
    }[item.status],
  };
}
function reviewComparison(review: AviandrReview) {
  const labels: Record<string, string> = {
    ...Object.fromEntries(aviandr.rules.map((rule) => [rule.id, rule.title])),
    indication: "Основание назначения",
    maoUse: "Приём ингибиторов МАО",
    lastMaoDate: "Дата отмены МАО",
    medicationListVerified: "Лекарственный анамнез сверен",
    egfr: "СКФ",
    egfrUnit: "Единицы СКФ",
    egfrDate: "Дата СКФ",
    evidence: "Основание уточнений",
  };
  const values: Record<string, string> = {
    yes: "да",
    no: "нет",
    unknown: "не уточнено",
    gad: "ГТР",
    "post-covid": "Контекст после COVID-19",
    other: "Другое основание",
    "ml/min": "мл/мин",
    "ml/min/1.73m2": "мл/мин/1,73 м²",
  };
  const contextLabels: Record<string, string> = {
    clinicalFacts: "Клинические факты и источники",
    birthDate: "Дата рождения",
    allergies: "Аллергии",
    conditions: "Заболевания",
    currentMedication: "Текущие препараты",
    reproductiveContext: "Репродуктивный контекст",
    substanceUse: "Вещества и алкоголь",
    diagnoses: "Эпизоды и диагнозы",
    medicines: "История назначений",
  };
  return [
    "Не утверждено",
    review.sourceVersion,
    `Источник: ${review.sourceDate} · ${review.sourceHash}`,
    ...Object.entries(review.inputs).map(
      ([key, value]) =>
        `${labels[key]}: ${value === null || value === "" ? "не заполнено" : (values[String(value)] ?? String(value))}`,
    ),
    ...Object.entries(review.context).map(
      ([key, value]) =>
        `${contextLabels[key]}: ${Array.isArray(value) ? value.join("; ") || "нет сведений" : value || "нет сведений"}`,
    ),
    `Сохранено: ${review.checkedAt || "черновик"} · ${review.checkedBy}`,
  ].join("\n");
}
function samePlanRecord(current: PlanItem | undefined, visible: PlanItem) {
  return (
    !!current &&
    Object.keys(current).length === Object.keys(visible).length &&
    (Object.keys(visible) as (keyof PlanItem)[]).every(
      (key) => JSON.stringify(current[key]) === JSON.stringify(visible[key]),
    )
  );
}
const referralLabels: Record<string, string> = {
  destination: "Специалист / организация",
  reason: "Основание направления",
  category: "Категория решения врача",
  urgency: "Срочность",
  dueDate: "Контрольная дата",
  status: "Статус",
  outcome: "Результат / дальнейшие действия",
  sourceIds: "Источники",
  rationale: "Обоснование решения врача",
};
function referralValues(item: Referral) {
  return {
    ...item,
    category: {
      desirable: "Желательно",
      required: "Обязательно по оценке врача",
    }[item.category],
    urgency: {
      routine: "Планово",
      important: "Приоритетно",
      urgent: "Срочно",
    }[item.urgency],
    status: {
      draft: "Черновик",
      issued: "Направление выдано",
      attended: "Обращение состоялось",
      declined: "Пациент отказался",
    }[item.status],
  };
}

function staleAviandrReview(patient: PatientRecord, item: PlanItem) {
  return (
    !!item.aviandrReview &&
    (!isAviandrSourceCurrent(item.aviandrReview) ||
      !sameAviandrContext(
        item.aviandrReview.context,
        aviandrContext(patient, item.id),
      ))
  );
}
export function PlanForm({
  patient,
  actions,
  onClose,
  visitId = "",
  existing,
  initialKind = "follow-up",
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
  visitId?: string;
  existing?: PlanItem;
  initialKind?: PlanItem["kind"];
}) {
  const [value, setValue] = useState<PlanItem>(
    existing ?? {
      id: crypto.randomUUID(),
      createdAt: "",
      author: "",
      visitId,
      kind: initialKind,
      title: "",
      details: "",
      dose: "",
      schedule: "",
      startDate: today(),
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
      rationale: "",
    },
  );
  const [error, setError] = useState("");
  const current = patient.plan.find((item) => item.id === value.id);
  const guard = useDraftGuard(current, patient.revision);
  const locked = !!current && current.status !== "draft";
  const remoteCorrection =
    value.kind === "medication" &&
    patient.visits.some(
      (visit) => visit.id === value.visitId && visit.format === "remote",
    );
  let remoteIssue = "";
  if (remoteCorrection) {
    try {
      assertMedicationVisit(patient, value, actions.actor, false);
    } catch (error) {
      remoteIssue = message(error);
    }
  }
  function selectVisit(id: string) {
    setValue((previous) => {
      const original = patient.plan.find(
        (item) => item.id === previous.replacesId,
      );
      if (
        original &&
        patient.visits.some(
          (visit) => visit.id === id && visit.format === "remote",
        )
      ) {
        const {
          kind,
          title,
          medicine,
          details,
          schedule,
          startDate,
          endDate,
          dueDate,
          instructionUrl,
          patientInstructions,
          sourceIds,
        } = original;
        const restored = {
          ...previous,
          kind,
          title,
          medicine,
          details,
          schedule,
          startDate,
          endDate,
          dueDate,
          instructionUrl,
          patientInstructions,
          sourceIds,
          visitId: id,
        };
        if (!isAviandr(title)) delete restored.aviandrReview;
        return restored;
      }
      return { ...previous, visitId: id };
    });
    setError("");
  }
  const staleReview = !locked && staleAviandrReview(patient, value);
  const set = (key: keyof PlanItem, v: string | string[]) =>
    setValue((previous) => {
      const next = { ...previous, [key]: v };
      if (key === "kind" && v !== "medication") delete next.medicine;
      if (next.kind !== "medication" || !isAviandr(next.title))
        delete next.aviandrReview;
      else if (
        next.aviandrReview &&
        ["startDate", "dose", "schedule"].includes(key)
      )
        next.aviandrReview = {
          ...next.aviandrReview,
          checkedAt: "",
          checkedBy: "",
        };
      return next;
    });
  function selectMedicine(medicine: MedicineSelection | null) {
    setValue((previous) => {
      const next = { ...previous, medicine, title: medicine?.tradeName ?? "" };
      if (!isAviandr(next.title)) delete next.aviandrReview;
      return next;
    });
  }
  function selectAviandr() {
    const choose = () => {
      const matches = grlsCatalog
        .search("Авиандр", 1, 100)
        .items.filter((r) => /^авиандр[®\s]*$/iu.test(r.tradeName));
      if (matches.length !== 1) {
        setError(
          "Найдите нужную регистрацию Авиандра в ГРЛС и выберите её явно.",
        );
        return;
      }
      setValue((previous) => ({
        ...previous,
        medicine: matches[0]!,
        title: matches[0]!.tradeName,
        instructionUrl: aviandr.url,
        aviandrReview: newAviandrReview(patient, previous.id),
      }));
    };
    if (grlsCatalog.ready) choose();
    else
      void loadGrlsCatalog()
        .then(choose)
        .catch((e) => setError(message(e)));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (locked)
        throw new Error(
          "Назначение уже подтверждено или завершено. Загрузите актуальные данные, закройте форму и при необходимости создайте новую версию.",
        );
      if (guard.conflict)
        throw new Error(
          "Назначение изменено в другой сессии. Сравните данные и выберите, какие изменения сохранить.",
        );
      if (staleReview)
        throw new Error(
          "Источник проверки или данные карты изменились. Повторите сверку.",
        );
      if (remoteCorrection)
        assertMedicationVisit(patient, value, actions.actor, false);
      await actions.mutate(
        patient.id,
        { type: "plan.save", value },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  const identityFields = (
    <fieldset
      disabled={remoteCorrection}
      className={styles.form}
      style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
    >
      <Select
        label="Тип назначения"
        value={value.kind}
        onChange={(e) => set("kind", e.target.value)}
      >
        {Object.entries(planKind).map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </Select>
      <Field
        label={
          value.kind === "medication"
            ? "Препарат, форма и наименование"
            : "Название"
        }
        value={value.title}
        onChange={(e) => set("title", e.target.value)}
        required
        readOnly={
          value.kind === "medication" && (!!value.medicine || !existing)
        }
      />
      {value.kind === "medication" && (
        <MedicinePicker value={value.medicine} onChange={selectMedicine} />
      )}
      {value.kind === "medication" && (
        <CandidateMedicineReview
          patient={patient}
          plan={value}
          actor={actions.actor}
        />
      )}
      {value.kind === "medication" && existing && !value.medicine && (
        <p className={styles.subtext}>
          Прежняя запись без связи с ГРЛС. Название и историю сохраняем; замена
          препарата требует выбора из справочника.
        </p>
      )}
    </fieldset>
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        value.kind === "medication"
          ? "Лекарственное назначение"
          : "Запись в плане ведения"
      }
      className={styles.planModal}
    >
      <details className={styles.details}>
        <summary>Клинический контекст перед решением</summary>
        <ClinicalFacts patient={patient} actions={actions} compact />
      </details>
      <form className={styles.planForm} onSubmit={save}>
        <div className={styles.prescriptionIdentity}>
          <span>
            {patient.profile.name} · {patient.code}
          </span>
          <Badge>{locked ? "Сохранённая запись" : "Черновик"}</Badge>
        </div>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {remoteCorrection && (
          <p className={styles.notice}>
            Дистанционно можно изменить только дозировку. Остальные параметры
            сохраняются из исходного назначения.
          </p>
        )}
        {remoteIssue && <ErrorNotice>{remoteIssue}</ErrorNotice>}
        <DraftConflict
          guard={guard}
          allowKeep={!locked}
          onReload={() => {
            if (current) setValue(current);
            setError("");
          }}
        >
          <CurrentDraftValues
            current={current ? planValues(current) : undefined}
            draft={planValues(value)}
            labels={planLabels}
          />
        </DraftConflict>
        {locked && (
          <div className={styles.notice}>
            Назначение уже подтверждено или завершено. Сохранение черновика
            недоступно. Закройте форму; дальнейшие изменения оформляются новой
            версией из плана ведения.
          </div>
        )}
        <div
          className={`${styles.prescriptionColumns} ${value.aviandrReview ? styles.withCheck : ""}`}
        >
          <fieldset
            className={styles.form}
            disabled={locked}
            style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
            aria-label="Данные назначения"
          >
            {value.aviandrReview && (
              <div className={styles.drugIdentity}>
                <span className={styles.drugMark}>
                  <Icon name="pill" size={20} />
                </span>
                <div>
                  <h3>Авиандр</h3>
                  <p className={styles.subtext}>
                    {aviandr.title.split(" · ").slice(1).join(" · ")}
                  </p>
                </div>
              </div>
            )}
            {value.aviandrReview ? (
              <details className={styles.details}>
                <summary>Изменить препарат или тип записи</summary>
                <div className={styles.form}>{identityFields}</div>
              </details>
            ) : (
              identityFields
            )}
            {value.kind === "medication" && !isAviandr(value.title) && (
              <Button
                variant="secondary"
                icon="book"
                disabled={remoteCorrection}
                onClick={selectAviandr}
              >
                Выбрать Авиандр
              </Button>
            )}
            {value.kind === "medication" &&
              isAviandr(value.title) &&
              (value.aviandrReview ? (
                !locked && (
                  <AviandrCheck
                    patient={patient}
                    actions={actions}
                    showSummary={false}
                    planId={value.id}
                    startDate={value.startDate}
                    review={value.aviandrReview}
                    onChange={(review) =>
                      setValue((previous) => ({
                        ...previous,
                        aviandrReview: review,
                      }))
                    }
                  />
                )
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setValue((previous) => ({
                      ...previous,
                      aviandrReview: newAviandrReview(patient, previous.id),
                    }))
                  }
                >
                  Начать проверку Авиандра
                </Button>
              ))}
            {value.kind === "medication" && (
              <>
                <Select
                  label="Приём, на котором принято решение"
                  value={value.visitId}
                  onChange={(e) => selectVisit(e.target.value)}
                >
                  <option value="">Выберите начатый приём</option>
                  {patient.visits
                    .filter(
                      (v) =>
                        v.status === "in-progress" &&
                        (v.format === "in-person" || !!value.replacesId),
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {formatDate(v.scheduledAt)} ·{" "}
                        {v.format === "in-person" ? "очно" : "дистанционно"}
                      </option>
                    ))}
                </Select>
                <div className={styles.formPair}>
                  <Field
                    label="Дозировка"
                    value={value.dose}
                    onChange={(e) => set("dose", e.target.value)}
                    placeholder="Вводит врач"
                  />
                  <Field
                    label="Режим приёма"
                    disabled={remoteCorrection}
                    value={value.schedule}
                    onChange={(e) => set("schedule", e.target.value)}
                  />
                </div>
                <Field
                  label="Ссылка на действующую инструкцию"
                  disabled={remoteCorrection}
                  type="url"
                  placeholder="https://…"
                  value={value.instructionUrl}
                  onChange={(e) => set("instructionUrl", e.target.value)}
                />
                <div className={styles.notice}>
                  Проверьте зарегистрированные показания, противопоказания,
                  взаимодействия и режим по действующей инструкции.
                  Автоматический подбор препарата или дозировки не выполняется.
                </div>
              </>
            )}
            <Textarea
              label="Содержание назначения"
              disabled={remoteCorrection}
              value={value.details}
              onChange={(e) => set("details", e.target.value)}
              rows={3}
            />
            <div className={styles.formPair}>
              <Field
                label="Дата начала"
                disabled={remoteCorrection}
                type="date"
                value={value.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
              <Field
                label="Дата окончания, если определена"
                disabled={remoteCorrection}
                type="date"
                value={value.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </div>
            <Field
              label="Контрольная дата"
              disabled={remoteCorrection}
              type="date"
              value={value.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
            <Textarea
              label="Указания пациенту"
              disabled={remoteCorrection}
              value={value.patientInstructions}
              onChange={(e) => set("patientInstructions", e.target.value)}
              rows={3}
            />
            <Textarea
              label="Обоснование решения врача"
              hint="Исходные сведения, применимость и проверенные ограничения"
              value={value.rationale}
              onChange={(e) => set("rationale", e.target.value)}
              rows={3}
            />
            {value.replacesId && (
              <Textarea
                label="Причина изменения предыдущего назначения"
                value={value.changeReason}
                onChange={(e) => set("changeReason", e.target.value)}
                required
              />
            )}
            <fieldset
              disabled={remoteCorrection}
              style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
            >
              <SourcePicker
                value={value.sourceIds}
                onChange={(ids) => set("sourceIds", ids)}
              />
            </fieldset>
          </fieldset>
          {value.aviandrReview && (
            <aside
              className={styles.prescriptionResults}
              aria-label="Дополнительная информация"
            >
              <h3>Дополнительная информация</h3>
              <AviandrSummary
                prominent
                review={{
                  ...value.aviandrReview,
                  findings:
                    !locked && !staleReview
                      ? evaluateAviandr(value.aviandrReview, value.startDate)
                      : value.aviandrReview.findings,
                }}
                stale={staleReview}
              />
            </aside>
          )}
        </div>
        <div className={`${styles.formActions} ${styles.prescriptionActions}`}>
          <span className={styles.subtext}>
            Сохранение черновика не назначает лечение
          </span>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={
              actions.busy ||
              guard.conflict ||
              locked ||
              staleReview ||
              !!remoteIssue
            }
          >
            Сохранить черновик
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function CarePlan({
  patient,
  actions,
  visitId = "",
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  visitId?: string;
}) {
  const [form, setForm] = useState<PlanItem | "new" | "medication" | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<PlanItem | null>(null);
  const [ending, setEnding] = useState<PlanItem | null>(null);
  const [reason, setReason] = useState("");
  const [endVisitId, setEndVisitId] = useState("");
  const [endStatus, setEndStatus] = useState<"completed" | "stopped">(
    "completed",
  );
  const [filter, setFilter] = useState("active");
  const [error, setError] = useState("");
  const confirmationStale =
    !!confirmation && staleAviandrReview(patient, confirmation);
  const items = patient.plan.filter(
    (p) =>
      filter === "all" ||
      p.status === "confirmed" ||
      (p.status === "draft" && (!visitId || p.visitId === visitId)),
  );
  async function confirm() {
    if (!confirmation) return;
    try {
      const current = patient.plan.find((item) => item.id === confirmation.id);
      if (!samePlanRecord(current, confirmation))
        throw new Error(
          "Назначение изменено в другой сессии. Закройте окно и проверьте обновлённую запись перед подтверждением.",
        );
      if (confirmationStale)
        throw new Error(
          "Источник проверки или данные карты изменились. Повторите сверку перед подтверждением.",
        );
      await actions.mutate(
        patient.id,
        { type: "plan.confirm", id: confirmation.id },
        patient.revision,
      );
      setConfirmation(null);
    } catch (e) {
      setError(message(e));
    }
  }
  async function end(e: FormEvent) {
    e.preventDefault();
    if (!ending) return;
    try {
      const current = patient.plan.find((item) => item.id === ending.id);
      if (!samePlanRecord(current, ending))
        throw new Error(
          "Назначение изменено в другой сессии. Закройте окно и проверьте обновлённую запись перед изменением статуса.",
        );
      await actions.mutate(
        patient.id,
        {
          type: "plan.status",
          id: ending.id,
          status: endStatus,
          reason,
          ...(ending.kind === "medication" ? { visitId: endVisitId } : {}),
        },
        patient.revision,
      );
      setEnding(null);
    } catch (e) {
      setError(message(e));
    }
  }
  function revise(item: PlanItem) {
    setForm({
      ...item,
      id: crypto.randomUUID(),
      createdAt: "",
      author: "",
      status: "draft",
      confirmedAt: "",
      confirmedBy: "",
      replacesId: item.id,
      changeReason: "",
      visitId,
    });
  }
  return (
    <>
      <Section
        title="Лечение и план"
        description="Черновики доступны врачу. Действующий план состоит из подтверждённых записей."
        action={
          <div className={styles.row}>
            <Button variant="secondary" onClick={() => setForm("new")}>
              Другая запись
            </Button>
            <Button icon="plus" onClick={() => setForm("medication")}>
              Назначить препарат
            </Button>
          </div>
        }
      >
        <div
          className={styles.segmented}
          style={{ width: "fit-content", marginBottom: 12 }}
        >
          <button
            type="button"
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            Действующий план
          </button>
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            История решений
          </button>
        </div>
        {items.map((item) => (
          <article className={styles.inlineNote} key={item.id}>
            <div className={styles.between}>
              <div className={styles.row}>
                <Badge>{planKind[item.kind]}</Badge>
                <Badge tone={item.status === "confirmed" ? "green" : "neutral"}>
                  {
                    {
                      draft: "Черновик",
                      confirmed: "Подтверждено",
                      completed: "Выполнено",
                      stopped: "Прекращено",
                    }[item.status]
                  }
                </Badge>
              </div>
              <span className={styles.subtext}>
                {item.dueDate ? `Контроль ${formatDate(item.dueDate)}` : ""}
              </span>
            </div>
            <h3 style={{ marginTop: 12 }}>{item.title}</h3>
            {item.medicine && <MedicineSummary value={item.medicine} />}
            {item.visitId && (
              <p className={styles.subtext}>
                Приём{" "}
                {formatDate(
                  patient.visits.find((visit) => visit.id === item.visitId)
                    ?.scheduledAt ?? "",
                )}
                {item.visitId === visitId ? " · текущий" : ""}
              </p>
            )}
            {item.dose && (
              <p>
                <strong>{item.dose}</strong> · {item.schedule}
              </p>
            )}
            <p>{item.details}</p>
            {item.patientInstructions && (
              <div className={styles.notice}>{item.patientInstructions}</div>
            )}
            <p className={styles.subtext}>
              {item.rationale || "Обоснование ещё не внесено"}
            </p>
            {item.instructionUrl && /^https:\/\//.test(item.instructionUrl) && (
              <a
                href={item.instructionUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.link}
              >
                Инструкция препарата
              </a>
            )}
            {!!item.sourceIds.length && (
              <details className={styles.details}>
                <summary>Источники решения</summary>
                <SourceLinks ids={item.sourceIds} />
              </details>
            )}
            {item.aviandrReview && (
              <AviandrSummary
                review={item.aviandrReview}
                stale={
                  item.status === "draft" && staleAviandrReview(patient, item)
                }
              />
            )}
            {supportPlanIssue(patient, item, actions.actor) && (
              <p className={styles.notice}>
                {supportPlanIssue(patient, item, actions.actor)}
              </p>
            )}
            <div className={styles.row} style={{ marginTop: 12 }}>
              {item.status === "draft" &&
              workflowEffectOwner(patient, item.id) ? (
                <p className={styles.subtext}>
                  {workflowEffectOwner(patient, item.id)?.stale
                    ? "Основание устарело. Рассмотрите новое предложение."
                    : "Подтвердите действие в рекомендациях."}{" "}
                  <a
                    className={styles.link}
                    href={`#/patients/${patient.id}/overview`}
                  >
                    Открыть рекомендацию
                  </a>
                </p>
              ) : item.status === "draft" ? (
                <>
                  <Button
                    variant="secondary"
                    icon="check"
                    disabled={
                      actions.busy ||
                      staleAviandrReview(patient, item) ||
                      !!supportPlanIssue(patient, item, actions.actor)
                    }
                    onClick={() => {
                      setError("");
                      setConfirmation(item);
                    }}
                  >
                    Проверить и подтвердить
                  </Button>
                  <Button
                    variant="ghost"
                    icon="edit"
                    onClick={() => setForm(item)}
                  >
                    Редактировать
                  </Button>
                </>
              ) : item.status === "confirmed" ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEnding(item);
                      setEndVisitId(
                        patient.visits.some(
                          (v) =>
                            v.id === visitId &&
                            v.format === "in-person" &&
                            v.status === "in-progress",
                        )
                          ? visitId
                          : "",
                      );
                      setReason("");
                      setError("");
                    }}
                  >
                    Изменить статус
                  </Button>
                  <Button variant="ghost" onClick={() => revise(item)}>
                    Новая версия
                  </Button>
                </>
              ) : (
                <span className={styles.subtext}>{item.changeReason}</span>
              )}
            </div>
          </article>
        ))}
        {!items.length && (
          <Empty
            icon="calendar"
            title={
              patient.plan.length
                ? "Действующих назначений нет"
                : "План ещё не составлен"
            }
          >
            {patient.plan.length
              ? "Откройте всю историю, чтобы посмотреть предыдущие назначения, или добавьте новую запись."
              : "Добавьте контрольный контакт, рекомендации, обследование или назначение. Каждое решение подтверждается отдельно."}
          </Empty>
        )}
      </Section>
      <TherapyReference />
      {form && (
        <PlanForm
          patient={patient}
          actions={actions}
          onClose={() => setForm(null)}
          visitId={visitId}
          initialKind={form === "medication" ? "medication" : "follow-up"}
          existing={typeof form === "string" ? undefined : form}
        />
      )}
      <Modal
        open={!!confirmation}
        onClose={() => setConfirmation(null)}
        title="Подтвердить назначение"
      >
        {confirmation && (
          <div className={styles.form}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <h3>{confirmation.title}</h3>
            <p className={styles.reviewText}>
              {confirmation.dose} {confirmation.schedule}
              <br />
              {confirmation.details}
            </p>
            <div className={styles.notice}>
              {confirmation.patientInstructions ||
                "Указания пациенту не внесены"}
            </div>
            <p className={styles.reviewText}>
              {confirmation.rationale || "Обоснование не внесено"}
            </p>
            {!!confirmation.sourceIds.length && (
              <details className={styles.details}>
                <summary>Источники решения</summary>
                <SourceLinks ids={confirmation.sourceIds} />
              </details>
            )}
            <CandidateMedicineReview
              patient={patient}
              plan={confirmation}
              actor={actions.actor}
            />
            {confirmation.aviandrReview && (
              <AviandrSummary
                review={confirmation.aviandrReview}
                stale={confirmationStale}
              />
            )}
            <p className={styles.subtext}>
              Подтверждение сохраняет автора и время. Последующие изменения
              оформляются новой версией.
            </p>
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setConfirmation(null)}>
                Назад
              </Button>
              <Button
                disabled={actions.busy || confirmationStale}
                onClick={() => void confirm()}
              >
                Подтверждаю решение
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!ending}
        onClose={() => setEnding(null)}
        title="Изменить статус назначения"
      >
        <form onSubmit={end} className={styles.form}>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <h3>{ending?.title}</h3>
          {ending?.kind === "medication" && (
            <Select
              label="Очный приём"
              value={endVisitId}
              onChange={(e) => setEndVisitId(e.target.value)}
            >
              <option value="">Выберите начатый очный приём</option>
              {patient.visits
                .filter(
                  (v) => v.format === "in-person" && v.status === "in-progress",
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {formatDate(v.scheduledAt)}
                  </option>
                ))}
            </Select>
          )}
          <Select
            label="Новый статус"
            value={endStatus}
            onChange={(e) => setEndStatus(e.target.value as typeof endStatus)}
          >
            <option value="completed">Выполнено</option>
            <option value="stopped">Прекращено</option>
          </Select>
          <Textarea
            label="Причина и результат"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setEnding(null)}>
              Отмена
            </Button>
            <Button type="submit" disabled={actions.busy}>
              Зафиксировать
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function ReferralForm({
  patient,
  actions,
  onClose,
  visitId = "",
  existing,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
  visitId?: string;
  existing?: Referral;
}) {
  const [value, setValue] = useState<Referral>(
    existing ?? {
      id: crypto.randomUUID(),
      createdAt: "",
      author: "",
      visitId,
      destination: "Психиатр",
      urgency: "routine",
      category: "desirable",
      reason: "",
      dueDate: "",
      status: "draft",
      outcome: "",
      sourceIds: [],
      rationale: "",
    },
  );
  const [error, setError] = useState("");
  const current = patient.referrals.find((item) => item.id === value.id);
  const guard = useDraftGuard(current, patient.revision);
  const issued = !!current && current.status !== "draft";
  const protectedChange =
    issued &&
    (value.status === "draft" ||
      (current.status !== "issued" && value.status !== current.status) ||
      (
        [
          "destination",
          "reason",
          "visitId",
          "category",
          "urgency",
          "dueDate",
          "rationale",
          "sourceIds",
        ] as const
      ).some(
        (key) => JSON.stringify(value[key]) !== JSON.stringify(current[key]),
      ));
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (guard.conflict)
        throw new Error(
          "Направление изменено в другой сессии. Сравните данные и выберите, какие изменения сохранить.",
        );
      if (protectedChange)
        throw new Error(
          "Выданное направление нельзя вернуть на предыдущий этап или изменить его основания. Загрузите актуальные данные; для новых оснований создайте отдельное направление.",
        );
      await actions.mutate(
        patient.id,
        { type: "referral.save", value },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Направление и следующий шаг">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <DraftConflict
          guard={guard}
          allowKeep={!protectedChange}
          onReload={() => {
            if (current) setValue(current);
            setError("");
          }}
        >
          <CurrentDraftValues
            current={current ? referralValues(current) : undefined}
            draft={referralValues(value)}
            labels={referralLabels}
          />
        </DraftConflict>
        {issued && (
          <div className={styles.notice}>
            Адресат и основание выданного направления сохранены в истории. Здесь
            можно зафиксировать результат обращения. Для другого адресата или
            основания создайте отдельное направление кнопкой «Направить».
          </div>
        )}
        <Field
          label="Специалист / организация"
          value={value.destination}
          onChange={(e) => setValue({ ...value, destination: e.target.value })}
          required
          readOnly={issued}
        />
        <Textarea
          label="Основание направления"
          value={value.reason}
          onChange={(e) => setValue({ ...value, reason: e.target.value })}
          required
          readOnly={issued}
        />
        <div className={styles.formPair}>
          <Select
            label="Категория решения врача"
            value={value.category}
            disabled={issued}
            onChange={(e) =>
              setValue({
                ...value,
                category: e.target.value as Referral["category"],
              })
            }
          >
            <option value="desirable">Желательно</option>
            <option value="required">Обязательно по оценке врача</option>
          </Select>
          <Select
            label="Срочность"
            value={value.urgency}
            disabled={issued}
            onChange={(e) =>
              setValue({
                ...value,
                urgency: e.target.value as Referral["urgency"],
              })
            }
          >
            <option value="routine">Планово</option>
            <option value="important">Приоритетно</option>
            <option value="urgent">Срочно</option>
          </Select>
        </div>
        <Field
          label="Контрольная дата"
          type="date"
          value={value.dueDate}
          readOnly={issued}
          onChange={(e) => setValue({ ...value, dueDate: e.target.value })}
        />
        <Select
          label="Статус"
          value={value.status}
          disabled={issued && current.status !== "issued"}
          onChange={(e) =>
            setValue({ ...value, status: e.target.value as Referral["status"] })
          }
        >
          <option value="draft" disabled={issued}>
            Черновик
          </option>
          <option value="issued">
            Решение подтверждено, направление выдано
          </option>
          <option value="attended">Обращение состоялось</option>
          <option value="declined">Пациент отказался</option>
        </Select>
        <Textarea
          label="Результат / дальнейшие действия"
          value={value.outcome}
          onChange={(e) => setValue({ ...value, outcome: e.target.value })}
        />
        {issued ? (
          !!value.sourceIds.length && (
            <details className={styles.details}>
              <summary>Источники решения</summary>
              <SourceLinks ids={value.sourceIds} />
            </details>
          )
        ) : (
          <SourcePicker
            value={value.sourceIds}
            onChange={(sourceIds) => setValue({ ...value, sourceIds })}
          />
        )}
        <div className={styles.notice}>
          Категория направления не заменяет согласие пациента и юридическую
          процедуру недобровольного вмешательства.
        </div>
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy || guard.conflict}>
            Сохранить направление
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Referrals({
  patient,
  actions,
  visitId = "",
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  visitId?: string;
}) {
  const [form, setForm] = useState<Referral | "new" | null>(null);
  return (
    <>
      <Section
        title="Направления"
        action={
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => setForm("new")}
          >
            Направить
          </Button>
        }
      >
        {patient.referrals.map((r) => (
          <div className={styles.inlineNote} key={r.id}>
            <div className={styles.between}>
              <h3>{r.destination}</h3>
              <Badge tone={r.category === "required" ? "amber" : "neutral"}>
                {r.category === "required"
                  ? "Обязательно по оценке врача"
                  : "Желательно"}
              </Badge>
            </div>
            <p>{r.reason}</p>
            <p>{r.outcome}</p>
            <div className={styles.row}>
              <span className={styles.subtext}>
                {
                  {
                    draft: "Черновик",
                    issued: "Выдано",
                    attended: "Обращение состоялось",
                    declined: "Отказ",
                  }[r.status]
                }
              </span>
              {r.status === "draft" && workflowEffectOwner(patient, r.id) ? (
                <span className={styles.subtext}>
                  Проект связан с рекомендацией
                </span>
              ) : (
                <Button variant="ghost" onClick={() => setForm(r)}>
                  Открыть направление
                </Button>
              )}
            </div>
            {!!r.sourceIds.length && (
              <details className={styles.details}>
                <summary>Источники решения</summary>
                <SourceLinks ids={r.sourceIds} />
              </details>
            )}
          </div>
        ))}
        {!patient.referrals.length && (
          <Empty title="Направлений пока нет" icon="arrow">
            Зафиксируйте адресата, основания, срочность и следующий шаг.
          </Empty>
        )}
      </Section>
      {form && (
        <ReferralForm
          patient={patient}
          actions={actions}
          visitId={visitId}
          existing={form === "new" ? undefined : form}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}
