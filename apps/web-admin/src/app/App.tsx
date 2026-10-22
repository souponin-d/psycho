import { LineChart } from "@psycho/ui-web";
import {
  ExampleWorkbench,
  fixtureSources,
  type ExampleDefinition,
} from "@psycho/ui-web/examples";
import { AdminDemo } from "../demo/AdminDemo";
import { DepartmentSummaryExample } from "../examples/DepartmentSummary.example";

const examples: ExampleDefinition[] = [
  {
    id: "summary",
    label: "Сводка отделения · #6",
    render: (context) => <DepartmentSummaryExample {...context} />,
  },
  {
    id: "chart",
    label: "График готовых данных",
    render: ({ fixture }) => <LineChart series={fixture.department.series} />,
  },
];

export function App() {
  return (
    <AdminDemo
      examples={
        import.meta.env.DEV ? (
          <ExampleWorkbench fixtures={fixtureSources} examples={examples} />
        ) : undefined
      }
    />
  );
}
