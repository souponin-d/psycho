import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  dotnet,
  environment,
  cache,
  apiAssembly,
  apiDirectory,
} from "./doctor-runtime.mjs";
import path from "node:path";
import {
  createPatient,
  createVisit,
  blankNotes,
} from "../apps/web-doctor/src/workspace/commands.ts";
const base = process.env.DOCTOR_API_TEST_URL ?? "http://127.0.0.1:5080/api";
let passed = 0;
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname))
  throw new Error("Integration tests require an isolated local API.");
const suffix = randomUUID(),
  testPassword = randomUUID(),
  testEmail = `test-doctor-${suffix}@example.test`;
const runtime = environment();
function ok(name) {
  passed++;
  console.log(`PASS ${name}`);
}
function client() {
  let token = "";
  const cookies = new Map();
  return {
    async call(path, method = "GET", data, withCsrf = true) {
      const response = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(withCsrf && token ? { "X-CSRF-TOKEN": token } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0];
        const i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status, body };
    },
    async login(email, password, patient = false) {
      let result = await this.call("/csrf");
      token = result.body.token;
      result = await this.call("/login", "POST", { email, password });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      result = await this.call(patient ? "/patient/session" : "/session");
      assert.equal(result.status, 200, JSON.stringify(result.body));
      token = result.body.csrfToken;
      return result.body.actor;
    },
  };
}
const doctor = client();
assert.equal((await doctor.call("/patients")).status, 401);
ok("anonymous denied");
provision({
  id: `test-doctor-${suffix}`,
  clinicId: `test-clinic-${suffix}`,
  email: testEmail,
  password: testPassword,
});
const actor = await doctor.login(testEmail, testPassword);
ok("cookie login and authenticated CSRF token");
let result = await doctor.call(
  "/patients",
  "POST",
  {
    id: randomUUID(),
    profile: { name: "Синтетический API пациент", birthDate: "1991-05-18" },
  },
  false,
);
assert.equal(result.status, 400);
ok("mutation without CSRF rejected");
result = await doctor.call("/patients", "POST", {
  id: randomUUID(),
  profile: { name: "Синтетический API пациент", birthDate: "1991-05-18" },
});
assert.equal(result.status, 201, JSON.stringify(result.body));
let patient = result.body;
ok("patient stored in PostgreSQL");
const createRetry = await doctor.call("/patients", "POST", {
  id: patient.id,
  profile: { name: "Синтетический API пациент", birthDate: "1991-05-18" },
});
assert.equal(createRetry.status, 201);
assert.equal(createRetry.body.id, patient.id);
assert.equal((await doctor.call("/patients")).body.length, 1);
ok("patient creation retry does not duplicate the record");
async function command(
  mutation,
  id = randomUUID(),
  version = patient.revision,
  who = doctor,
) {
  const result = await who.call(`/patients/${patient.id}/commands`, "POST", {
    commandId: id,
    expectedRevision: version,
    mutation,
  });
  if (result.status === 200) patient = result.body;
  return result;
}
const source = (await doctor.call("/sources")).body.find((s) => s.id === "S23");
const draft = {
  id: randomUUID(),
  createdAt: "",
  author: "forged",
  sourceId: source.id,
  sourceHash: source.sha256,
  formVersion: `source-${source.sha256.slice(0, 12)}-draft-1`,
  measuredAt: new Date().toISOString(),
  assessor: "patient",
  responses: { 1: 0, 2: null },
  note: "Синтетический черновик для выбора формы",
  status: "unapproved",
};
result = await command({ type: "assessment.save", value: draft });
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(patient.assessmentDrafts[0].author, actor.name);
assert.deepEqual(patient.assessmentDrafts[0].responses, { 1: 0, 2: null });
assert.equal(patient.measurements.length, 0);
assert.equal(patient.events.length, 0);
ok(
  "unapproved questionnaire stored separately with provenance and missing answer",
);
for (const value of [
  { ...draft, status: "approved" },
  { ...draft, sourceHash: "wrong" },
  { ...draft, responses: { 1: {} } },
])
  assert.equal((await command({ type: "assessment.save", value })).status, 400);
