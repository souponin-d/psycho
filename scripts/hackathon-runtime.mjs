import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID, pbkdf2Sync } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createConnection } from "node:net";
export const root = path.resolve(import.meta.dirname, "..");
export const folder = path.join(root, ".cache/hackathon-access");
export const dotnet =
  process.env.DOCTOR_DOTNET ??
  "D:/Projects/Psycho/.cache/toolchain/dotnet/dotnet.exe";
export const pgBin =
  process.env.DOCTOR_PG_BIN ??
  "D:/Projects/Psycho/.cache/toolchain/postgres/pgsql/bin";
export const assembly = path.join(
  root,
  "apps/doctor-api/bin/Debug/net10.0/Doctor.Api.dll",
);
fs.mkdirSync(folder, { recursive: true });
const cfgPath = path.join(folder, "local.json");
if (!fs.existsSync(cfgPath))
  fs.writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        dbPort: 55453,
        apiPort: 5096,
        databasePassword: randomBytes(24).toString("hex"),
        doctorPassword: randomBytes(20).toString("hex"),
        accessCode: randomBytes(8).toString("hex").toUpperCase(),
        doctorEmail: "doctor@example.test",
        doctorId: randomUUID(),
        patientUserId: randomUUID(),
        patientId: randomUUID(),
        clinicId: randomUUID(),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
