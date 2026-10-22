import { useState, type ReactNode } from "react";
import { Button, styles } from "./ui/Elements";

// The draft follows unrelated record revisions, but a change to its own target
// requires a deliberate reconciliation. The server still checks the revision.
export function useDraftGuard<T>(current: T, revision: number) {
  const serialized = fingerprint(current);
  const [base, setBase] = useState(() => ({ serialized, revision }));
  return {
    conflict: serialized !== base.serialized,
    expectedRevision: serialized === base.serialized ? revision : base.revision,
    acceptCurrent: () => setBase({ serialized, revision }),
  };
}

function fingerprint(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    ) ?? "undefined"
  );
}

export function DraftConflict({
  guard,
  onReload,
  children,
  allowKeep = true,
}: {
  guard: ReturnType<typeof useDraftGuard>;
  onReload: () => void;
  children?: ReactNode;
  allowKeep?: boolean;
}) {
  if (!guard.conflict) return null;
  return (
    <section className={styles.notice} aria-label="Сравнение изменений">
      <p role="alert">
        <strong>Запись изменилась в другом окне.</strong> Ваш текст сохранён в
        форме. Сравните его с актуальными данными перед сохранением.
      </p>
      {children}
      <div className={styles.row} style={{ marginTop: 12 }}>
        <Button
          variant="secondary"
          onClick={() => {
            onReload();
            guard.acceptCurrent();
          }}
        >
          Загрузить актуальные данные
        </Button>
        {allowKeep && (
          <Button variant="secondary" onClick={guard.acceptCurrent}>
            Использовать мои изменения
          </Button>
        )}
      </div>
    </section>
  );
}

export function CurrentDraftValues({
  current,
  draft,
  labels,
}: {
  current: object | undefined;
  draft: object;
  labels: Record<string, string>;
}) {
  if (!current)
    return <p>Запись больше не доступна. Закройте форму и обновите карту.</p>;
  const saved = current as Record<string, unknown>;
  const local = draft as Record<string, unknown>;
  return (
    <dl className={styles.smallStack}>
      {Object.entries(labels)
        .filter(([key]) => fingerprint(saved[key]) !== fingerprint(local[key]))
        .map(([key, label]) => (
          <div key={key}>
            <dt>
              <strong>{label} — в карте</strong>
            </dt>
            <dd
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {display(saved[key])}
            </dd>
            <dt>{label} — в вашей форме</dt>
            <dd
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {display(local[key])}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === "")
    return "Не заполнено";
  if (Array.isArray(value)) return value.map(display).join("; ") || "Нет";
  return String(value);
}
