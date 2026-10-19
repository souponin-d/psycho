import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  presentationFixtureSchema,
  type PresentationFixture,
} from "../packages/ui-web/src/contracts/presentation.ts";

export function readFixture(path: string): PresentationFixture {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    throw new Error(`${path}: не удалось прочитать файл`);
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new Error(`${path}: неверный JSON`);
  }
  const result = presentationFixtureSchema.safeParse(data);
  if (!result.success)
    throw new Error(
      `${path}: ${result.error.issues.map((issue) => `${issue.path.join(".") || "корень"}: ${issue.message}`).join("; ")}`,
    );
  if (basename(path) !== `${result.data.scenario}.json`)
    throw new Error(`${path}: scenario должен соответствовать имени файла`);
  return result.data;
}

export function validateFixtures(directory: string): string[] {
  const errors: string[] = [];
  for (const scenario of ["normal", "empty", "long"]) {
    try {
      readFixture(join(directory, `${scenario}.json`));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const directory = fileURLToPath(
    new URL("../tests/fixtures/presentation/", import.meta.url),
  );
  const errors = validateFixtures(directory);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Проверены normal.json, empty.json и long.json: схема корректна.",
    );
}
