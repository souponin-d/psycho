import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  root,
  cache,
  pg,
  config,
  dotnet,
  apiAssembly,
  apiDirectory,
  environment,
  run,
} from "./doctor-runtime.mjs";

// Creates a separate loopback-only synthetic development cluster. Never resets it.
if (!fs.existsSync(pg("initdb")))
  throw new Error(
    "Установите PostgreSQL 17+ и задайте DOCTOR_PG_BIN. См. docs/doctor-workspace-runbook.md.",
  );
fs.mkdirSync(cache, { recursive: true });
const configuration = path.join(cache, "local-config.json");
if (!fs.existsSync(configuration))
  fs.writeFileSync(
    configuration,
    JSON.stringify(
      {
        port: 55442,
        databasePassword: randomBytes(24).toString("hex"),
        doctorPassword: randomBytes(16).toString("hex"),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
const cfg = config();
const data = path.join(cache, "data");
const pgEnv = { ...process.env, PGPASSWORD: cfg.databasePassword };
if (!fs.existsSync(path.join(data, "PG_VERSION"))) {
  const passwordFile = path.join(cache, "init-password.txt");
  fs.writeFileSync(passwordFile, cfg.databasePassword, { mode: 0o600 });
  try {
    run(pg("initdb"), [
      "-D",
      data,
      "-U",
      "doctor_dev",
      `--pwfile=${passwordFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    fs.unlinkSync(passwordFile);
  }
}
if (
  spawnSync(pg("pg_ctl"), ["-D", data, "status"], { stdio: "ignore" })
    .status !== 0
)
  run(pg("pg_ctl"), [
    "-D",
    data,
    "-l",
    path.join(cache, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${cfg.port}`,
    "start",
  ]);
const connection = [
  "-h",
  "127.0.0.1",
  "-p",
  String(cfg.port),
  "-U",
  "doctor_dev",
];
const exists = spawnSync(
  pg("psql"),
  [
    ...connection,
    "-d",
    "postgres",
    "-Atc",
    "SELECT 1 FROM pg_database WHERE datname='doctor_workspace'",
  ],
  { env: pgEnv, encoding: "utf8" },
);
if (exists.status !== 0) throw new Error("Не удалось проверить локальную БД.");
if (exists.stdout.trim() !== "1")
  run(pg("createdb"), [...connection, "doctor_workspace"], { env: pgEnv });
run(dotnet, ["build", "apps/doctor-api", "--nologo"], { env: environment() });
const users = spawnSync(
  pg("psql"),
  [
    ...connection,
    "-d",
    "doctor_workspace",
    "-Atc",
    "SELECT 1 FROM clinic_users WHERE id='doctor-local'",
  ],
  { env: pgEnv, encoding: "utf8" },
);
if (users.stdout.trim() !== "1")
  run(dotnet, [apiAssembly, "--provision"], {
    cwd: apiDirectory,
    env: {
      ...environment(),
      Provision__Id: "doctor-local",
      Provision__ClinicId: "clinic-local",
      Provision__Name: "Анна Лебедева",
      Provision__Specialty: "psychiatrist",
      Provision__Email: "doctor@example.test",
      Provision__Password: cfg.doctorPassword,
    },
  });
console.log(
  `Локальная БД готова. Вход: doctor@example.test. Пароль находится только в ${path.relative(root, configuration)} (doctorPassword).`,
);
