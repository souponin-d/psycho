import { Button } from "@psycho/ui-web";
import type { PatientListViewProps } from "@psycho/ui-web/contracts";

export function PatientListView({ rows, onSelect }: PatientListViewProps) {
  if (rows.length === 0) {
    return (
      <p className="notice" role="status">
        Список пациентов пуст.
      </p>
    );
  }

  return (
    <ul
      className="stack"
      role="list"
      aria-label="Пациенты"
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {rows.map(({ id, displayName, secondaryText }) => (
        <li key={id} className="panel stack" style={{ gap: "var(--space-2)" }}>
          <p>
            <strong>{displayName}</strong>
          </p>
          {secondaryText && <p className="muted">{secondaryText}</p>}
          <Button
            variant="secondary"
            aria-label={`Выбрать пациента: ${displayName}`}
            onClick={() => onSelect(id)}
            style={{ justifySelf: "start" }}
          >
            Выбрать
          </Button>
        </li>
      ))}
    </ul>
  );
}
