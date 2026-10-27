import { useState, type FormEvent } from "react";
import type { Actor, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import {
  adherenceSummary,
  type AdherenceMutation,
  type AdherenceSchedule,
  type AdherenceSlot,
  type AdherenceState,
  type AdherenceStatus,
  type AdherenceProvenance,
} from "./adherence";
import {
  Button,
  ErrorNotice,
  Field,
  Modal,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

const statusLabels: Record<AdherenceStatus, string> = {
  taken: "Принял",
  missed: "Пропустил",
  "not-applicable": "Не применимо",
  unknown: "Нет отметки",
};
const local = (at: string, offset: number) =>
  new Date(Date.parse(at) + offset * 60_000).toISOString().slice(0, 16);
const iso = (value: string, offset: number) =>
  new Date(Date.parse(`${value}:00.000Z`) - offset * 60_000).toISOString();
const zone = (offset: number) =>
  `UTC${offset < 0 ? "−" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
const percentage = (value: number | null) =>
  value === null ? "—" : `${Math.round(value)}%`;

/** Clinician entry of synthetic self-reports; no assumption of mobile delivery. */
export function AdherencePanel({
  patient,
  actions,
}: {
  patient: PatientRecord & { adherence?: AdherenceState };
  actions?: WorkspaceActions;
  actor: Actor;
}) {
  const now = new Date().toISOString();
  const deviceOffset = -new Date().getTimezoneOffset();
  const currentDay = local(now, deviceOffset).slice(0, 10);
  const [fromDate, setFromDate] = useState(
    new Date(Date.parse(`${currentDay}T00:00:00Z`) - 6 * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  const [toDate, setToDate] = useState(currentDay);
  const [error, setError] = useState("");
  const [editingSchedule, setEditingSchedule] = useState<{
    id: string;
    expectedVersion: number;
  } | null>(null);
  const [planId, setPlanId] = useState("");
  const [times, setTimes] = useState("");
  const [offsetMinutes, setOffsetMinutes] = useState(deviceOffset);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [startImmediately, setStartImmediately] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [slot, setSlot] = useState<AdherenceSlot | null>(null);
  const [status, setStatus] = useState<AdherenceStatus>("unknown");
  const [provenance, setProvenance] = useState<AdherenceProvenance>("patient");
  const [reportedAt, setReportedAt] = useState("");
  const [recordReason, setRecordReason] = useState("");
  const writable = !!actions && !patient.archived;
  const state = patient.adherence;
  const plans = patient.plan.filter(
    (entry) => entry.kind === "medication" && entry.status === "confirmed",
  );
  const latest = [
    ...new Map(
      (state?.schedules ?? []).map((entry) => [entry.id, entry]),
    ).values(),
  ];
  let rangeError = "";
  let summary: ReturnType<typeof adherenceSummary> | undefined;
  try {
    summary = adherenceSummary(patient, fromDate, toDate, now);
  } catch (err) {
    rangeError = message(err);
  }

  function scheduleForm(schedule?: AdherenceSchedule) {
    const plan = schedule
      ? plans.find((entry) => entry.id === schedule.planId)
      : plans[0];
    if (!plan) return;
    setEditingSchedule({
      id: schedule?.id ?? crypto.randomUUID(),
      expectedVersion: schedule?.version ?? 0,
    });
    setPlanId(plan.id);
    setTimes(schedule?.times.join(", ") ?? "");
    setOffsetMinutes(schedule?.offsetMinutes ?? deviceOffset);
    setEffectiveFrom(local(now, schedule?.offsetMinutes ?? deviceOffset));
    setStartImmediately(true);
    setEndDate(schedule?.endDate ?? plan.endDate.slice(0, 10));
    setScheduleReason("");
    setError("");
  }
  function recordForm(value: AdherenceSlot) {
    setSlot(value);
    setStatus(value.status);
    setProvenance("patient");
    setReportedAt(local(now, value.offsetMinutes));
    setRecordReason("");
    setError("");
  }
  async function save(
    event: FormEvent,
    mutation: AdherenceMutation,
    close: () => void,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!actions) return;
    try {
      await actions.mutate(patient.id, mutation, patient.revision);
      close();
    } catch (err) {
      setError(message(err));
    }
  }
  function saveSchedule(event: FormEvent) {
    if (!editingSchedule) return;
    try {
      const mutation: AdherenceMutation = {
        type: "adherence.schedule",
        value: {
          ...editingSchedule,
          planId,
          times: times
            .split(/[,;\n]/)
            .map((time) => time.trim())
            .filter(Boolean),
          offsetMinutes,
          effectiveFrom: startImmediately
            ? new Date(
                Math.ceil((Date.now() + 1) / 60_000) * 60_000,
              ).toISOString()
            : iso(effectiveFrom, offsetMinutes),
          endDate,
          reason: scheduleReason,
        },
      };
      void save(event, mutation, () => setEditingSchedule(null));
    } catch (err) {
      event.preventDefault();
      event.stopPropagation();
      setError(message(err));
    }
  }
  function saveRecord(event: FormEvent) {
    if (!slot) return;
    try {
      const mutation: AdherenceMutation = {
        type: "adherence.record",
        value: {
          scheduleId: slot.scheduleId,
          scheduleVersion: slot.scheduleVersion,
          plannedAt: slot.plannedAt,
          status,
          reportedAt: iso(reportedAt, slot.offsetMinutes),
          provenance,
          reason: recordReason,
          expectedVersion: slot.recordVersion,
        },
      };
      void save(event, mutation, () => setSlot(null));
    } catch (err) {
      event.preventDefault();
      event.stopPropagation();
      setError(message(err));
    }
  }
  return (
    <section
      className={styles.contextCard}
      aria-label="Приверженность назначениям"
    >
      <div className={styles.between}>
        <h3>Приём по расписанию</h3>
        {writable && (
          <Button
            type="button"
            variant="ghost"
            disabled={actions!.busy || !plans.length}
            onClick={() => scheduleForm()}
          >
            Указать расписание
          </Button>
        )}
      </div>
      <div className={styles.row}>
        <Field
          label="Период отметок: с"
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
        />
        <Field
          label="Период отметок: по"
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
        />
      </div>
      {rangeError ? (
        <ErrorNotice>{rangeError}</ErrorNotice>
      ) : (
        summary && (
          <>
            <p>
              <strong>
                Принято по отметкам: {percentage(summary.percentage)}
              </strong>{" "}
              · покрытие известными ответами: {percentage(summary.coverage)}
            </p>
            <p>
              {summary.taken} принял · {summary.missed} пропустил ·{" "}
              {summary.unknown} без отметки · {summary.notApplicable}{" "}
              неприменимо с причиной
            </p>
            {!summary.applicable && (
              <p className={styles.subtext}>
                Наступивших применимых приёмов в периоде нет.
              </p>
            )}
            <details className={styles.details}>
              <summary>Отметки приёма ({summary.slots.length})</summary>
              {!summary.slots.length && (
                <p>Наступившие приёмы появятся после указания расписания.</p>
              )}
              {summary.slots.map((value) => (
                <article key={value.id} className={styles.inlineNote}>
                  <div className={styles.between}>
                    <strong>{value.planSnapshot.title}</strong>
                    <span>{statusLabels[value.status]}</span>
                  </div>
                  <p>
                    {value.localDate} · {value.time} ·{" "}
                    {zone(value.offsetMinutes)} · {value.planSnapshot.dose}
                  </p>
                  {value.reason && <p>{value.reason}</p>}
                  {writable && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={actions!.busy}
                      onClick={() => recordForm(value)}
                    >
                      {value.recordVersion
                        ? "Исправить отметку"
                        : "Добавить отметку"}
                    </Button>
                  )}
                  <details className={styles.details}>
                    <summary>Основание и история отметки</summary>
                    <p>
                      Назначение {value.planId} · расписание {value.scheduleId},
                      версия {value.scheduleVersion}
                    </p>
                    <p>
                      Подтвердил назначение: {value.planSnapshot.confirmedBy} ·{" "}
                      {value.planSnapshot.confirmedAt}
                    </p>
                    {(
                      state?.records.find((entry) => entry.id === value.id)
                        ?.history ?? []
                    ).map((revision) => (
                      <p key={revision.version}>
                        Версия {revision.version}:{" "}
                        {statusLabels[revision.status]} · {revision.reportedAt}{" "}
                        ·{" "}
                        {revision.provenance === "patient"
                          ? "Со слов пациента"
                          : "Отметка врача"}{" "}
                        · записал {revision.by.name} ·{" "}
                        {revision.reason || "Первичная отметка"}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
            </details>
          </>
        )
      )}
      <details className={styles.details}>
        <summary>Расписание и история</summary>
        {!latest.length && (
          <p>
            Время приёма ещё не указано. Текст назначения не превращается в
            расписание автоматически.
          </p>
        )}
        {latest.map((entry) => (
          <div key={entry.id}>
            <p>
              <strong>{entry.planSnapshot.title}</strong> ·{" "}
              {entry.times.join(", ")} · {zone(entry.offsetMinutes)} · до{" "}
              {entry.endDate}
            </p>
            <p>
              {entry.effectiveUntil
                ? `${entry.effectiveUntil > now ? "Действует до" : "Закрыто с"} ${entry.effectiveUntil}: ${entry.closeReason}`
                : entry.effectiveFrom > now
                  ? `Начнётся с ${entry.effectiveFrom}`
                  : entry.endDate < local(now, entry.offsetMinutes).slice(0, 10)
                    ? "Завершено по дате"
                    : "Действующее расписание"}
            </p>
            {writable && plans.some((plan) => plan.id === entry.planId) && (
              <Button
                type="button"
                variant="ghost"
                disabled={actions!.busy}
                onClick={() => scheduleForm(entry)}
              >
                Изменить время
              </Button>
            )}
            <details className={styles.details}>
              <summary>Версии расписания</summary>
              {(state?.schedules ?? [])
                .filter((version) => version.id === entry.id)
                .map((version) => (
                  <p key={version.version}>
                    Версия {version.version} · {version.planSnapshot.dose} ·{" "}
                    {version.times.join(", ")} · {zone(version.offsetMinutes)} ·
                    с {version.effectiveFrom}
                    {version.effectiveUntil
                      ? ` до ${version.effectiveUntil} (не включая)`
                      : ""}{" "}
                    · {version.createdBy.name} · {version.reason}
                    {version.closeReason ? ` · ${version.closeReason}` : ""}
                  </p>
                ))}
            </details>
          </div>
        ))}
      </details>
      <details className={styles.details}>
        <summary>Как рассчитаны показатели</summary>
        <p>
          Процент: принятые / (принятые + пропущенные + без отметки) среди
          наступивших применимых приёмов. Покрытие: известные ответы о приёме
          или пропуске / те же применимые приёмы. Будущее не учитывается;
          неприменимость исключается только с причиной.
        </p>
        <p>
          Отсутствие отметки не считается пропуском. Самоотчёт не подтверждает
          фактический приём; пороги «хорошей» или «плохой» приверженности не
          назначаются.
        </p>
        <p>
          Часовой пояс фиксируется в каждой версии расписания. Старые отметки и
          доза сохраняются в исходной версии после изменения назначения.
        </p>
      </details>
      {editingSchedule && (
        <Modal
          open
          onClose={() => setEditingSchedule(null)}
          title="Расписание приёма"
        >
          <form className={styles.form} onSubmit={saveSchedule}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <Select
              label="Подтверждённое назначение"
              value={planId}
              disabled={editingSchedule.expectedVersion > 0}
              onChange={(event) => {
                setPlanId(event.target.value);
                setEndDate(
                  plans
                    .find((plan) => plan.id === event.target.value)
                    ?.endDate.slice(0, 10) ?? "",
                );
              }}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title} · {plan.dose}
                </option>
              ))}
            </Select>
            <Field
              label="Время приёма через запятую"
              value={times}
              onChange={(event) => setTimes(event.target.value)}
              placeholder="09:00, 21:00"
              required
              hint="Укажите согласованное время; дозировка берётся из подтверждённого назначения"
            />
            <Select
              label="Часовой пояс"
              value={offsetMinutes}
              onChange={(event) => setOffsetMinutes(Number(event.target.value))}
            >
              {Array.from({ length: 105 }, (_, i) => -720 + i * 15).map(
                (offset) => (
                  <option key={offset} value={offset}>
                    {zone(offset)}
                    {offset === deviceOffset ? " · На устройстве" : ""}
                  </option>
                ),
              )}
            </Select>
            <Select
              label="Начало расписания"
              value={startImmediately ? "next-minute" : "specified"}
              onChange={(event) =>
                setStartImmediately(event.target.value === "next-minute")
              }
            >
              <option value="next-minute">
                С ближайшей полной минуты после сохранения
              </option>
              <option value="specified">Указать дату и время</option>
            </Select>
            {!startImmediately && (
              <Field
                label="Начало версии, местное время"
                type="datetime-local"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
              />
            )}
            <Field
              label="Последний день расписания"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
            <Textarea
              label="Основание расписания / изменения"
              value={scheduleReason}
              onChange={(event) => setScheduleReason(event.target.value)}
              required
            />
            <Button type="submit" disabled={actions?.busy}>
              Сохранить расписание
            </Button>
          </form>
        </Modal>
      )}
      {slot && (
        <Modal open onClose={() => setSlot(null)} title="Отметка приёма">
          <form className={styles.form} onSubmit={saveRecord}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p>
              {slot.planSnapshot.title} · {slot.planSnapshot.dose} ·{" "}
              {slot.localDate}, {slot.time} ({zone(slot.offsetMinutes)})
            </p>
            <Select
              label="Статус приёма"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AdherenceStatus)
              }
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="Происхождение отметки"
              value={provenance}
              onChange={(event) =>
                setProvenance(event.target.value as AdherenceProvenance)
              }
            >
              <option value="patient">Со слов пациента</option>
              <option value="clinician">Отметка врача</option>
            </Select>
            <Field
              label="Время сообщения, местное"
              type="datetime-local"
              value={reportedAt}
              onChange={(event) => setReportedAt(event.target.value)}
              required
            />
            <Textarea
              label="Причина / уточнение отметки"
              value={recordReason}
              onChange={(event) => setRecordReason(event.target.value)}
              required={status === "not-applicable" || slot.recordVersion > 0}
              hint={
                slot.recordVersion
                  ? "Исправление сохраняет предыдущую версию"
                  : "Для неприменимости нужна причина"
              }
            />
            <Button type="submit" disabled={actions?.busy}>
              Сохранить отметку
            </Button>
          </form>
        </Modal>
      )}
    </section>
  );
}
