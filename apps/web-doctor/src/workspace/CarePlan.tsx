import { useState, type FormEvent } from "react";
import type { PatientRecord, PlanItem, Referral } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { formatDate, planKind, today } from "./labels";
import { SourceLinks, SourcePicker } from "./SourceLibrary";
import { TherapyReference } from "./TherapyReference";
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
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

const planLabels: Record<string, string> = {
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
};
function planValues(item: PlanItem) {
  return {
    ...item,
    kind: planKind[item.kind],
    status: {
      draft: "Черновик",
      confirmed: "Подтверждено",
      completed: "Выполнено",
      stopped: "Прекращено",
    }[item.status],
  };
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

export function PlanForm({
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
  existing?: PlanItem;
}) {
  const [value, setValue] = useState<PlanItem>(
    existing ?? {
      id: crypto.randomUUID(),
      createdAt: "",
      author: "",
      visitId,
      kind: "follow-up",
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
  const set = (key: keyof PlanItem, v: string | string[]) =>
    setValue({ ...value, [key]: v });
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
  return (
    <Modal open onClose={onClose} title="Запись в плане ведения">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
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
        <fieldset
          className={styles.form}
          disabled={locked}
          style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}
          aria-label="Данные назначения"
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
          />
          {value.kind === "medication" && (
            <>
              <div className={styles.formPair}>
                <Field
                  label="Дозировка"
                  value={value.dose}
                  onChange={(e) => set("dose", e.target.value)}
                  placeholder="Вводит врач"
                />
                <Field
                  label="Режим приёма"
                  value={value.schedule}
                  onChange={(e) => set("schedule", e.target.value)}
                />
              </div>
              <Field
                label="Ссылка на действующую инструкцию"
                type="url"
                placeholder="https://…"
                value={value.instructionUrl}
                onChange={(e) => set("instructionUrl", e.target.value)}
              />
              <div className={styles.notice}>
                Проверьте зарегистрированные показания, противопоказания,
                взаимодействия и режим по действующей инструкции. Автоматический
                подбор препарата или дозировки не выполняется.
              </div>
              <SourceLinks ids={["S04", "S11"]} />
            </>
          )}
          <Textarea
            label="Содержание назначения"
            value={value.details}
            onChange={(e) => set("details", e.target.value)}
            rows={3}
          />
          <div className={styles.formPair}>
            <Field
              label="Дата начала"
              type="date"
              value={value.startDate}
              onChange={(e) => set("startDate", e.target.value)}
            />
            <Field
              label="Дата окончания, если определена"
              type="date"
              value={value.endDate}
              onChange={(e) => set("endDate", e.target.value)}
            />
          </div>
          <Field
            label="Контрольная дата"
            type="date"
            value={value.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
          <Textarea
            label="Указания пациенту"
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
          <SourcePicker
            value={value.sourceIds}
            onChange={(ids) => set("sourceIds", ids)}
          />
        </fieldset>
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={actions.busy || guard.conflict || locked}
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
  const [form, setForm] = useState<PlanItem | "new" | null>(null);
  const [confirmation, setConfirmation] = useState<PlanItem | null>(null);
  const [ending, setEnding] = useState<PlanItem | null>(null);
  const [reason, setReason] = useState("");
  const [endStatus, setEndStatus] = useState<"completed" | "stopped">(
    "completed",
  );
  const [filter, setFilter] = useState("active");
  const [error, setError] = useState("");
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
        { type: "plan.status", id: ending.id, status: endStatus, reason },
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
        title="План ведения"
        description="Черновики доступны врачу. Действующий план состоит из подтверждённых записей."
        action={
          <Button icon="plus" onClick={() => setForm("new")}>
            Добавить
          </Button>
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
            Текущий план
          </button>
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Вся история
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
            <SourceLinks ids={item.sourceIds} />
            <div className={styles.row} style={{ marginTop: 12 }}>
              {item.status === "draft" ? (
                <>
                  <Button
                    variant="secondary"
                    icon="check"
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
          existing={form === "new" ? undefined : form}
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
            <SourceLinks ids={confirmation.sourceIds} />
            <p className={styles.subtext}>
              Подтверждение сохраняет автора и время. Последующие изменения
              оформляются новой версией.
            </p>
            <div className={styles.formActions}>
              <Button variant="secondary" onClick={() => setConfirmation(null)}>
                Назад
              </Button>
              <Button disabled={actions.busy} onClick={() => void confirm()}>
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
          <SourceLinks ids={value.sourceIds} />
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
        <SourceLinks ids={["S10", "S14", "S15"]} />
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
              <Button variant="ghost" onClick={() => setForm(r)}>
                Открыть направление
              </Button>
            </div>
            <SourceLinks ids={r.sourceIds} />
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
