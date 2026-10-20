import type { ChartSeries } from "../contracts/presentation";
import styles from "./primitives.module.css";

export function LineChart({ series }: { series: ChartSeries }) {
  if (!series.points.length)
    return (
      <p role="status" className="notice">
        Нет данных для графика «{series.label}».
      </p>
    );
  const values = series.points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const scale = Math.max(1, ...values.map((value) => Math.abs(value)));
  const scaled = values.map((value) => value / scale);
  const min = Math.min(...scaled),
    max = Math.max(...scaled);
  let connected = false;
  let path = "";
  const coordinates = series.points.map((point, index) => {
    if (point.value === null) {
      connected = false;
      return null;
    }
    const x =
      series.points.length === 1
        ? 300
        : 20 + (index / (series.points.length - 1)) * 560;
    const y =
      min === max
        ? 80
        : 140 - ((point.value / scale - min) / (max - min)) * 120;
    path += `${connected ? "L" : "M"}${x},${y} `;
    connected = true;
    return { id: point.id, x, y };
  });
  return (
    <figure className={styles.chart}>
      <figcaption>{series.label}</figcaption>
      {values.length ? (
        <svg
          viewBox="0 0 600 160"
          role="img"
          aria-label={`${series.label} — график`}
        >
          <g
            stroke="var(--color-border)"
            strokeDasharray="3 5"
            aria-hidden="true"
          >
            {[20, 80, 140].map((y) => (
              <line key={y} x1="20" x2="580" y1={y} y2={y} />
            ))}
          </g>
          <path
            d={path.trim()}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
          />
          {coordinates.map(
            (point) =>
              point && (
                <circle
                  key={point.id}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="var(--color-accent)"
                />
              ),
          )}
        </svg>
      ) : (
        <p role="status" className="notice">
          Нет числовых значений для графика.
        </p>
      )}
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="region"
        aria-label={`${series.label} — таблица с прокруткой`}
      >
        <table
          className={styles.table}
          aria-label={`${series.label} — значения`}
        >
          <thead>
            <tr>
              <th scope="col">Подпись</th>
              <th scope="col">Значение</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((point) => (
              <tr key={point.id}>
                <th scope="row">{point.label}</th>
                <td>
                  {point.value === null ? "Нет данных" : String(point.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
