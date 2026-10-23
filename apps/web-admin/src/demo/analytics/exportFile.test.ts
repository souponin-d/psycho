import { expect, it } from "vitest";
import { createClinicDataset } from "./fixtures";
import { defaultFilter } from "./aggregate";
import { createExportSnapshot } from "./exportSnapshot";
import { generateExportFile } from "./exportFile";

it("CSV имеет однозначные заголовки таблицы и метаданных", async () => {
  const snapshot = createExportSnapshot(
    createClinicDataset("normal"),
    defaultFilter(),
    ["team"],
  );
  const blob = await generateExportFile(
    snapshot,
    "csv",
    "team",
    new AbortController().signal,
  );
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  const headers = text.split("\r\n")[0]!.split(";");
  expect(new Set(headers).size).toBe(headers.length);
  expect(text).toContain('"Метаданные: Отделение"');
  expect(text.split("\r\n")).toHaveLength(13);
});
