import type { ExampleContext } from "@psycho/ui-web/examples";
import { DepartmentSummaryView } from "../presentation/DepartmentSummaryView";

export function DepartmentSummaryExample({ fixture }: ExampleContext) {
  return (
    <div className="stack">
      <h2>Сводка отделения</h2>
      <p className="muted">
        Передано показателей: {fixture.department.items.length}. Значения и
        единицы задаёт источник данных.
      </p>
      <DepartmentSummaryView
        items={fixture.department.items}
        series={fixture.department.series}
      />
    </div>
  );
}
