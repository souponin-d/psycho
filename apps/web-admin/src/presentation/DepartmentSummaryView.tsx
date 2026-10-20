import { LineChart } from "@psycho/ui-web";
import type { DepartmentSummaryViewProps } from "@psycho/ui-web/contracts";

export function DepartmentSummaryView({
  items,
  series,
}: DepartmentSummaryViewProps) {
  return (
    <div className="stack">
      {items.length ? (
        <section
          className="demo-metrics"
          aria-label="Показатели отделения"
          style={{
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          }}
        >
          {items.map(({ id, label, value, caption }) => (
            <article key={id} className="demo-metric" aria-label={label}>
              <h2>{label}</h2>
              <p className="demo-metric-value" data-missing={value === null}>
                {value === null ? "Нет данных" : value}
              </p>
              {caption && <p className="demo-metric-caption">{caption}</p>}
            </article>
          ))}
        </section>
      ) : (
        <p className="notice" role="status">
          Показатели не переданы.
        </p>
      )}
      <section className="panel" aria-label="График показателей">
        <LineChart series={series} />
      </section>
    </div>
  );
}
