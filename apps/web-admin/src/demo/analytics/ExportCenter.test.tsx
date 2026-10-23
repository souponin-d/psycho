import { beforeEach, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportCenter } from "./ExportCenter";
import { createClinicDataset } from "./fixtures";
import { analyseClinic, defaultFilter } from "./aggregate";
const generate = vi.hoisted(() => vi.fn());
vi.mock("./exportFile", () => ({ generateExportFile: generate }));
beforeEach(() => {
  generate.mockReset();
});
const data = createClinicDataset("normal");
it("сохраняет исходный снимок в истории при смене фильтров и поддерживает повтор после ошибки", async () => {
  const user = userEvent.setup();
  generate
    .mockRejectedValueOnce(new Error("Сбой записи"))
    .mockResolvedValueOnce(new Blob(["file"]));
  const view = render(
    <ExportCenter data={data} result={analyseClinic(data, defaultFilter())} />,
  );
  await user.click(screen.getByRole("button", { name: "Сформировать XLSX" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Сбой записи"),
  );
  await user.click(
    screen.getByRole("button", { name: "Повторить формирование" }),
  );
  expect(await screen.findByText("Файл готов")).toBeTruthy();
  view.rerender(
    <ExportCenter
      data={data}
      result={analyseClinic(data, {
        ...defaultFilter(),
        departmentId: "demo-dept-2",
      })}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Готовые файлы" }).textContent,
  ).toContain("Все отделения");
  expect(generate.mock.calls[1]![0].summary.reports).toBe(621);
});
it("отмена не добавляет поздний результат в историю", async () => {
  const user = userEvent.setup();
  let finish: (value: Blob) => void = () => {};
  generate.mockImplementation(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <ExportCenter data={data} result={analyseClinic(data, defaultFilter())} />,
  );
  await user.click(screen.getByRole("button", { name: "Сформировать XLSX" }));
  await user.click(
    screen.getByRole("button", { name: "Отменить формирование" }),
  );
  finish(new Blob(["late"]));
  expect(screen.queryByText("Файл готов")).toBeNull();
});
