import { AppShell, LineChart } from "@psycho/ui-web";
import {
  ExampleWorkbench,
  fixtureSources,
  type ExampleDefinition,
} from "@psycho/ui-web/examples";
import { presentationFixtureSchema } from "@psycho/ui-web/contracts";
import { PatientListExample } from "../examples/PatientList.example";
import { InfoDialogExample } from "../examples/InfoDialog.example";
import { PrimitivesExample } from "../examples/Primitives.example";

const examples: ExampleDefinition[] = [
  {
    id: "patients",
    label: "Список пациентов · #5",
    render: (context) => <PatientListExample {...context} />,
  },
  {
    id: "primitives",
    label: "Поля и базовый диалог",
    render: (context) => <PrimitivesExample {...context} />,
  },
  {
    id: "info",
    label: "Информационный диалог · #7",
    render: (context) => <InfoDialogExample {...context} />,
  },
  {
    id: "chart",
    label: "График готовых данных",
    render: ({ fixture }) => <LineChart series={fixture.department.series} />,
  },
];

function PatientWorkspace() {
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
        <PatientListExample fixture={data.data} recordAction={() => {}} />
      </div>
      <p className="notice">
        Для проверки пустого списка, длинного текста и callbacks откройте{" "}
        <a href="#/examples">примеры компонентов</a>.
      </p>
    </div>
  );
}

export function App() {
  return (
    <AppShell
      title="Веб врача"
      defaultPath="/patients"
      sections={[
        {
          path: "/patients",
          title: "Пациенты",
          description:
            "Рабочая область списка и выбранного пациента. Подключения компонентов готовы.",
          content: <PatientWorkspace />,
        },
        {
          path: "/examples",
          title: "Примеры",
          description: "Изолированная проверка компонентов на готовых данных.",
          content: (
            <ExampleWorkbench fixtures={fixtureSources} examples={examples} />
          ),
        },
      ]}
    />
  );
}
