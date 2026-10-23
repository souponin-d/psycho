import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const cache = path.join(root, ".cache", "doctor-server");
export const apiAssembly = path.join(
  root,
  "apps",
  "doctor-api",
  "bin",
  "Debug",
  "net10.0",
  "Doctor.Api.dll",
);
export const apiDirectory = path.dirname(apiAssembly);
const executable = process.platform === "win32" ? "dotnet.exe" : "dotnet";
const portable = path.join(root, ".cache", "toolchain", "dotnet", executable);
export const dotnet =
  process.env.DOCTOR_DOTNET ?? (fs.existsSync(portable) ? portable : "dotnet");
export const pgBin =
  process.env.DOCTOR_PG_BIN ??
  path.join(root, ".cache", "toolchain", "postgres", "pgsql", "bin");
export const pg = (name) =>
  path.join(pgBin, name + (process.platform === "win32" ? ".exe" : ""));
export function config() {
  const file =
    process.env.DOCTOR_LOCAL_CONFIG ?? path.join(cache, "local-config.json");
  if (!fs.existsSync(file))
    throw new Error(
      "Нет локальной конфигурации. Выполните npm run setup:doctor:local либо задайте ConnectionStrings__Doctor.",
    );
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function environment() {
  const env = {
    ...process.env,
    DOTNET_CLI_HOME: path.join(root, ".cache", "dotnet-home"),
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
  };
  if (!env.ConnectionStrings__Doctor) {
    const cfg = config();
    env.ConnectionStrings__Doctor = `Host=127.0.0.1;Port=${cfg.port};Database=doctor_workspace;Username=doctor_dev;Password=${cfg.databasePassword};Include Error Detail=false`;
    env.ASPNETCORE_ENVIRONMENT = "Development";
    env.ASPNETCORE_URLS = "http://127.0.0.1:5080";
    env.Doctor__KeyDirectory = path.join(cache, "keys");
    env.Doctor__FormDirectory ??= path.join(cache, "clinical-forms");
  }
  return env;
}
export function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${path.basename(file)} завершился с кодом ${result.status}`,
    );
  return result;
}
