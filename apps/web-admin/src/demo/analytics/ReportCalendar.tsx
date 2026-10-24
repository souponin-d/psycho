import type { ClinicAnalysis } from "./aggregate";
import { dateLabel } from "./model";
import { number } from "./Charts";
import styles from "./reportCalendar.module.css";

export function ReportCalendar({
  result,
  onDay,
}: {
  result: ClinicAnalysis;
  onDay: (day: string) => void;
}) {
  const known = result.daily.filter((row) => row.available);
  const maximum = Math.max(0, ...known.map((row) => row.reports));
  const positive = known
    .filter((row) => row.reports > 0)
    .map((row) => row.reports);
  const minimum = positive.length ? Math.min(...positive) : 0;
  const level = (count: number) =>
    count === 0
      ? 0
      : maximum === minimum
        ? 4
        : 1 + Math.floor(((count - minimum) / (maximum - minimum)) * 3);
  if (!result.selected.patients.length)
    return (
      <p className={styles.empty}>
        В выбранной выборке нет пациентов. Измените период или фильтры, чтобы
        увидеть календарь.
      </p>
    );
  return (
    <div className={styles.calendar}>
      <div className={styles.headline}>
        <strong>{known.length ? number(result.summary.reports) : "—"}</strong>
        <div>
          <span>Известные самоотчёты</span>
          <small>
            Дней со сводкой: {known.length} · без сводки:{" "}
            {result.summary.missingDays}
          </small>
        </div>
      </div>
      <p className={styles.hint}>
        {known.length
          ? "Выберите день, чтобы открыть записи."
          : "Дни без сводки недоступны для открытия."}
      </p>
      <div
        className={styles.days}
        role="group"
        aria-label="Календарь самоотчётов"
      >
        {result.daily.map((row) => (
          <button
            type="button"
            key={row.day}
            className={`${styles.day} ${!row.available ? styles.missing : ""}`}
            data-level={row.available ? level(row.reports) : undefined}
            disabled={!row.available}
            aria-label={`${dateLabel(row.day)}, ${row.available ? `самоотчётов: ${row.reports}. Открыть записи` : "нет сводки"}`}
            onClick={() => onDay(row.day)}
          >
            <time dateTime={row.day}>{dateLabel(row.day)}</time>
            <strong>{row.available ? row.reports : "—"}</strong>
            <span>{row.available ? "записей" : "нет сводки"}</span>
          </button>
        ))}
      </div>
      <div className={styles.period}>
        <span>{dateLabel(result.filter.from)}</span>
        <span>{dateLabel(result.filter.to)}</span>
      </div>
      <div className={styles.legend}>
        <span>0</span>
        <span className={styles.scale} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((value) => (
            <i key={value} data-level={value} />
          ))}
        </span>
        <span>
          {!known.length
            ? "Нет доступных сводок"
            : maximum
              ? `Положительные значения: ${minimum}–${maximum}`
              : "Все известные значения — 0"}
        </span>
        <span className={styles.gap}>
          <i aria-hidden="true" /> Нет сводки
        </span>
      </div>
      <p className={styles.note}>
        Светлее — меньше записей, темнее — больше в диапазоне выбранного
        периода. Число внутри плитки — точное значение. Пропуск не равен нулю.
      </p>
      <details className={styles.details}>
        <summary>Даты и таблица значений</summary>
        <div
          className={styles.scroll}
          tabIndex={0}
          role="region"
          aria-label="Самоотчёты по датам"
        >
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Самоотчёты</th>
                <th>Сопоставимый день ранее</th>
              </tr>
            </thead>
            <tbody>
              {result.daily.map((row) => (
                <tr key={row.day}>
                  <th scope="row">{dateLabel(row.day)}</th>
                  <td>{row.available ? row.reports : "Нет сводки"}</td>
                  <td>{row.previous ?? "Нет данных"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