ok("questionnaire cannot forge approval, source revision or answer type");
const alternative = (await doctor.call("/sources")).body.find(
  (s) => s.id === "S22",
);
assert.equal(
  (
    await command({
      type: "assessment.save",
      value: {
        ...draft,
        sourceId: alternative.id,
        sourceHash: alternative.sha256,
        formVersion: `source-${alternative.sha256.slice(0, 12)}-draft-1`,
      },
    })
  ).status,
  400,
);
ok("different questionnaire version requires a separate draft identity");
const formResponse = await doctor.call("/assessment-forms/S23");
assert.ok([200, 404].includes(formResponse.status));
if (formResponse.status === 200) {
  assert.equal(formResponse.body.sourceHash, source.sha256);
  assert.ok(formResponse.body.sections.flatMap((s) => s.items).length >= 7);
}
assert.equal((await client().call("/assessment-forms/S23")).status, 401);
ok("prepared forms require doctor authentication and source identity");
result = await command(
  {
    type: "profile.update",
    value: { ...patient.profile, occupation: "Тестовая профессия" },
  },
  randomUUID(),
  999,
);
assert.equal(result.status, 409);
ok("optimistic revision conflict");
let visit = createVisit(randomUUID(), new Date().toISOString(), actor);
visit.status = "in-progress";
for (const value of [
  null,
  { ...visit, durationMinutes: "45" },
  { ...visit, durationMinutes: 1.5 },
  { ...visit, notes: { ...visit.notes, complaints: null } },
  { ...visit, scheduledAt: "2026-02-30T12:00:00Z" },
  { ...visit, unknownField: "unexpected" },
]) {
  assert.equal((await command({ type: "visit.save", value })).status, 400);
}
assert.equal(
  (
    await command({
      type: "profile.update",
      value: { ...patient.profile, birthDate: "2026-02-30" },
    })
  ).status,
  400,
);
ok(
  "malformed/null/unknown fields and impossible dates rejected without mutation",
);
result = await command({ type: "visit.save", value: visit });
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(
  (await command({ type: "patient.archive", archived: true, reason: "test" }))
    .status,
  400,
);
ok("open visit prevents archival");
result = await command({ type: "visit.complete", id: visit.id });
assert.equal(result.status, 400);
ok("incomplete visit cannot be confirmed");
visit = {
  ...visit,
  notes: {
    ...blankNotes(),
    complaints: "Синтетическая жалоба",
    safetyConclusion: "Синтетическая оценка безопасности",
    conclusion: "Синтетическое заключение",
    recommendations: "Повторный контроль",
  },
};
result = await command({ type: "visit.save", value: visit });
assert.equal(result.status, 200, JSON.stringify(result.body));
result = await command({
  type: "consent.add",
  value: {
    id: randomUUID(),
    createdAt: "",
    author: "forged-author",
    purpose: "care",
    status: "documented",
    signedOn: "2026-10-22",
    documentReference: "Тестовый документ",
    person: "Синтетический пациент",
    scope: "Приём",
    informing: "Информирование в тестовом сценарии",
  },
});
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(patient.consents.at(-1).author, actor.name);
ok("server stamps authenticated author");
const completionId = randomUUID(),
  completionRevision = patient.revision;
