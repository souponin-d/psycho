import { Button } from "@psycho/ui-web";
import type { AdminDemoData } from "./data";
import {
  getPeriodSummary,
  type SessionAction,
  type SessionState,
} from "./workspaceState";
import { ActivityChart } from "./ActivityChart";
import { Metrics } from "./WorkspaceParts";
import styles from "./workspace.module.css";

export function DirectorView({
  data,
  state,
  dispatch,
  section,
}: {
  data: AdminDemoData;
  state: SessionState;
  dispatch: (action: SessionAction) => void;
  section: string;
}) {
  const { period, reports, knownDays, days, patients } = getPeriodSummary(
    data,
    state.periodId,
  );
  const open = data.tasks.length - state.completed.length;
  const periodControl =
    data.periods.length > 1 ? (
      <label className={styles.field}>
        Период отчёта
        <select
          value={period.id}
          onChange={(event) =>
            dispatch({ type: "period", id: event.currentTarget.value })
          }
        >
          {data.periods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    ) : (
      <p className={styles.small}>Период: {period.label}</p>
    );
  const offices = (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <h2>Распределение по кабинетам</h2>
        <span className={styles.small}>{period.label}</span>
      </div>
      {data.team.length ? (
        <table className={styles.table} aria-label="Показатели кабинетов">
          <thead>
            <tr>
              <th scope="col">Кабинет</th>
              <th scope="col" className={styles.number}>
                Пациенты на дату снимка
              </th>
              <th scope="col" className={styles.number}>
                Самоотчёты за период
              </th>
            </tr>
          </thead>
          <tbody>
            {data.team.map((office) => (
              <tr key={office.id}>
                <th scope="row">{office.name}</th>
                <td className={styles.number}>{office.patients}</td>
                <td className={styles.number}>
                  {
                    period.officeReports.find(
                      (row) => row.doctorId === office.id,
                    )!.count
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={styles.empty}>Кабинеты ещё не добавлены.</p>
      )}
      <p className={styles.small}>
        Пациенты — снимок на {data.snapshot}. Самоотчёты — известные записи за
        выбранный период.
      </p>
    </section>
  );
  const report = (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>Отчёт для руководителя</h2>
          <p className={styles.small}>
            Агрегированная сводка без медицинских карточек
          </p>
        </div>
        <Button
          onClick={() => dispatch({ type: "toggleReport" })}
          aria-expanded={state.reportOpen}
          aria-controls="report-preview"
        >
          {state.reportOpen ? "Скрыть предпросмотр" : "Предпросмотр отчёта"}
        </Button>
      </div>
      {state.reportOpen && (
        <section
          id="report-preview"
          className={styles.detail}
          aria-label="Предпросмотр отчёта"
        >
          <h3>Сводка: {data.unit}</h3>
          <p>
            Период: {period.label}. Кабинеты: {data.team.length}. Пациенты на
            дату снимка: {patients}. Известные самоотчёты: {reports}.
          </p>
          <p>
            {knownDays
              ? `Данные доступны за ${knownDays} из ${days} дней.`
              : "Данные за период отсутствуют."}{" "}
            {knownDays < days &&
              "Сводка неполна; отсутствие данных не означает нулевую активность."}
          </p>
          <p className={styles.small}>
            Диагнозы, назначения и индивидуальные ответы пациентов не включены.
          </p>
        </section>
      )}
    </section>
  );
  return (
    <div className={styles.stack}>
      <div className={styles.periodBar}>{periodControl}</div>
      {section === "overview" && (
        <>
          <Metrics
            items={[
              { label: "Самоотчёты", value: reports, caption: period.label },
              {
                label: "На сопровождении",
                value: patients,
                caption: `Снимок: ${data.snapshot}`,
              },
              {
                label: "Дни с данными",
                value: period.series.points.length
                  ? `${knownDays} / ${days}`
                  : "Нет данных",
                caption:
                  knownDays === days && days > 0
                    ? "Все дни выбранного периода"
                    : "Неполная или отсутствующая сводка",
              },
            ]}
          />
          <div className={styles.twoColumns}>
            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <h2>Активность по дням</h2>
              </div>
              <ActivityChart series={period.series} />
            </section>
            <section className={styles.panel}>
              <h2>Состав сводки</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Отделение</dt>
                  <dd>{data.unit}</dd>
                </div>
                <div>
                  <dt>Кабинеты</dt>
                  <dd>{data.team.length}</dd>
                </div>
                <div>
                  <dt>Задачи координатора</dt>
                  <dd>
                    {open === 1 ? "1 открытая задача" : `Открыто: ${open}`}
                  </dd>
                </div>
              </dl>
              <p className={styles.note}>
                Самоотчёты показывают активность. Они не оценивают эффективность
                лечения или работу врача.
              </p>
              <p className={styles.small}>
                Сводка за прошлый месяц:{" "}
                {data.metrics.find((item) => item.id === "demo-admin-history")
                  ?.value ?? "Нет данных"}
              </p>
            </section>
          </div>
          {offices}
        </>
      )}
      {section === "offices" && offices}
      {(section === "report" || section === "overview") && report}
    </div>
  );
}
