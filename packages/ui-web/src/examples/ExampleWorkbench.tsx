import { useId, useState, type ReactNode } from "react";
import {
  presentationFixtureSchema,
  type PresentationFixture,
  type Scenario,
} from "../contracts/presentation";
import { Button } from "../primitives/Button";
import styles from "./examples.module.css";

export type ExampleContext = {
  fixture: PresentationFixture;
  recordAction: (name: string, value: string | boolean) => void;
};
export type ExampleDefinition = {
  id: string;
  label: string;
  render: (context: ExampleContext) => ReactNode;
};
export type FixtureSources = Record<Scenario, unknown>;
type Action = { sequence: number; name: string; value: string | boolean };
const scenarioLabels: Record<Scenario, string> = {
  normal: "Обычные",
  empty: "Пустые",
  long: "Длинные подписи",
};

function ExampleSession({
  example,
  fixture,
}: {
  example: ExampleDefinition;
  fixture: PresentationFixture;
}) {
  const [actions, setActions] = useState<Action[]>([]);
  const recordAction: ExampleContext["recordAction"] = (name, value) =>
    setActions((current) =>
      [
        ...current,
        { sequence: (current.at(-1)?.sequence ?? 0) + 1, name, value },
      ].slice(-20),
    );
  return (
    <div className={styles.stage}>
      <div className={styles.preview}>
        {example.render({ fixture, recordAction })}
      </div>
      <section className={styles.log} aria-label="Действия примера">
        <div className={styles.logHeading}>
          <h2>Действия</h2>
          <Button
            variant="secondary"
            onClick={() => setActions([])}
            disabled={!actions.length}
          >
            Очистить
          </Button>
        </div>
        <p className="muted">
          Последние 20 вызовов callbacks. Журнал хранится только в памяти
          страницы.
        </p>
        <ol className={styles.entries} aria-label="Журнал действий">
          {actions.map((action) => (
            <li key={action.sequence}>
              <code>
                {action.name}({JSON.stringify(action.value)})
              </code>
            </li>
          ))}
        </ol>
        {!actions.length && <p className="muted">Действий пока нет.</p>}
      </section>
    </div>
  );
}

export function ExampleWorkbench({
  fixtures,
  examples,
}: {
  fixtures: FixtureSources;
  examples: readonly ExampleDefinition[];
}) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [exampleId, setExampleId] = useState(examples[0]?.id ?? "");
  const inputId = useId();
  const example = examples.find((item) => item.id === exampleId);
  const result = presentationFixtureSchema.safeParse(fixtures[scenario]);
  const errors = !result.success
    ? result.error.issues
        .map((issue) => `${issue.path.join(".") || "корень"}: ${issue.message}`)
        .join("; ")
    : result.data.scenario !== scenario
      ? "scenario: значение не соответствует имени файла"
      : null;
  return (
    <div className="panel stack">
      <div className={styles.toolbar}>
        <label className={styles.selectField} htmlFor={`${inputId}-example`}>
          Компонент
          <select
            id={`${inputId}-example`}
            value={exampleId}
            onChange={(event) => setExampleId(event.currentTarget.value)}
          >
            {examples.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.selectField} htmlFor={`${inputId}-data`}>
          Набор данных
          <select
            id={`${inputId}-data`}
            value={scenario}
            onChange={(event) =>
              setScenario(event.currentTarget.value as Scenario)
            }
          >
            {(Object.keys(scenarioLabels) as Scenario[]).map((key) => (
              <option key={key} value={key}>
                {scenarioLabels[key]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {errors ? (
        <p role="alert" className="notice">
          Ошибка примера: {scenario}.json — {errors}
        </p>
      ) : result.success && example ? (
        <ExampleSession
          key={`${example.id}:${scenario}`}
          example={example}
          fixture={result.data}
        />
      ) : (
        <p role="status">Примеры ещё не зарегистрированы.</p>
      )}
    </div>
  );
}