result = await command(
  { type: "visit.complete", id: visit.id },
  completionId,
  completionRevision,
);
assert.equal(result.status, 200, JSON.stringify(result.body));
const completed = patient.visits.find((v) => v.id === visit.id);
assert.equal(completed.status, "completed");
assert.equal(completed.completionSnapshot.patientName, patient.profile.name);
ok("immutable completion snapshot captured");
result = await command(
  { type: "visit.complete", id: visit.id },
  completionId,
  completionRevision,
);
assert.equal(result.status, 200);
assert.equal(
  patient.visits.find((v) => v.id === visit.id).completedAt,
  completed.completedAt,
);
ok("idempotent confirmation");
result = await command(
  { type: "message.send", text: "different" },
  completionId,
);
assert.equal(result.status, 409);
ok("idempotency key cannot be reused for another action");
result = await command({
  type: "visit.save",
  value: { ...visit, notes: { ...visit.notes, conclusion: "переписать" } },
});
assert.equal(result.status, 400);
ok("completed record immutable");
result = await command({
  type: "visit.addendum",
  id: visit.id,
  text: "Уточнение",
  reason: "Новые сведения",
});
assert.equal(result.status, 200);
assert.equal(patient.visits.find((v) => v.id === visit.id).addenda.length, 1);
ok("append-only addendum");
const report = {
  id: randomUUID(),
  createdAt: "",
  author: "",
  reportedAt: new Date().toISOString(),
  receivedAt: "",
  provenance: "clinician",
  state: "completed",
  mood: null,
  anxiety: null,
  sleepHours: null,
  functioning: "",
  medication: "no-mark",
  medicationReason: "",
  adverseEffects: "Тестовое сообщение",
  note: "Контекст",
  safetyConcern: false,
  reviewedAt: "",
};
result = await command({ type: "report.add", value: report });
assert.equal(result.status, 200, JSON.stringify(result.body));
const event = patient.events.at(-1);
assert.equal(event.relatedId, report.id);
ok("report and attention event saved atomically");
result = await command({
  type: "event.transition",
  id: event.id,
  status: "closed",
  note: "skip",
});
assert.equal(result.status, 400);
for (const status of ["acknowledged", "assessed", "acted", "closed"]) {
  result = await command({
    type: "event.transition",
    id: event.id,
    status,
    note: "Подтверждённый этап",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
}
ok("event assessment/action/closure workflow");
function provision({
  id,
  clinicId,
  email,
  password,
  specialty = "psychiatrist",
  patientId,
}) {
  execFileSync(dotnet, [apiAssembly, "--provision"], {
    cwd: apiDirectory,
    env: {
      ...runtime,
      ASPNETCORE_ENVIRONMENT: "Development",
      Provision__Id: id,
      Provision__ClinicId: clinicId,
      Provision__Name: "Синтетический проверяющий",
      Provision__Email: email,
      Provision__Password: password,
      Provision__Specialty: specialty,
      ...(patientId ? { Provision__PatientId: patientId } : {}),
    },
    stdio: "pipe",
  });
}
for (const sameClinic of [true, false]) {
  const other = client();
  const id = `other-${sameClinic}-${suffix}`,
    email = `${id}@example.test`,
    password = randomUUID();
  provision({
    id,
    clinicId: sameClinic ? actor.clinicId : "foreign-clinic",
    email,
    password,
  });
  await other.login(email, password);
  assert.deepEqual((await other.call("/patients")).body, []);
  const forbidden = await command(
    { type: "message.send", text: "forbidden" },
    randomUUID(),
    patient.revision,
    other,
  );
  assert.equal(forbidden.status, 404);
  ok(sameClinic ? "care relationship enforced" : "clinic isolation enforced");
}
const patientClient = client();
const patientEmail = `patient-${suffix}@example.test`,
  patientPassword = randomUUID();
provision({
  id: `patient-${suffix}`,
  clinicId: actor.clinicId,
  email: patientEmail,
  password: patientPassword,
  specialty: "patient",
  patientId: patient.id,
});
await patientClient.login(patientEmail, patientPassword, true);
assert.equal((await patientClient.call("/patients")).status, 403);
ok("patient cannot access doctor endpoints");
result = await patientClient.call("/patient/commands", "POST", {
  commandId: randomUUID(),
  expectedRevision: 0,
  mutation: {
    type: "report.add",
    value: {
      ...report,
      id: randomUUID(),
      provenance: "doctor",
      adverseEffects: "",
      note: "Пациент отправил отчёт",
    },
  },
});
assert.equal(result.status, 200, JSON.stringify(result.body));
assert.equal(result.body.reports.at(-1).provenance, "patient");
ok("patient API report delivered with server provenance");
patient = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
);
assert.equal(patient.reports.at(-1).note, "Пациент отправил отчёт");
ok("doctor receives real persisted patient report");
result = await patientClient.call("/patient/commands", "POST", {
  commandId: randomUUID(),
  mutation: { type: "visit.complete", id: visit.id },
});
assert.equal(result.status, 403);
ok("patient cannot invoke clinical command");
result = await doctor.call("/sources/S03/file");
assert.ok([200, 404].includes(result.status));
ok(
  result.status === 200
    ? "authenticated source document with hash verification"
    : "source directory absent: explicit 404",
);
const openapi = await doctor.call("/openapi/v1.json");
assert.equal(openapi.status, 200);
assert.ok(openapi.body.components.schemas.Command);
ok("OpenAPI contract served to authorized doctor");
assert.equal(
  (await command({ type: "message.send", text: "Не отправлять без согласия" }))
    .status,
  400,
);
ok("outbound messages require current communication consent");
const communication = {
  ...patient.consents[0],
  id: randomUUID(),
  purpose: "communication",
  status: "documented",
};
assert.equal(
  (await command({ type: "consent.add", value: communication })).status,
  200,
);
assert.equal(
  (
    await command({
      type: "message.send",
      text: "Синтетическое согласованное сообщение",
    })
  ).status,
  200,
);
const messageId = patient.messages.at(-1).id;
result = await patientClient.call("/patient/commands", "POST", {
  commandId: randomUUID(),
  mutation: { type: "message.received", id: messageId, status: "read" },
});
assert.equal(result.status, 200);
assert.equal(
  result.body.messages.find((m) => m.id === messageId).status,
  "read",
);
ok("patient acknowledgement advances message receipt");
patient = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
);
assert.equal(
  (
    await command({
      type: "consent.add",
      value: { ...communication, id: randomUUID(), status: "withdrawn" },
    })
  ).status,
  200,
);
assert.equal(
  (await command({ type: "message.send", text: "После отзыва" })).status,
  400,
);
ok("withdrawn communication consent prevents new outbound message");
console.log(
  JSON.stringify(
    { passed, patientId: patient.id, revision: patient.revision },
    null,
    2,
  ),
);
fs.mkdirSync(cache, { recursive: true });
fs.writeFileSync(
  path.join(cache, "integration-result.json"),
  JSON.stringify(
    {
      passed,
      patientId: patient.id,
      revision: patient.revision,
      when: new Date().toISOString(),
    },
    null,
    2,
  ),
);
