import { useState, type FormEvent } from "react";
import type { PatientRecord, SelfReport } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { formatDate, localDateTime } from "./labels";
import { SourceLinks } from "./SourceLibrary";
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
const medicineLabels = {
  taken: "Приём отмечен",
  missed: "Пропуск отмечен",
  "no-mark": "Нет отметки",
  "not-applicable": "Не применимо",
};
export function PatientJournal({
  patient,
  actions,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
}) {
  const [form, setForm] = useState(false);
  return (
    <>
      <Section
        title="Дневник и самоотчёты"
        description="Отсутствие отметки отличается от пропуска и отрицательного ответа"
        action={
          <Button icon="plus" onClick={() => setForm(true)}>
            Записать со слов пациента
          </Button>
        }
      >
        {reportGroups(patient.reports).map(([current, ...history]) => (
          <article className={styles.inlineNote} key={current.id}>
            <ReportEntry r={current} patientId={patient.id} actions={actions} />
            {history.some((r) => r.safetyConcern) && (
              <p>
                <Badge tone="red">
                  Есть прежняя запись с вопросом безопасности
                </Badge>
              </p>
            )}
            {!!history.length && (
              <details className={styles.details}>
                <summary>История изменений · {history.length}</summary>
                {history.map((r) => (
                  <section
                    className={styles.inlineNote}
                    key={r.id}
                    aria-label="Предыдущая версия самоотчёта"
                  >
                    <ReportEntry
                      r={r}
                      patientId={patient.id}
                      actions={actions}
                    />
                  </section>
                ))}
              </details>
            )}
          </article>
        ))}
        {!patient.reports.length && (
          <Empty icon="heart" title="Дневник пока пуст">
            Здесь появятся самоотчёты пациента. Вы также можете внести сведения,
            полученные на приёме или при контакте.
          </Empty>
        )}
        <SourceLinks ids={["S03", "S04", "S38"]} />
      </Section>
      {form && (
        <ReportForm
          patient={patient}
          actions={actions}
          onClose={() => setForm(false)}
        />
      )}
    </>
  );
}
function reportGroups(reports: SelfReport[]): [SelfReport, ...SelfReport[]][] {
  const groups = new Map<string, SelfReport[]>();
  // Server receipt order defines revisions; patient timestamps may be backdated.
  for (const report of reports) {
    const key = report.mobile?.entityId
      ? JSON.stringify([report.mobile.formVersion, report.mobile.entityId])
      : JSON.stringify(["single", report.id]);
    const group = groups.get(key) ?? [];
    group.unshift(report);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(
      (group) =>
        group.sort(
          (a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt),
        ) as [SelfReport, ...SelfReport[]],
    )
    .sort(
      (a, b) => Date.parse(b[0]!.reportedAt) - Date.parse(a[0]!.reportedAt),
    );
}
function ReportEntry({
  r,
  patientId,
  actions,
}: {
  r: SelfReport;
  patientId: string;
  actions: WorkspaceActions;
}) {
  return (
    <>
      <div className={styles.between}>
        <h3>
          {formatDate(r.reportedAt, {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </h3>
        <Badge tone={r.reviewedAt ? "neutral" : "green"}>
          {r.reviewedAt ? "Просмотрено" : "Новая запись"}
        </Badge>
      </div>
      <div className={styles.subtext}>
        Получено{" "}
        {formatDate(r.receivedAt, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        ·{" "}
        {r.provenance === "patient"
          ? "Самоотчёт пациента"
          : "Внесено врачом со слов пациента"}
      </div>
      {r.state !== "completed" ? (
        <p>
          {r.state === "cannot"
            ? "Не смог(ла) заполнить"
            : "Отказался(ась) заполнять"}
        </p>
      ) : (
        <>
          {r.mobile ? (
            <div className={styles.row} style={{ marginTop: 14 }}>
              <Badge>
                Состояние: радость {r.mobile.fields.feeling.valence} / 6,
                энергия {r.mobile.fields.feeling.energy} / 6
              </Badge>
              <Badge>Сон: {r.mobile.fields.sleep}</Badge>
              <Badge>Тревога: {r.mobile.fields.anxiety} / 10</Badge>
              <Badge>Силы на дела: {r.mobile.fields.functioning} / 10</Badge>
              <Badge>Переносимость: {r.mobile.fields.tolerability}</Badge>
            </div>
          ) : (
            <div className={styles.row} style={{ marginTop: 14 }}>
              <Badge>
                Самочувствие: {r.mood ?? "нет данных"}
                {r.mood !== null ? " / 10" : ""}
              </Badge>
              <Badge>
                Тревога: {r.anxiety ?? "нет данных"}
                {r.anxiety !== null ? " / 10" : ""}
              </Badge>
              <Badge>
                Сон: {r.sleepHours ?? "нет данных"}
                {r.sleepHours !== null ? " ч" : ""}
              </Badge>
            </div>
          )}
          <p>{r.functioning}</p>
          <p>{r.note}</p>
          <Badge tone={r.medication === "missed" ? "amber" : "neutral"}>
            {medicineLabels[r.medication]}
          </Badge>
          {r.medicationReason && <p>{r.medicationReason}</p>}
          {r.adverseEffects && (
            <div className={styles.notice}>
              <strong>Нежелательное явление:</strong> {r.adverseEffects}
            </div>
          )}
          {r.safetyConcern && (
            <p>
              <Badge tone="red">
                Отмечен вопрос безопасности · требуется оценка
              </Badge>
            </p>
          )}
        </>
      )}
      {!r.reviewedAt && (
        <Button
          variant="ghost"
          icon="check"
          onClick={() =>
            void actions
              .mutate(patientId, { type: "report.review", id: r.id })
              .catch(() => {})
          }
        >
          Отметить просмотр
        </Button>
      )}
    </>
  );
}
function ReportForm({
  patient,
  actions,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
}) {
  const [state, setState] = useState<SelfReport["state"]>("completed");
  const [when, setWhen] = useState(localDateTime(new Date().toISOString()));
  const [mood, setMood] = useState("");
  const [anxiety, setAnxiety] = useState("");
  const [sleep, setSleep] = useState("");
  const [functioning, setFunctioning] = useState("");
  const [medication, setMedication] =
    useState<SelfReport["medication"]>("no-mark");
  const [reason, setReason] = useState("");
  const [adverse, setAdverse] = useState("");
  const [note, setNote] = useState("");
  const [safety, setSafety] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.mutate(patient.id, {
        type: "report.add",
        value: {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          reportedAt: new Date(when).toISOString(),
          receivedAt: "",
          provenance: "clinician",
          state,
          mood: state === "completed" && mood !== "" ? Number(mood) : null,
          anxiety:
            state === "completed" && anxiety !== "" ? Number(anxiety) : null,
          sleepHours:
            state === "completed" && sleep !== "" ? Number(sleep) : null,
          functioning,
          medication,
          medicationReason: reason,
          adverseEffects: adverse,
          note,
          safetyConcern: safety,
          reviewedAt: "",
        },
      });
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Запись со слов пациента">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Field
          label="Время, к которому относятся сведения"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
        <Select
          label="Возможность заполнения"
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
        >
          <option value="completed">Сведения получены</option>
          <option value="cannot">Не смог(ла) заполнить</option>
          <option value="declined">Отказался(ась) заполнять</option>
        </Select>
        {state === "completed" && (
          <>
            <div className={styles.formPair}>
              <Field
                label="Самочувствие · 0–10"
                hint="Выше — субъективно лучше"
                type="number"
                min={0}
                max={10}
                value={mood}
                onChange={(e) => setMood(e.target.value)}
              />
              <Field
                label="Тревога · 0–10"
                hint="Выше — субъективно сильнее"
                type="number"
                min={0}
                max={10}
                value={anxiety}
                onChange={(e) => setAnxiety(e.target.value)}
              />
            </div>
            <Field
              label="Сон, часов"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
            />
            <Textarea
              label="Что удавалось делать в повседневной жизни"
              value={functioning}
              onChange={(e) => setFunctioning(e.target.value)}
              rows={2}
            />
            <Select
              label="Факт приёма препаратов"
              value={medication}
              onChange={(e) =>
                setMedication(e.target.value as typeof medication)
              }
            >
              {Object.entries(medicineLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Field
              label="Препарат, время и причина пропуска / затруднений"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Textarea
              label="Нежелательные явления и время появления"
              value={adverse}
              onChange={(e) => setAdverse(e.target.value)}
              rows={2}
            />
          </>
        )}
        <Textarea
          label="Заметка / вопросы пациента"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={safety}
            onChange={(e) => setSafety(e.target.checked)}
          />
          <span>
            Пациент явно сообщил о вопросе безопасности, требующем оценки.
            Создать событие для врача.
          </span>
        </label>
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy}>
            Сохранить запись
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Messages({
  patient,
  actions,
  server,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  server: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const communicationAllowed =
    patient.consents.filter((c) => c.purpose === "communication").at(-1)
      ?.status === "documented";
  async function send(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.mutate(patient.id, { type: "message.send", text });
      setText("");
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Section
      title="Сообщения"
      description="Сохраняйте договорённости и вопросы в контексте пациента"
    >
      <div className={styles.notice}>
        {server
          ? "Сообщение получает статус доставки только после получения пациентским клиентом. Канал не предназначен для экстренной помощи."
          : "Учебная переписка: сообщения сохраняются в этом браузере и не отправляются реальному человеку."}
      </div>
      <div className={styles.messageList}>
        {patient.messages.map((m) => (
          <div
            key={m.id}
            className={styles.messageBubble}
            data-direction={m.direction}
          >
            <p>{m.text}</p>
            <small>
              {m.author} ·{" "}
              {formatDate(m.createdAt, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              ·{" "}
              {
                {
                  recorded: "Сохранено, доставка не подтверждена",
                  delivered: "Доставлено",
                  read: "Прочитано",
                }[m.status]
              }
            </small>
          </div>
        ))}
      </div>
      {!patient.messages.length && (
        <Empty title="Диалог ещё не начат" icon="message">
          Напишите понятное сообщение или зафиксируйте договорённость. Доставка
          и прочтение отображаются отдельно.
        </Empty>
      )}
      <form className={styles.form} onSubmit={send}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {!communicationAllowed && (
          <div className={styles.notice}>
            Перед отправкой зафиксируйте действующее согласие на дистанционную
            связь в разделе «Обзор» карты пациента.
          </div>
        )}
        <Textarea
          label="Сообщение пациенту"
          placeholder="Текст сообщения…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={3}
          maxLength={20000}
        />
        <div className={styles.formActions}>
          <Button
            type="submit"
            disabled={actions.busy || !communicationAllowed}
            icon="message"
          >
            {server ? "Отправить" : "Сохранить сообщение"}
          </Button>
        </div>
      </form>
      <SourceLinks ids={["S10", "S11"]} />
    </Section>
  );
}
