import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { supervise } from "./dev-examples.mjs";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("совместный запуск серверов", () => {
  it("останавливает второй процесс после ошибки первого и сохраняет код ошибки", async () => {
    const directory = mkdtempSync(join(tmpdir(), "psycho-servers-"));
    directories.push(directory);
    const marker = join(directory, "pid.txt");
    const result = await supervise([
      {
        command: process.execPath,
        args: [
          "-e",
          `const fs=require('node:fs'); const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(marker)})){clearInterval(timer);process.exit(7)}},25)`,
        ],
      },
      {
        command: process.execPath,
        args: [
          "-e",
          `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000)`,
        ],
      },
    ]);
    expect(result).toBe(7);
    const pid = Number(readFileSync(marker, "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
  });
  it("возвращает ошибку запуска несуществующей команды", async () => {
    expect(
      await supervise([
        { command: "psycho-command-that-does-not-exist", args: [] },
      ]),
    ).toBe(1);
  });
});
