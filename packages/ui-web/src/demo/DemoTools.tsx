import type { Scenario, SummaryItem } from "../contracts/presentation";

export function DemoDataPicker({
  value,
  onChange,
}: {
  value: Scenario;
  onChange: (value: Scenario) => void;
}) {
  return (
    <label className="demo-picker">
      Набор демо-данных
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as Scenario)}
      >
        <option value="normal">Рабочий день</option>
        <option value="empty">Пустой набор</option>
        <option value="long">Длинные подписи</option>
      </select>
    </label>
  );
}

export function DemoMetrics({
  items,
  label,
}: {
  items: readonly SummaryItem[];
  label: string;
}) {
  return (
    <section
      className="demo-metrics"
      aria-label={label}
      data-count={items.length}
    >
      {items.map((item) => (
        <article key={item.id} className="demo-metric" aria-label={item.label}>
          <h2>{item.label}</h2>
          <p className="demo-metric-value" data-missing={item.value === null}>
            {item.value === null ? "Нет данных" : item.value}
          </p>
          {item.caption && (
            <p className="demo-metric-caption">{item.caption}</p>
          )}
        </article>
      ))}
    </section>
  );
}
