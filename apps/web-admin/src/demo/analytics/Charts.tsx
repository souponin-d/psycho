import { useEffect, useId, useRef, useState } from "react";
import { dateLabel } from "./model";
import type { ClinicAnalysis } from "./aggregate";
import styles from "./analytics.module.css";

export const number = (value: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
export const percent = (value: number | null) =>
  value === null ? "Нет данных" : `${number(value * 100)}%`;
export function MiniLine({
  values,
  color = "var(--analytics-blue)",
}: {
  values: (number | null)[];
  color?: string;
}) {
  const max = Math.max(
    1,
    ...values.flatMap((value) => (value === null ? [] : [value])),
  );
  let connected = false,
    path = "";
  values.forEach((value, index) => {
    if (value === null) {
      connected = false;
      return;
    }
    path += `${connected ? "L" : "M"}${(index / Math.max(1, values.length - 1)) * 130},${29 - (value / max) * 26} `;
    connected = true;
  });
  return (
    <svg className={styles.spark} viewBox="0 0 130 32" aria-hidden="true">
      <path d={path.trim()} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
export function TrendChart({
  rows,
  onDay,
}: {
  rows: ClinicAnalysis["daily"];
  onDay?: (day: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(660);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const measure = () => {
      if (ref.current)
        setWidth(Math.max(250, ref.current.getBoundingClientRect().width));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1, ...rows.flatMap((r) => [r.reports, r.previous ?? 0]));
  const left = 30,
    right = width - 15,
    top = 18,
    bottom = 191;
  const x = (index: number) =>
    left + (index / Math.max(1, rows.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  function line(previous = false) {
    let connected = false;
    let path = "";
    rows.forEach((r, i) => {
      const value = previous ? r.previous : r.available ? r.reports : null;
      if (value === null) {
        connected = false;
        return;
      }
      path += `${connected ? "L" : "M"}${x(i)},${y(value)} `;
      connected = true;
    });
    return path;
  }
  const active =
    selected === null ? null : rows[Math.min(selected, rows.length - 1)];
  return (
    <div ref={ref} className={styles.trend}>
      <div className={styles.legend}>
        <span>
          <i className={styles.blueDot} />
          Текущий период
        </span>
        <span>
          <i className={styles.purpleDot} />
          Предыдущий период
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} 230`}
        role="img"
        aria-labelledby={id}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setSelected(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(
                  ((((event.clientX - rect.left) / rect.width) * width - left) /
                    (right - left)) *
                    (rows.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <title id={id}>
          Известные самоотчёты по дням. Пропуски — разрывы. Точные значения
          доступны в таблице.
        </title>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3677c8" stopOpacity=".17" />
            <stop offset="100%" stopColor="#3677c8" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, Math.ceil(max / 2), max]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={right}
                y1={y(value)}
                y2={y(value)}
                className={styles.gridLine}
              />
              <text x={left - 9} y={y(value) + 4} textAnchor="end">
                {value}
              </text>
            </g>
          ))}
        {rows.map((r, i) =>
          r.available && i > 0 && rows[i - 1]!.available ? (
            <path
              key={r.day}
              d={`M${x(i - 1)},${bottom} L${x(i - 1)},${y(rows[i - 1]!.reports)} L${x(i)},${y(r.reports)} L${x(i)},${bottom}Z`}
              fill={`url(#${id}-fill)`}
            />
          ) : null,
        )}
        <path
          d={line(true)}
          fill="none"
          stroke="var(--analytics-purple)"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <path
          d={line()}
          fill="none"
          stroke="var(--analytics-blue)"
          strokeWidth="2.6"
        />
        {active && (
          <g>
            <line
              x1={x(selected!)}
              x2={x(selected!)}
              y1={top}
              y2={bottom}
              stroke="var(--analytics-blue)"
              strokeDasharray="3 4"
            />
            {active.available && (
              <circle
                cx={x(selected!)}
                cy={y(active.reports)}
                r="4.5"
                fill="var(--analytics-blue)"
              />
            )}
          </g>
        )}
        {[0, Math.floor((rows.length - 1) / 2), rows.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y="216"
              textAnchor={
                i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
              }
            >
              {dateLabel(rows[i]!.day)}
            </text>
          ))}
      </svg>
      <div className={styles.chartReadout} aria-live="polite">
        {active ? (
          <>
            <strong>{dateLabel(active.day)}</strong>
            <span>
              {active.available ? `${active.reports} записей` : "Нет сводки"} ·
              ранее: {active.previous ?? "Нет данных"}
            </span>
            {onDay && (
              <button onClick={() => onDay(active.day)}>Открыть записи</button>
            )}
          </>
        ) : (
          <span>Выберите дату на графике или откройте таблицу значений</span>
        )}
      </div>
      <details className={styles.values}>
        <summary>Даты и таблица значений</summary>
        <label className={styles.slider}>
          Дата на графике
          <input
            type="range"
            min="0"
            max={rows.length - 1}
            value={selected ?? 0}
            onChange={(e) => setSelected(Number(e.currentTarget.value))}
          />
        </label>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption>Самоотчёты по дням</caption>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Известные записи</th>
                <th>Сопоставимый день ранее</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
export function Bars({
  rows,
  color = "var(--analytics-blue)",
  label,
  onSelect,
}: {
  rows: { id: string; label: string; value: number; secondary?: string }[];
  color?: string;
  label: string;
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={styles.bars} role="group" aria-label={label}>
      {rows.map((row) => (
        <div key={row.id} className={styles.barRow}>
          <div className={styles.barHeading}>
            {onSelect ? (
              <button onClick={() => onSelect(row.id)}>{row.label}</button>
            ) : (
              <span>{row.label}</span>
            )}
            <strong>{number(row.value)}</strong>
          </div>
          <div className={styles.barTrack}>
            <div
              style={{
                width: `${(row.value / max) * 100}%`,
                background: color,
              }}
            />
          </div>
          {row.secondary && <small>{row.secondary}</small>}
        </div>
      ))}
    </div>
  );
}
export function Heatmap({ result }: { result: ClinicAnalysis }) {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const hours = Array.from({ length: 8 }, (_, i) => i + 9);
  const rows = hours.map((hour) =>
    days.map(
      (_, day) =>
        result.selected.visits.filter(
          (v) =>
            v.status === "done" &&
            (new Date(`${v.day}T12:00:00Z`).getUTCDay() + 6) % 7 === day &&
            Number(v.time.slice(0, 2)) === hour,
        ).length,
    ),
  );
  const max = Math.max(1, ...rows.flat());
  return (
    <div className={styles.tableScroll}>
      <table className={styles.heatmap}>
        <caption>
          Завершённые приёмы по дню недели и часу, сумма за выбранный период
        </caption>
        <thead>
          <tr>
            <th>Час</th>
            {days.map((day) => (
              <th key={day}>{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={hours[i]}>
              <th scope="row">{hours[i]}:00</th>
              {row.map((value, j) => (
                <td
                  key={j}
                  style={{
                    background: `rgba(54,119,200,${0.04 + (value / max) * 0.4})`,
                  }}
                  title={`${days[j]}, ${hours[i]}:00 · ${value} приёмов`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
