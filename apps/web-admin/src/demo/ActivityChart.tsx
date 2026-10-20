import { useEffect, useId, useRef, useState } from "react";
import type { ChartSeries } from "@psycho/ui-web/contracts";
import styles from "./workspace.module.css";

export function ActivityChart({ series }: { series: ChartSeries }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const titleId = useId();
  useEffect(() => {
    const update = () => {
      const measured = container.current?.getBoundingClientRect().width;
      if (measured) setWidth(Math.max(220, measured));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const values = series.points.flatMap((point) =>
    point.value === null ? [] : [point.value],
  );
  const max = Math.max(1, ...values);
  const left = 30,
    right = width - 14,
    top = 27,
    bottom = 153;
  const x = (index: number) =>
    series.points.length === 1
      ? (left + right) / 2
      : left + (index / (series.points.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / max) * (bottom - top);
  let connected = false;
  let path = "";
  series.points.forEach((point, index) => {
    if (point.value === null) {
      connected = false;
      return;
    }
    path += `${connected ? "L" : "M"}${x(index)},${y(point.value)} `;
    connected = true;
  });
  const ticks = [
    ...new Set([
      0,
      Math.floor((series.points.length - 1) / 2),
      series.points.length - 1,
    ]),
  ].filter((index) => index >= 0);
  const missing = series.points.filter((point) => point.value === null);
  return (
    <div ref={container} className={styles.chart}>
      {values.length ? (
        <svg viewBox={`0 0 ${width} 205`} role="img" aria-labelledby={titleId}>
          <title id={titleId}>
            {series.label}.{" "}
            {series.points
              .map((point) => `${point.label}: ${point.value ?? "нет данных"}`)
              .join("; ")}
          </title>
          <text x={left} y="13">
            Количество, шт.
          </text>
          {[...new Set([0, Math.ceil(max / 2), max])].map((value) => (
            <g key={value}>
              <line x1={left} x2={right} y1={y(value)} y2={y(value)} />
              <text x="19" y={y(value) + 4} textAnchor="end">
                {value}
              </text>
            </g>
          ))}
          <path d={path.trim()} />
          {series.points.map(
            (point, index) =>
              point.value !== null && (
                <circle
                  key={point.id}
                  cx={x(index)}
                  cy={y(point.value)}
                  r="3.5"
                >
                  <title>
                    {point.label}: {point.value}
                  </title>
                </circle>
              ),
          )}
          {ticks.map((index) => (
            <text
              key={index}
              x={x(index)}
              y="181"
              textAnchor={
                index === 0
                  ? "start"
                  : index === series.points.length - 1
                    ? "end"
                    : "middle"
              }
            >
              {series.points[index]!.label.length < 22
                ? series.points[index]!.label
                : series.points[index]!.label.split(" ·")[0]}
            </text>
          ))}
        </svg>
      ) : (
        <p className={styles.empty}>Нет данных за выбранный период</p>
      )}
      {missing.length > 0 && (
        <p className={styles.small}>
          Нет данных: {missing.map((point) => point.label).join(", ")}. Пропуски
          показаны разрывами линии.
        </p>
      )}
      {series.points.length > 0 && (
        <details className={styles.values}>
          <summary>Таблица значений</summary>
          <table
            className={styles.table}
            aria-label={`${series.label} — значения`}
          >
            <thead>
              <tr>
                <th scope="col">Дата / период</th>
                <th scope="col" className={styles.number}>
                  Самоотчёты
                </th>
              </tr>
            </thead>
            <tbody>
              {series.points.map((point) => (
                <tr key={point.id}>
                  <th scope="row">{point.label}</th>
                  <td className={styles.number}>
                    {point.value ?? "Нет данных"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
