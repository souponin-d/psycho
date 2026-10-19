import { useState } from "react";
import { DemoDataPicker, DemoMetrics, LineChart } from "@psycho/ui-web";
import type { Scenario } from "@psycho/ui-web/contracts";
import { adminDemoSchema, adminDemoSources, type AdminDemoData } from "./data";
import styles from "./AdminDemo.module.css";

function AdminSession({ data }: { data: AdminDemoData }) {
  return (
    <div className="stack">
      <DemoMetrics items={data.metrics} label="Показатели отделения" />
      <div className={styles.dashboard}>
        <section className="panel">
          <div className="demo-section-heading">
            <div>
              <p className="demo-eyebrow">01 / АКТИВНОСТЬ</p>
              <h2>Каждая запись — часть картины</h2>
            </div>
          </div>
          <p className={styles.chartNote}>
            Готовые количества учебных самоотчётов. Пропуск означает отсутствие
            сводки за день.
          </p>
          <LineChart series={data.series} />
        </section>
        <section className="panel" aria-labelledby="activity-heading">
          <div className="demo-section-heading">
            <div>
              <p className="demo-eyebrow">02 / ОБЩИЙ КОНТЕКСТ</p>
              <h2 id="activity-heading">Лента событий</h2>
            </div>
          </div>
          {data.events.length ? (
            <ol className="demo-timeline">
              {data.events.map((event) => (
                <li key={event.id}>
                  <span>{event.date}</span>
                  <strong>{event.title}</strong>
                  <p>{event.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="demo-empty-note">Нет новых событий.</p>
          )}
        </section>
      </div>
      <section className="panel" aria-labelledby="team-heading">
        <div className="demo-section-heading">
          <div>
            <p className="demo-eyebrow">03 / КОМАНДА</p>
            <h2 id="team-heading">Кабинеты отделения</h2>
          </div>
          <span className="demo-count">Всего: {data.team.length}</span>
        </div>
        {data.team.length ? (
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label="Команда — таблица с прокруткой"
          >
            <table className={styles.team} aria-label="Команда отделения">
              <thead>
                <tr>
                  <th scope="col">Кабинет</th>
                  <th scope="col">Пациенты</th>
                  <th scope="col">Самоотчёты</th>
                  <th scope="col">Следующая встреча</th>
                </tr>
              </thead>
              <tbody>
                {data.team.map((person) => (
                  <tr key={person.id}>
                    <th scope="row">
                      <strong>{person.name}</strong>
                      <span>{person.unit}</span>
                    </th>
                    <td>{person.patients}</td>
                    <td>{person.reports}</td>
                    <td>{person.nextVisit ?? "Не указана"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="demo-empty">
            <h3>Команда ещё не добавлена.</h3>
            <p>Переключите набор, чтобы посмотреть заполненную сводку.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function AdminDemo() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const result = adminDemoSchema.safeParse(adminDemoSources[scenario]);
  const valid = result.success && result.data.scenario === scenario;
  return (
    <div className="demo-page">
      <div className="demo-context">
        <div>
          <p className="demo-eyebrow">ДЕМОНСТРАЦИОННОЕ ОТДЕЛЕНИЕ</p>
          <p>{valid ? result.data.unit : "Данные отделения"}</p>
          <span className="muted">
            {valid ? result.data.period : "Набор не загружен"}
          </span>
        </div>
        <DemoDataPicker value={scenario} onChange={setScenario} />
      </div>
      {valid ? (
        <AdminSession key={scenario} data={result.data} />
      ) : (
        <p role="alert" className="notice">
          Ошибка демо администратора: {scenario}.json —{" "}
          {result.success
            ? "scenario не соответствует набору"
            : result.error.issues
                .map((issue) => issue.path.join("."))
                .join(", ")}
        </p>
      )}
      <p className="demo-footnote">
        Вымышленное отделение. Показатели переданы готовыми и не отражают
        качество лечения или медицинский риск.
      </p>
    </div>
  );
}
