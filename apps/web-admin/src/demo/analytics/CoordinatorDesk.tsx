import { useState } from "react";
import { Button } from "@psycho/ui-web";
import { Team } from "../WorkspaceParts";
import type { AdminDemoData } from "../data";
import { DEMO_DAY, DEMO_PATIENT } from "./fixtures";
import { addDays } from "./model";
import type { ClinicController } from "./useClinicSession";
import { DemoLog } from "./DemoJourney";
import styles from "./analytics.module.css";
export function CoordinatorDesk({
  data,
  controller,
  section,
}: {
  data: AdminDemoData;
  controller: ClinicController;
  section: string;
}) {
  const [day, setDay] = useState(addDays(DEMO_DAY, 2)),
    [time, setTime] = useState("16:30");
  const scheduled = controller.state.commands.some(
    (c) => c.kind === "schedule",
  );
  const schedulePatient = controller.projected.patients.find(
    (p) => p.doctorId === "demo-doctor-03" && !p.closed,
  );
  const requested = controller.state.commands.some(
    (c) => c.kind === "request" && c.patientId === DEMO_PATIENT,
  );
  const received = controller.projected.reports.some(
    (r) => r.expectedId === `form-${DEMO_PATIENT}-${DEMO_DAY}`,
  );
  if (section === "events")
    return (
      <section className={styles.panel}>
        <h2>Организационные события сеанса</h2>
        <DemoLog commands={controller.state.commands} />
      </section>
    );
  if (section === "team")
    return (
      <section className={styles.panel}>
        <h2>Команда клиники</h2>
        <Team data={data} />
      </section>
    );
  return (
    <div className={styles.stack}>
      <div className={styles.proofStrip}>
        <span>
          <strong>{data.team.length}</strong> врачей в команде
        </span>
        <span>
          <strong>
            {
              controller.projected.signals.filter((s) => s.status !== "closed")
                .length
            }
          </strong>{" "}
          запросов на связь
        </span>
        <span>
          <strong>{scheduled ? 1 : 0}</strong> встреч добавлено в сеансе
        </span>
      </div>
      {!data.team.length ? (
        <p className={styles.empty}>
          Команда ещё не добавлена. В новом отделении нет организационных задач.
        </p>
      ) : (
        <div className={styles.equalColumns}>
          <section className={styles.panel}>
            <span className={styles.kicker}>Организационный вопрос</span>
            <h2>Уточнить расписание кабинета Д-03</h2>
            <p className={styles.muted}>
              Подтверждённая учебная встреча появится в расписании команды и
              журнале.
            </p>
            <form
              className={styles.scheduleForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (schedulePatient)
                  controller.send({
                    kind: "schedule",
                    patientId: schedulePatient.id,
                    day,
                    time,
                  });
              }}
            >
              <label className={styles.field}>
                День встречи
                <input
                  type="date"
                  min={addDays(DEMO_DAY, 1)}
                  max={addDays(DEMO_DAY, 14)}
                  value={day}
                  disabled={scheduled}
                  onChange={(e) => setDay(e.currentTarget.value)}
                  required
                />
              </label>
              <label className={styles.field}>
                Время встречи
                <input
                  type="time"
                  value={time}
                  disabled={scheduled}
                  onChange={(e) => setTime(e.currentTarget.value)}
                  required
                />
              </label>
              <Button type="submit" disabled={scheduled || !schedulePatient}>
                Подтвердить встречу
              </Button>
              {scheduled && (
                <p className={styles.success}>Встреча добавлена в расписание</p>
              )}
            </form>
          </section>
          <section className={styles.panel}>
            <span className={styles.kicker}>Сопровождение</span>
            <h2>
              {received
                ? "Самоотчёт П-001 получен"
                : "Ожидается самоотчёт П-001"}
            </h2>
            <p className={styles.muted}>
              Запрос фиксируется в общем журнале. Ответ учебного пациента
              закрывает ожидание.
            </p>
            <div className={styles.actions}>
              <Button
                disabled={requested || received}
                onClick={() =>
                  controller.send({ kind: "request", patientId: DEMO_PATIENT })
                }
              >
                Запросить самоотчёт
              </Button>
              <a href="#/coordinator/journey">Открыть учебного пациента</a>
            </div>
            {received ? (
              <p className={styles.success}>
                Самоотчёт получен, ожидание закрыто
              </p>
            ) : requested ? (
              <p className={styles.success}>
                Запрос самоотчёта зафиксирован в сеансе
              </p>
            ) : null}
            <p className={styles.footnote}>
              Клиническая оценка и изменение терапии не входят в эту задачу.
            </p>
          </section>
        </div>
      )}
      <section className={styles.panel}>
        <h2>Расписание команды</h2>
        <Team data={data} />
      </section>
    </div>
  );
}