export const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
function passwordHash(value) {
  const salt = randomBytes(24);
  return `600000:${salt.toString("base64")}:${pbkdf2Sync(value, salt, 600000, 32, "sha256").toString("base64")}`;
}
if (!config.patientPassword || !config.accessCodeHash) {
  config.patientPassword = randomBytes(24).toString("hex");
  config.accessCodeHash = passwordHash(config.accessCode);
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
export function run(file, args, env = {}) {
  const result = spawnSync(file, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    ...(path.basename(file) === "pg_ctl.exe" ? { stdio: "ignore" } : {}),
    windowsHide: true,
  });
  if (result.status !== 0)
    throw Error(
      path.basename(file) +
        " failed: " +
        (result.stderr || result.error?.message || "inspect local log"),
    );
  return result.stdout ?? "";
}
export function setupDatabase() {
  const pg = (n) => path.join(pgBin, n + ".exe"),
    data = path.join(folder, "pg");
  const env = { PGPASSWORD: config.databasePassword };
  if (!fs.existsSync(path.join(data, "PG_VERSION"))) {
    const pw = path.join(folder, "init-password.txt");
    fs.writeFileSync(pw, config.databasePassword, { mode: 0o600 });
    try {
      run(
        pg("initdb"),
        [
          "-D",
          data,
          "-U",
          "hackathon_dev",
          "--pwfile=" + pw,
          "--auth=scram-sha-256",
          "--encoding=UTF8",
          "--locale=C",
        ],
        env,
      );
    } finally {
      fs.unlinkSync(pw);
    }
  }
  if (
    spawnSync(pg("pg_ctl"), ["-D", data, "status"], {
      stdio: "ignore",
      windowsHide: true,
    }).status !== 0
  )
    run(
      pg("pg_ctl"),
      [
        "-D",
        data,
        "-l",
        path.join(folder, "postgres.log"),
        "-o",
        `-h 127.0.0.1 -p ${config.dbPort}`,
        "start",
      ],
      env,
    );
  if (
    run(
      pg("psql"),
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(config.dbPort),
        "-U",
        "hackathon_dev",
        "-d",
        "postgres",
        "-Atc",
        "SELECT 1 FROM pg_database WHERE datname='syncli_hackathon'",
      ],
      env,
    ).trim() !== "1"
  )
    run(
      pg("createdb"),
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(config.dbPort),
        "-U",
        "hackathon_dev",
        "syncli_hackathon",
      ],
      env,
    );
}
export function sql(text) {
  return run(
    path.join(pgBin, "psql.exe"),
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(config.dbPort),
      "-U",
      "hackathon_dev",
      "-d",
      "syncli_hackathon",
      "-Atc",
      text,
    ],
    { PGPASSWORD: config.databasePassword },
  ).trim();
}
export const environment = (extra = {}) => ({
  ...process.env,
  ConnectionStrings__Doctor: `Host=127.0.0.1;Port=${config.dbPort};Database=syncli_hackathon;Username=hackathon_dev;Password=${config.databasePassword};Include Error Detail=false`,
  ASPNETCORE_ENVIRONMENT: "Development",
  ASPNETCORE_URLS: `http://127.0.0.1:${config.apiPort}`,
  AllowedHosts: "localhost;127.0.0.1;10.0.2.2",
  Doctor__KeyDirectory: path.join(folder, "keys"),
  Hackathon__Enabled: "true",
  Hackathon__PatientUserId: config.patientUserId,
  Hackathon__CodeHash: config.accessCodeHash,
  Hackathon__ExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  ...extra,
});
export function provision(id, specialty, email, password, patientId) {
  run(dotnet, [assembly, "--provision"], {
    ...environment(),
    Provision__Id: id,
    Provision__ClinicId: config.clinicId,
    Provision__Name:
      specialty === "patient"
        ? "Синтетический пациент хакатона"
        : "Врач хакатона",
    Provision__Email: email,
    Provision__Password: password,
    Provision__Specialty: specialty,
    ...(patientId ? { Provision__PatientId: patientId } : {}),
  });
}
export async function start(extra = {}) {
  const occupied = await new Promise((resolve, reject) => {
    const socket = createConnection({
      host: "127.0.0.1",
      port: config.apiPort,
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error) =>
      error.code === "ECONNREFUSED" ? resolve(false) : reject(error),
    );
  });
  if (occupied)
    throw Error(
      "Fixture API port is already occupied; stop the task-owned API before testing",
    );
  const log = fs.openSync(path.join(folder, "api.log"), "a");
  const child = spawn(dotnet, [assembly], {
    cwd: path.dirname(assembly),
    env: environment(extra),
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  fs.closeSync(log);
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null)
      throw Error("API exited; inspect .cache/hackathon-access/api.log");
    try {
      if ((await fetch(`http://127.0.0.1:${config.apiPort}/api/health`)).ok)
        return child;
    } catch {}
    await delay(200);
  }
  child.kill();
  throw Error("API startup timed out");
}
export async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
}
export function client() {
  let token = "";
  const cookies = new Map();
  return {
    async call(route, method = "GET", body, csrf = true) {
      const response = await fetch(
        `http://127.0.0.1:${config.apiPort}/api` + route,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "),
            ...(csrf && token ? { "X-CSRF-TOKEN": token } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0],
          i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      if (data?.token) token = data.token;
      if (data?.csrfToken) token = data.csrfToken;
      return { status: response.status, body: data, headers: response.headers };
    },
    async login() {
      await this.call("/csrf");
      const r = await this.call("/login", "POST", {
        email: config.doctorEmail,
        password: config.doctorPassword,
      });
      if (r.status !== 200) throw Error("Fixture login failed");
      return this.call("/session");
    },
  };
}
export async function seed() {
  setupDatabase();
  if (
    sql(`SELECT to_regclass('public.clinic_users') IS NOT NULL`) !== "t" ||
    sql(`SELECT count(*) FROM clinic_users WHERE id='${config.doctorId}'`) ===
      "0"
  )
    provision(
      config.doctorId,
      "psychiatrist",
      config.doctorEmail,
      config.doctorPassword,
    );
  const child = await start();
  try {
    const doctor = client();
    await doctor.login();
    const found = (await doctor.call("/patients")).body;
    if (!found.some((p) => p.id === config.patientId)) {
      const r = await doctor.call("/patients", "POST", {
        id: config.patientId,
        profile: {
          name: "Синтетический пациент хакатона",
          birthDate: "1995-01-01",
        },
      });
      if (r.status !== 201) throw Error("Fixture creation failed");
    }
    if (
      sql(
        `SELECT count(*) FROM clinic_users WHERE id='${config.patientUserId}'`,
      ) === "0"
    )
      provision(
        config.patientUserId,
        "patient",
        config.patientUserId + "@example.test",
        config.patientPassword,
        config.patientId,
      );
    // Upgrade only this isolated synthetic fixture; the code is never an account password.
    sql(
      `UPDATE clinic_users SET password_hash='${passwordHash(config.patientPassword)}' WHERE id='${config.patientUserId}'`,
    );
    let record = (await doctor.call("/patients")).body.find(
      (p) => p.id === config.patientId,
    );
    if (
      !record.consents.some(
        (c) => c.purpose === "communication" && c.status === "documented",
      )
    )
      await doctor.call(`/patients/${config.patientId}/commands`, "POST", {
        commandId: randomUUID(),
        expectedRevision: record.revision,
        mutation: {
          type: "consent.add",
          value: {
            id: randomUUID(),
            createdAt: "",
            author: "",
            purpose: "communication",
            status: "documented",
            signedOn: new Date().toISOString().slice(0, 10),
            documentReference: "Синтетический пример хакатона",
            person: "Синтетический пациент",
            scope: "Тестовое сообщение и ответ",
            informing: "Только синтетические данные",
          },
        },
      });
  } finally {
    await stop(child);
  }
}
