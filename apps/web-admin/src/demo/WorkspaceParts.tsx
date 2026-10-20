import type { AdminDemoData } from "./data";
import styles from "./workspace.module.css";

export function Metrics({
  items,
}: {
  items: { label: string; value: string | number; caption: string }[];
}) {
  return (
    <section className={styles.metrics} aria-label="Показатели отделения">
      {items.map((item) => (
        <article
          className={styles.metric}
          aria-label={item.label}
          key={item.label}
        >
          <h2>{item.label}</h2>
          <p className={styles.metricValue}>{item.value}</p>
          <p className={styles.small}>{item.caption}</p>
        </article>
      ))}
    </section>
  );
}
export function Events({
  events,
  label,
}: {
  events: AdminDemoData["events"];
  label: string;
}) {
  return events.length ? (
    <ol className={styles.log} aria-label={label}>
      {events.map((event) => (
        <li key={event.id}>
          <span className={styles.small}>{event.date}</span>
          <strong>{event.title}</strong>
          <p>{event.body}</p>
        </li>
      ))}
    </ol>
  ) : (
    <p className={styles.empty}>Нет новых событий.</p>
  );
}
export function Team({ data }: { data: AdminDemoData }) {
  return data.team.length ? (
    <table className={styles.table} aria-label="Команда отделения">
      <thead>
        <tr>
          <th scope="col">Кабинет</th>
          <th scope="col" className={styles.number}>
            Пациенты
          </th>
          <th scope="col">Следующая встреча</th>
        </tr>
      </thead>
      <tbody>
        {data.team.map((office) => (
          <tr key={office.id}>
            <th scope="row">
              {office.name}
              <small>{office.unit}</small>
            </th>
            <td className={styles.number}>{office.patients}</td>
            <td>{office.nextVisit ?? "Не указана"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <div className={styles.empty}>
      <h3>Команда ещё не добавлена.</h3>
      <p>
        В новом отделении пока нет кабинетов. Выберите «Рабочий день», чтобы
        пройти заполненный сценарий.
      </p>
    </div>
  );
}
