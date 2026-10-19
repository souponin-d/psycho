import { AppShell, LineChart } from "@psycho/ui-web";
import {
  ExampleWorkbench,
  fixtureSources,
  type ExampleDefinition,
} from "@psycho/ui-web/examples";
import { presentationFixtureSchema } from "@psycho/ui-web/contracts";
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

function SummaryWorkspace() {
  const data = presentationFixtureSchema.safeParse(fixtureSources.normal);
  if (!data.success)
    return (
      <p role="alert">
        Ошибка normal.json:{" "}
        {data.error.issues.map((issue) => issue.path.join(".")).join(", ")}
      </p>
    );
  return (
    <div className="stack">
      <div className="panel">
        <DepartmentSummaryExample fixture={data.data} recordAction={() => {}} />
      </div>
      <p className="notice">
        Примитив графика и варианты данных доступны в разделе{" "}
        <a href="#/examples">«Примеры»</a>. Отчёт отделения будет подключён в
        следующем этапе.
      </p>
    </div>
  );
}

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
            "Подготовленная область показателей отделения и графика.",
          content: <SummaryWorkspace />,
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
