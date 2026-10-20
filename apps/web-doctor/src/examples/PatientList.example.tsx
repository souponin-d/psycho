import { useState } from "react";
import type { ExampleContext } from "@psycho/ui-web/examples";
import { PatientListView } from "../presentation/PatientListView";

export function PatientListExample({ fixture, recordAction }: ExampleContext) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="two-columns">
      <section className="stack" aria-label="Пример списка пациентов">
        <h2>Список пациентов</h2>
        <p className="muted">
          Передано строк: {fixture.patients.length}. Только вымышленные записи.
        </p>
        <PatientListView
          rows={fixture.patients}
          onSelect={(id) => {
            setSelectedId(id);
            recordAction("onSelect", id);
          }}
        />
      </section>
      <section className="stack" aria-label="Область выбранного пациента">
        <h2>Выбранный пациент</h2>
        <p className="notice" role="status">
          {selectedId ? (
            <>
              Идентификатор: <code>{selectedId}</code>
            </>
          ) : (
            "Пациент ещё не выбран."
          )}
        </p>
        <p className="muted">
          Выберите пациента в списке, чтобы увидеть его идентификатор здесь и
          вызов onSelect в журнале действий.
        </p>
      </section>
    </div>
  );
}
