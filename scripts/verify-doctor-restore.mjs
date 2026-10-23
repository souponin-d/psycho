import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { config, cache, pg, run } from "./doctor-runtime.mjs";

// Dedicated local development database only. Restore is always to a new database.
const cfg = config();
const env = { ...process.env, PGPASSWORD: cfg.databasePassword };
const connection = [
  "-h",
  "127.0.0.1",
  "-p",
  String(cfg.port),
  "-U",
  "doctor_dev",
];
const tables = [
  "clinic_users",
  "patient_records",
  "care_relationships",
  "record_versions",
  "command_receipts",
  "creation_receipts",
  "schema_migrations",
];
const fingerprint = (db) =>
  tables.map((table) =>
    execFileSync(
      pg("psql"),
      [
        ...connection,
        "-d",
        db,
        "-Atc",
        `SELECT count(*)::text||':'||coalesce(md5(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text)),'empty') FROM ${table} t`,
      ],
      { env, encoding: "utf8" },
    ).trim(),
  );
const before = fingerprint("doctor_workspace");
const stamp = Date.now();
const database = `doctor_restore_verify_${stamp}`;
const backup = path.join(cache, `backup-${stamp}.dump`);
run(
  pg("pg_dump"),
  [...connection, "-d", "doctor_workspace", "-Fc", "-f", backup],
  { env },
);
run(pg("createdb"), [...connection, database], { env });
run(
  pg("pg_restore"),
  [
    ...connection,
    "-d",
    database,
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    backup,
  ],
  { env },
);
assert.deepEqual(
  fingerprint("doctor_workspace"),
  before,
  "Исходная БД менялась во время проверки. Повторите в окне без записи.",
);
assert.deepEqual(
  fingerprint(database),
  before,
  "Восстановленная БД отличается от исходной.",
);
const result = {
  when: new Date().toISOString(),
  database,
  backup,
  tables: tables.length,
  verified: true,
};
fs.writeFileSync(
  path.join(cache, "restore-result.json"),
  JSON.stringify(result, null, 2),
);
console.log(
  `PASS: ${tables.length} таблиц восстановлены и совпадают по количеству и содержимому. Проверочная БД: ${database}. Исходная БД не изменена.`,
);
