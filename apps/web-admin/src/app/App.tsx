import { AppShell, LineChart } from "@psycho/ui-web";
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
    <AppShell
      title="Административный веб"
      defaultPath="/summary"
      sections={[
        {
          path: "/summary",
          title: "Сводка",
          description:
            "Ритм отделения, работа команды и события — в одном пространстве.",
          content: <AdminDemo />,
        },
        {
          path: "/examples",
          title: "Примеры",
          description: "Проверка отображения готовых показателей и серий.",
          content: (
            <ExampleWorkbench fixtures={fixtureSources} examples={examples} />
          ),
        },
      ]}
    />
  );
}
