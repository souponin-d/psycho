import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExampleWorkbench } from "./ExampleWorkbench";

const fixture = {
  schemaVersion: 1,
  scenario: "normal",
  patients: [],
  department: { items: [], series: { label: "Серия", points: [] } },
};
const fixtures = {
  normal: fixture,
  empty: { ...fixture, scenario: "empty" },
  long: { ...fixture, scenario: "long" },
};

function Demo({ record }: { record: (name: string, value: string) => void }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <button
        onClick={() => {
          record("onSelect", `demo-${count + 1}`);
          setCount(count + 1);
        }}
      >
        Выбрать
      </button>
      <output aria-label="Выбрано">{count}</output>
    </>
  );
}

describe("стенд примеров", () => {
  it("сохраняет аргументы, ограничивает журнал и сбрасывает локальное состояние с набором", async () => {
    const user = userEvent.setup();
    render(
      <ExampleWorkbench
        fixtures={fixtures}
        examples={[
          {
            id: "list",
            label: "Список",
            render: ({ recordAction }) => <Demo record={recordAction} />,
          },
        ]}
      />,
    );
    for (let index = 0; index < 21; index++)
      await user.click(screen.getByRole("button", { name: "Выбрать" }));
    const log = () =>
      within(screen.getByRole("list", { name: "Журнал действий" }));
    expect(log().getAllByRole("listitem")).toHaveLength(20);
    expect(log().getAllByRole("listitem")[0]?.textContent).toContain("demo-2");
    expect(log().getAllByRole("listitem")[19]?.textContent).toContain(
      "demo-21",
    );
    await user.selectOptions(screen.getByLabelText("Набор данных"), "empty");
    expect(screen.getByLabelText("Выбрано").textContent).toBe("0");
    expect(log().queryAllByRole("listitem")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Выбрать" }));
    await user.click(screen.getByRole("button", { name: "Очистить" }));
    expect(log().queryAllByRole("listitem")).toHaveLength(0);
  });
  it("сбрасывает журнал при смене примера", async () => {
    const user = userEvent.setup();
    const renderExample = ({
      recordAction,
    }: {
      recordAction: (name: string, value: string) => void;
    }) => <Demo record={recordAction} />;
    render(
      <ExampleWorkbench
        fixtures={fixtures}
        examples={[
          { id: "one", label: "Первый", render: renderExample },
          { id: "two", label: "Второй", render: renderExample },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Выбрать" }));
    await user.selectOptions(screen.getByLabelText("Компонент"), "two");
    expect(screen.getByLabelText("Выбрано").textContent).toBe("0");
    expect(
      within(
        screen.getByRole("list", { name: "Журнал действий" }),
      ).queryAllByRole("listitem"),
    ).toHaveLength(0);
  });
  it("показывает путь ошибки данных вместо пустого компонента", () => {
    render(
      <ExampleWorkbench
        fixtures={{ ...fixtures, normal: { ...fixture, schemaVersion: 2 } }}
        examples={[
          { id: "one", label: "Первый", render: () => <p>Компонент данных</p> },
        ]}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /normal\.json.*schemaVersion/s,
    );
    expect(screen.queryByText("Компонент данных")).toBeNull();
  });
});
