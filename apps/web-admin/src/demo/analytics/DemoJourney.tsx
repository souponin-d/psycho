import { useState } from "react";
import { Button, DialogRoot, DialogPanel } from "@psycho/ui-web";
import { DEMO_DAY, DEMO_PATIENT } from "./fixtures";
import { dateLabel, timeLabel } from "./model";
import type { ClinicController } from "./useClinicSession";
import type { DemoCommand } from "./model";
import { number } from "./Charts";
import styles from "./analytics.module.css";
export function commandText(command: DemoCommand) {
  switch (command.kind) {
    case "report":
      return "Пациент · самоотчёт и запрос связи получены";
    case "accept":
      return "Врач · событие принято";
    case "respond":
      return "Врач · просмотр и ответ подтверждены";
    case "schedule":
      return `Координатор · встреча ${dateLabel(command.day)} в ${command.time} добавлена`;
    case "roles":
      return `Системный администратор · роли сотрудника А-${command.employeeId.slice(-2)} изменены`;
    case "request":
      return "Координатор · запрос самоотчёта зафиксирован";
  }
}
export function DemoLog({ commands }: { commands: DemoCommand[] }) {
  return commands.length ? (
    <ol className={styles.eventLog} aria-label="Сквозной журнал">
      {[...commands].reverse().map((command) => (
        <li key={command.id}>
          <time dateTime={command.at}>{timeLabel(command.at)}</time>
          <strong>{commandText(command)}</strong>
          <small>Событие · {command.id.slice(-8)}</small>
        </li>
      ))}
    </ol>
  ) : (
    <p className={styles.empty}>
      Событий этого сеанса пока нет. Начните с самоотчёта.
    </p>
  );
}
export function DemoJourney({ controller }: { controller: ClinicController }) {
  const { projected: data, state, send, reset } = controller;
  const [mood, setMood] = useState("Обычно"),
    [note, setNote] = useState("Хочу уточнить время следующей встречи."),
    [confirmReset, setConfirmReset] = useState(false);
  const expectedId = `form-${DEMO_PATIENT}-${DEMO_DAY}`;
  const report = data.reports.find((r) => r.expectedId === expectedId);
  const command = state.commands.find(
    (c) => c.kind === "report" && c.expectedId === expectedId,
  );
  const signal = data.signals.find((s) => s.id === `signal-${command?.id}`);
  return (
    <div className={styles.stack}>
      <section className={styles.journeyIntro}>
        <div>
          <span className={styles.kicker}>Один сеанс · три точки зрения</span>
          <h2>Действие пациента становится частью общей картины</h2>
          <p>
            Самоотчёт поступает врачу, ответ фиксируется в журнале, а показатели
            клиники обновляются.
          </p>
        </div>
        <DialogRoot open={confirmReset} onOpenChange={setConfirmReset}>
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Начать новый сеанс
          </Button>
          <DialogPanel title="Сбросить сеанс?">
            <p>
              Будут удалены только действия, роли и фильтры этого набора в
              текущей вкладке. Подготовленная история останется.
            </p>
            <div className={styles.actions}>
              <Button
                onClick={() => {
                  reset();
                  setConfirmReset(false);
                }}
              >
                Сбросить сеанс
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmReset(false)}
              >
                Продолжить показ
              </Button>
            </div>
          </DialogPanel>
        </DialogRoot>
      </section>
      {!data.patients.length ? (
        <p className={styles.empty}>
          В этом наборе нет пациента. Выберите «Клиника · 180 дней».
        </p>
      ) : (
        <div className={styles.equalColumns}>
          <section className={styles.patientCard}>
            <div className={styles.stepHeading}>
              <span>1</span>
              <div>
                <h2>Пациент П-001</h2>
                <p>
                  {dateLabel(DEMO_DAY)} ·{" "}
                  {report ? "форма получена" : "ожидается форма"}
                </p>
              </div>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send({
                  kind: "report",
                  patientId: DEMO_PATIENT,
                  expectedId,
                  day: DEMO_DAY,
                  mood,
                  note,
                  requestContact: true,
                });
              }}
            >
              <label className={styles.field}>
                Самочувствие
                <select
                  value={mood}
                  disabled={!!report}
                  onChange={(e) => setMood(e.currentTarget.value)}
                >
                  <option>Спокойно</option>
                  <option>Обычно</option>
                  <option>Неустойчиво</option>
                </select>
              </label>
              <label className={styles.field}>
                Заметка
                <textarea
                  rows={3}
                  maxLength={500}
                  value={note}
                  disabled={!!report}
                  onChange={(e) => setNote(e.currentTarget.value)}
                />
              </label>
              <p className={styles.muted}>
                По сценарию пациент просит команду связаться. Запрос
                организационный и не является оценкой риска.
              </p>
              <Button type="submit" disabled={!!report}>
                Отправить самоотчёт
              </Button>
              {report && (
                <p className={styles.success}>
                  Форма получена. Повторная отправка отключена.
                </p>
              )}
            </form>
          </section>
          <section className={styles.doctorCard}>
            <div className={styles.stepHeading}>
              <span>2</span>
              <div>
                <h2>Кабинет врача</h2>
                <p>Появление записи и явная обработка</p>
              </div>
            </div>
            {report ? (
              <>
                <div className={styles.incoming}>
                  <strong>Пациент П-001 · новый самоотчёт</strong>
                  <p>{report.mood}</p>
                  <p>{report.note || "Без дополнительной заметки"}</p>
                </div>
                {signal?.status === "open" && (
                  <Button
                    onClick={() =>
                      send({ kind: "accept", signalId: signal.id })
                    }
                  >
                    Принять событие
                  </Button>
                )}
                {signal?.status === "accepted" && (
                  <>
                    <p className={styles.success}>Событие принято врачом</p>
                    <Button
                      onClick={() =>
                        send({ kind: "respond", signalId: signal.id })
                      }
                    >
                      Подтвердить просмотр и ответ
                    </Button>
                  </>
                )}
                {signal?.status === "closed" && (
                  <p className={styles.success}>Ответ подтверждён врачом</p>
                )}
                <p className={styles.footnote}>
                  Действие не назначает лечение и не изменяет медицинские
                  рекомендации. Отметка просмотра и ответ фиксируются отдельно
                  от доставки.
                </p>
              </>
            ) : (
              <p className={styles.empty}>
                Пока нет новой формы. Отправьте её в форме слева.
              </p>
            )}
          </section>
        </div>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>3. Руководитель видит изменение</h2>
            <p className={styles.muted}>
              Те же данные, тот же период. Новый самоотчёт входит в показатели,
              если соответствует активным фильтрам.
            </p>
          </div>
          <a
            href="#/director/overview"
            onClick={() => controller.setFilter(controller.defaultFilter())}
          >
            Открыть общий обзор
          </a>
        </div>
        <div className={styles.proofStrip}>
          <span>
            <strong>{number(data.reports.length)}</strong> записей в истории
          </span>
          <span>
            <strong>
              {data.signals.filter((s) => s.status !== "closed").length}
            </strong>{" "}
            открытых запросов
          </span>
          <span>
            <strong>{state.commands.length}</strong> действий в сеансе
          </span>
        </div>
      </section>
      <div className={styles.equalColumns}>
        <section className={styles.panel}>
          <h2>Журнал сквозного сценария</h2>
          <DemoLog commands={state.commands} />
        </section>
        <section className={styles.panel}>
          <h2>Маршрут показа жюри</h2>
          <ol className={styles.checklist}>
            <li>Отправить форму, принять событие и подтвердить ответ.</li>
            <li>
              <a href="#/director/overview">
                Показать изменение показателей и состав записей.
              </a>
            </li>
            <li>
              <a href="#/coordinator/day">
                Уточнить расписание в роли координатора.
              </a>
            </li>
            <li>
              <a href="#/director/medical">
                Показать описательную статистику, N и пропуски.
              </a>
            </li>
            <li>
              <a href="#/system/employees">
                Назначить сотруднику несколько рабочих ролей.
              </a>
            </li>
            <li>
              <a href="#/director/report">Сохранить агрегированный отчёт.</a>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
