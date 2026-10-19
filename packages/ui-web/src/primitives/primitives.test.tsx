import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { TextField } from "./TextField";
import { DialogRoot, DialogTrigger, DialogPanel } from "./Dialog";
import { LineChart } from "./LineChart";

describe("поле", () => {
  it("связывает подпись, подсказку и ошибку с контролируемым значением", async () => {
    const user = userEvent.setup();
    function Field() {
      const [value, setValue] = useState("");
      return (
        <TextField
          label="Название"
          hint="Учебный ввод"
          error="Пример ошибки"
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Field />);
    const input = screen.getByRole("textbox", {
      name: "Название",
    }) as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    for (const id of input.getAttribute("aria-describedby")!.split(" "))
      expect(document.getElementById(id)?.textContent).toMatch(
        /Учебный ввод|Пример ошибки/,
      );
    await user.type(input, "Тест");
    expect(input.value).toBe("Тест");
  });
  it("не изменяет disabled-поле", async () => {
    const user = userEvent.setup();
    let value = "Начало";
    render(
      <TextField
        label="Недоступное"
        value={value}
        disabled
        onChange={(next) => {
          value = next;
        }}
      />,
    );
    await user.type(screen.getByLabelText("Недоступное"), "Другое");
    expect(value).toBe("Начало");
  });
});

describe("информационный примитив диалога", () => {
  function Controlled() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <output aria-label="Состояние">{String(open)}</output>
        <DialogRoot open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Открыть пример</Button>
          </DialogTrigger>
          <DialogPanel title="Условия примера">
            <p>Содержимое</p>
          </DialogPanel>
        </DialogRoot>
      </>
    );
  }
  it("изменяет controlled open, закрывается Escape и возвращает фокус", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const trigger = screen.getByRole("button", { name: "Открыть пример" });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Условия примера" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Состояние").textContent).toBe("true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Состояние").textContent).toBe("false");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("график готовой серии", () => {
  it("различает ноль, пропуск и разрыв линии", () => {
    const { container } = render(
      <LineChart
        series={{
          label: "Пример серии",
          points: [
            { id: "demo-a", label: "А", value: 0 },
            { id: "demo-b", label: "Б", value: null },
            { id: "demo-c", label: "В", value: -2 },
          ],
        }}
      />,
    );
    const rows = within(
      screen.getByRole("table", { name: "Пример серии — значения" }),
    ).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "ПодписьЗначение",
      "А0",
      "БНет данных",
      "В-2",
    ]);
    const path = container.querySelector("path")?.getAttribute("d");
    expect(path?.match(/M/g)).toHaveLength(2);
    expect(container.querySelector("svg")?.innerHTML).not.toMatch(
      /NaN|Infinity/,
    );
  });
  it.each([{ values: [0] }, { values: [-3, -3] }, { values: [null, null] }])(
    "поддерживает одиночную и постоянную серию $values",
    ({ values }) => {
      const { container } = render(
        <LineChart
          series={{
            label: "Проверка",
            points: values.map((value, index) => ({
              id: `demo-${index}`,
              label: String(index),
              value,
            })),
          }}
        />,
      );
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
      expect(container.querySelectorAll("circle")).toHaveLength(
        values.filter((value) => value !== null).length,
      );
      for (const circle of container.querySelectorAll("circle")) {
        expect(Number(circle.getAttribute("cy"))).toBeGreaterThanOrEqual(0);
        expect(Number(circle.getAttribute("cy"))).toBeLessThanOrEqual(160);
      }
    },
  );
  it("показывает пустое состояние вместо пустой диаграммы", () => {
    render(<LineChart series={{ label: "Пусто", points: [] }} />);
    expect(screen.getByRole("status").textContent).toContain("Нет данных");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
