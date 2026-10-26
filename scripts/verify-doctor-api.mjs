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
  pg,
  config,
} from "./doctor-runtime.mjs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { grlsCatalog } from "../apps/web-doctor/src/workspace/grls.ts";
import {
  legacyClinicalFacts,
  clinicalFactsContext,
} from "../apps/web-doctor/src/workspace/clinical-facts.ts";
import {
  ICD10_CATALOG,
  ICD10_SOURCE,
  ICD10_NODES,
  searchIcd10 as localIcd10Search,
} from "../apps/web-doctor/src/workspace/terminology.ts";
import {
  newAviandrReview,
  evaluateAviandr,
} from "../apps/web-doctor/src/workspace/aviandr.ts";
import {
  createPatient,
  createVisit,
  blankNotes,
  applyCommand,
} from "../apps/web-doctor/src/workspace/commands.ts";
import { scenarioMutations } from "../apps/web-doctor/src/workspace/clinical-scenarios.ts";
import {
  workflowComparison,
  changesSinceContact,
} from "../apps/web-doctor/src/workspace/clinical-workflow.ts";
import {
  clinicalProtocols,
  describeClinicalScore,
} from "../apps/web-doctor/src/workspace/clinical-protocols.ts";
import {
  newSupportInput,
  supportCatalog,
} from "../apps/web-doctor/src/workspace/clinical-support-engine.ts";
import { adherenceSummary } from "../apps/web-doctor/src/workspace/adherence.ts";
import { patientBirthDateBounds } from "../apps/web-doctor/src/workspace/patient-age.ts";
import { fixtureDatabaseSettings } from "./doctor-fixture-sql.mjs";
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
grlsCatalog.install(
  JSON.parse(
    gunzipSync(
      fs.readFileSync("apps/web-doctor/src/workspace/grls-catalog.json.gz"),
    ),
  ),
);
assert.equal((await client().call("/terminology/grls")).status, 401);
for (const q of [
  "Авиандр",
  "парацетамол",
  "таблетки 20 мг",
  "ЛП-№(002445)-(РГ-RU)",
  "производитель",
]) {
  const remote = await doctor.call(
    `/terminology/grls?q=${encodeURIComponent(q)}&page=1&pageSize=12`,
  );
  assert.equal(remote.status, 200);
  assert.deepEqual(remote.body, grlsCatalog.search(q, 1, 12));
}
assert.equal((await doctor.call("/terminology/grls?pageSize=101")).status, 400);
ok(
  "current GRLS search matches local snapshot, excludes historical statuses and requires doctor authentication",
);
assert.equal((await client().call("/terminology/icd10")).status, 401);
const catalogCodes = [];
for (let page = 1; ; page++) {
  const response = await doctor.call(
    `/terminology/icd10?page=${page}&pageSize=100`,
  );
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.sourceVersion, ICD10_SOURCE.sourceVersion);
  assert.equal(response.body.total, ICD10_CATALOG.length);
  catalogCodes.push(...response.body.items.map((r) => r.code));
  if (catalogCodes.length >= response.body.total) break;
  assert.ok(response.body.items.length > 0);
}
assert.deepEqual(
  catalogCodes,
  ICD10_CATALOG.map((r) => r.code),
);
for (const query of [
  " u 07 . 1 ",
  "железодефицитная   анемия",
  "КОДЫ ДЛЯ СПЕЦИАЛЬНЫХ ЦЕЛЕЙ",
  "Класс I",
  "Класс II",
  "Класс XXI",
  "A00-A09",
]) {
  const response = await doctor.call(
    `/terminology/icd10?q=${encodeURIComponent(query)}`,
  );
  assert.equal(response.status, 200);
  assert.ok(response.body.total > 0);
  const local = localIcd10Search(query);
  assert.equal(response.body.total, local.length);
  assert.deepEqual(response.body.items, local.slice(0, 25));
}
assert.equal((await doctor.call("/terminology/icd10?page=0")).status, 400);
assert.equal(
  (await doctor.call("/terminology/icd10?pageSize=101")).status,
  400,
);
ok(
  "full ICD-10 API pagination matches all local codes and requires doctor session",
);
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
  { ...visit, notes: { ...visit.notes, mentalStatus: null } },
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
    mentalStatus: "Синтетический психический статус",
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
const physician = client();
const physicianEmail = `physician-${suffix}@example.test`;
const physicianPassword = randomUUID();
provision({
  id: `physician-${suffix}`,
  clinicId: actor.clinicId,
  email: physicianEmail,
  password: physicianPassword,
  specialty: "physician",
});
const physicianActor = await physician.login(physicianEmail, physicianPassword);
const physicianPatient = await physician.call("/patients", "POST", {
  id: randomUUID(),
  profile: {
    name: "Синтетический пациент проверки роли",
    birthDate: "1990-01-01",
  },
});
assert.equal(physicianPatient.status, 201);
const physicianVisit = createVisit(
  randomUUID(),
  new Date().toISOString(),
  physicianActor,
);
physicianVisit.diagnoses = [
  { ...ICD10_CATALOG.find((d) => d.code === "F41.1"), status: "confirmed" },
];
assert.equal(
  (
    await physician.call(
      `/patients/${physicianPatient.body.id}/commands`,
      "POST",
      {
        commandId: randomUUID(),
        expectedRevision: 0,
        mutation: { type: "visit.save", value: physicianVisit },
      },
    )
  ).status,
  403,
);
physicianVisit.diagnoses[0].status = "hypothesis";
assert.equal(
  (
    await physician.call(
      `/patients/${physicianPatient.body.id}/commands`,
      "POST",
      {
        commandId: randomUUID(),
        expectedRevision: 0,
        mutation: { type: "visit.save", value: physicianVisit },
      },
    )
  ).status,
  200,
);
ok("visit diagnosis confirmation preserves psychiatrist-only access");
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
const somatic = ICD10_CATALOG.find((d) => d.code === "G40");
const outsideSubset = ICD10_CATALOG.filter((d) =>
  ["A00.0", "C50.9", "M54.5", "Z99.9", "U07.1", "U09.9"].includes(d.code),
);
assert.equal(outsideSubset.length, 6);
for (const invalid of [
  { ...outsideSubset[0], title: "Подмена" },
  { ...outsideSubset[0], sourceVersion: "unknown" },
  { ...outsideSubset[0], code: "XXII" },
  {
    ...outsideSubset[0],
    ...ICD10_NODES.find((r) => !r.active && r.kind === "code"),
  },
]) {
  // Strip source-only hierarchy fields: rejection must be about terminology.
  const { system, sourceOid, sourceVersion, code, title } = invalid;
  const before = patient.revision;
  assert.equal(
    (
      await command({
        type: "profile.update",
        value: {
          ...patient.profile,
          clinicalContext: {
            ...patient.profile.clinicalContext,
            somaticConditions: [
              { system, sourceOid, sourceVersion, code, title },
            ],
          },
        },
      })
    ).status,
    400,
  );
  assert.equal(patient.revision, before);
}
assert.equal(
  (
    await command({
      type: "profile.update",
      value: {
        ...patient.profile,
        clinicalContext: {
          ...patient.profile.clinicalContext,
          somaticConditions: outsideSubset,
        },
      },
    })
  ).status,
  200,
);
const episodeCode = outsideSubset.at(-1);
const episode = {
  id: randomUUID(),
  title: "Синтетическая проверка МКБ-10",
  createdAt: "",
  author: "",
  startedOn: "2026-10-26",
  status: "active",
  phase: "assessment",
  diagnosis: `${episodeCode.code} · ${episodeCode.title}`,
  diagnosisCode: episodeCode,
  diagnosisStatus: "hypothesis",
  endDate: "",
  summary: "",
};
assert.equal(
  (
    await command({
      type: "episode.save",
      value: {
        ...episode,
        diagnosisCode: { ...episodeCode, title: "Подмена" },
      },
    })
  ).status,
  400,
);
assert.equal(
  (await command({ type: "episode.save", value: episode })).status,
  200,
);
ok(
  "full catalog selections validated in somatic profile and episode; tampering/inactive/group codes rejected",
);
assert.equal(
  (
    await command({
      type: "profile.update",
      value: {
        ...patient.profile,
        clinicalContext: {
          ...patient.profile.clinicalContext,
          somaticConditions: [somatic],
        },
      },
    })
  ).status,
  200,
);
const diagnosisVisit = createVisit(
  randomUUID(),
  new Date().toISOString(),
  actor,
);
diagnosisVisit.status = "in-progress";
diagnosisVisit.diagnoses = [
  { ...ICD10_CATALOG.find((d) => d.code === "F41.1"), status: "hypothesis" },
  ...outsideSubset.map((d) => ({ ...d, status: "hypothesis" })),
];
assert.equal(
  (await command({ type: "visit.save", value: diagnosisVisit })).status,
  200,
);
const persistedIcd10 = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
);
assert.deepEqual(persistedIcd10.profile.clinicalContext.somaticConditions, [
  somatic,
]);
assert.deepEqual(
  persistedIcd10.episodes.find((e) => e.id === episode.id).diagnosisCode,
  episodeCode,
);
assert.deepEqual(
  persistedIcd10.visits.find((v) => v.id === diagnosisVisit.id).diagnoses,
  diagnosisVisit.diagnoses,
);
ok("ICD-10 profile, episode and visit survive a separate PostgreSQL read");
const aviandrId = randomUUID();
const grlsMedicine = (
  await doctor.call("/terminology/grls?q=" + encodeURIComponent("Авиандр"))
).body.items[0];
assert.ok(grlsMedicine);
const aviandrDraft = {
  id: aviandrId,
  createdAt: "",
  author: "forged",
  visitId: diagnosisVisit.id,
  kind: "medication",
  title: grlsMedicine.tradeName,
  medicine: grlsMedicine,
  details: "Синтетическая проверка",
  dose: "20 мг",
  schedule: "Схема врача",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  dueDate: "",
  status: "draft",
  confirmedAt: "",
  confirmedBy: "",
  changeReason: "",
  replacesId: "",
  instructionUrl: "https://example.test/instruction",
  patientInstructions: "Синтетические указания",
  sourceIds: [],
  rationale: "Технический сценарий, без клинической активации",
  aviandrReview: newAviandrReview(patient, aviandrId),
};
for (const patch of [
  { registrationStatus: "Исключённый" },
  { tradeName: "Подмена" },
  { sourceVersion: "unknown" },
]) {
  const revision = patient.revision;
  assert.equal(
    (
      await command({
        type: "plan.save",
        value: { ...aviandrDraft, medicine: { ...grlsMedicine, ...patch } },
      })
    ).status,
    400,
  );
  assert.equal(patient.revision, revision);
}
aviandrDraft.aviandrReview.inputs.epilepsy = "yes";
aviandrDraft.aviandrReview.inputs.serotonergic = "yes";
aviandrDraft.aviandrReview.checkedBy = "forged";
aviandrDraft.aviandrReview.findings = [];
const aviandrCommandId = randomUUID();
result = await command(
  { type: "plan.save", value: aviandrDraft },
  aviandrCommandId,
);
assert.equal(result.status, 200, JSON.stringify(result.body));
let storedReview = patient.plan.find((p) => p.id === aviandrId).aviandrReview;
assert.equal(storedReview.status, "unapproved");
assert.deepEqual(storedReview.context, aviandrDraft.aviandrReview.context);
assert.equal(storedReview.context.conditions, "G40 Эпилепсия");
assert.ok(storedReview.context.diagnoses.some((row) => row.includes("F41.1")));
assert.equal(storedReview.checkedBy, actor.name);
assert.ok(storedReview.checkedAt);
assert.deepEqual(
  storedReview.findings.map((f) => [f.id, f.status]),
  evaluateAviandr(aviandrDraft.aviandrReview, aviandrDraft.startDate).map(
    (f) => [f.id, f.status],
  ),
);
const reviewTime = storedReview.checkedAt;
assert.equal(
  (await command({ type: "plan.save", value: aviandrDraft }, aviandrCommandId))
    .status,
  200,
);
assert.equal(
  patient.plan.find((p) => p.id === aviandrId).aviandrReview.checkedAt,
  reviewTime,
);
ok("Aviandr review recomputed on server, unapproved and idempotent");
const day = (offset) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
for (const [inputPatch, ruleId, expected] of [
  [
    { egfr: 59, egfrUnit: "ml/min", egfrDate: day(0) },
    "renal",
    "contraindication",
  ],
  [{ egfr: 60, egfrUnit: "ml/min", egfrDate: day(0) }, "renal", "review"],
  [
    { egfr: 59, egfrUnit: "ml/min/1.73m2", egfrDate: day(0) },
    "renal",
    "review",
  ],
  [{ maoUse: "no", lastMaoDate: day(-13) }, "mao", "contraindication"],
  [{ maoUse: "no", lastMaoDate: day(-14) }, "mao", "not-identified"],
  [{ indication: "other", serotonergic: "yes" }, "indication", "review"],
]) {
  const value = {
    ...aviandrDraft,
    aviandrReview: {
      ...aviandrDraft.aviandrReview,
      inputs: { ...aviandrDraft.aviandrReview.inputs, ...inputPatch },
    },
  };
  assert.equal((await command({ type: "plan.save", value })).status, 200);
  const rows = patient.plan.find((p) => p.id === aviandrId).aviandrReview
    .findings;
  assert.equal(rows.find((f) => f.id === ruleId).status, expected);
  assert.deepEqual(rows, evaluateAviandr(value.aviandrReview, value.startDate));
}
assert.equal(
  (
    await command({
      type: "plan.save",
      value: {
        ...aviandrDraft,
        startDate: day(20),
        aviandrReview: {
          ...aviandrDraft.aviandrReview,
          inputs: {
            ...aviandrDraft.aviandrReview.inputs,
            maoUse: "no",
            lastMaoDate: day(1),
          },
        },
      },
    })
  ).status,
  400,
);
ok("Aviandr server/demo parity covers renal units and MAOI date boundaries");
for (const patch of [
  { status: "approved" },
  { sourceVersion: "forged" },
  { sourceHash: "forged" },
  { sourceUrl: "https://example.test/forged" },
  { inputs: { ...aviandrDraft.aviandrReview.inputs, epilepsy: false } },
  { unexpected: true },
]) {
  assert.equal(
    (
      await command({
        type: "plan.save",
        value: {
          ...aviandrDraft,
          aviandrReview: { ...aviandrDraft.aviandrReview, ...patch },
        },
      })
    ).status,
    400,
  );
}
assert.equal(
  (
    await command({
      type: "plan.save",
      value: { ...aviandrDraft, title: "Другой препарат" },
    })
  ).status,
  400,
);
ok("Aviandr approval, source and drug identity cannot be forged");
assert.equal(
  (
    await command({
      type: "profile.update",
      value: {
        ...patient.profile,
        currentMedication: "Новое лекарство в карте",
      },
    })
  ).status,
  200,
);
assert.equal(
  (await command({ type: "plan.confirm", id: aviandrId })).status,
  409,
);
aviandrDraft.aviandrReview = newAviandrReview(patient, aviandrId);
aviandrDraft.aviandrReview.inputs.epilepsy = "yes";
assert.equal(
  (await command({ type: "plan.save", value: aviandrDraft })).status,
  200,
);
assert.equal(
  (await command({ type: "plan.confirm", id: aviandrId })).status,
  200,
);
assert.equal(
  patient.plan.find((p) => p.id === aviandrId).aviandrReview.status,
  "unapproved",
);
assert.equal(
  patient.plan
    .find((p) => p.id === aviandrId)
    .aviandrReview.findings.find((f) => f.id === "epilepsy").status,
  "contraindication",
);
ok(
  "changed chart invalidates review; unapproved findings never activate clinical blocking",
);
const patientView = (await patientClient.call("/patient/record")).body;
assert.equal(
  patientView.plan.find((p) => p.id === aviandrId).aviandrReview,
  undefined,
);
ok("preparatory clinician review is not disclosed through patient API");
const persistedGrls = (await doctor.call("/patients")).body
  .find((p) => p.id === patient.id)
  .plan.find((p) => p.id === aviandrId);
assert.deepEqual(persistedGrls.medicine, grlsMedicine);
assert.equal(persistedGrls.status, "confirmed");
assert.equal(
  (await command({ type: "plan.save", value: aviandrDraft })).status,
  400,
);
const otherMedicine = (
  await doctor.call("/terminology/grls?q=" + encodeURIComponent("Парацетамол"))
).body.items[0];
assert.ok(otherMedicine);
const replacement = {
  ...aviandrDraft,
  id: randomUUID(),
  title: otherMedicine.tradeName,
  medicine: otherMedicine,
  dose: "Задаёт врач",
  schedule: "Задаёт врач",
  replacesId: aviandrId,
  changeReason: "Синтетическое новое решение врача",
};
delete replacement.aviandrReview;
assert.equal(
  (await command({ type: "plan.save", value: replacement })).status,
  200,
);
assert.equal(
  (await command({ type: "plan.confirm", id: replacement.id })).status,
  200,
);
const history = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
).plan;
assert.deepEqual(
  history.find((p) => p.id === aviandrId).medicine,
  grlsMedicine,
);
assert.equal(history.find((p) => p.id === aviandrId).status, "stopped");
assert.deepEqual(
  history.find((p) => p.id === replacement.id).medicine,
  otherMedicine,
);
ok(
  "GRLS registration snapshot persists in PostgreSQL; replacement preserves original prescription and registration history",
);
const factOrigin = {
  kind: "patient",
  reference: "Синтетический самоотчёт",
  quote: "Учебные сведения пациента",
  observedAt: new Date().toISOString(),
};
const factIds = {};
const facts = [
  {
    category: "diagnosis",
    state: "known",
    condition: ICD10_CATALOG.find((d) => d.code === "F41.1"),
    diagnosticStatus: "hypothesis",
  },
  {
    category: "somatic",
    state: "known",
    condition: ICD10_CATALOG.find((d) => d.code === "I10"),
  },
  {
    category: "medication",
    state: "known",
    medicine: otherMedicine,
    details: "Со слов пациента; режим требует сверки",
  },
  {
    category: "allergy",
    state: "known",
    substance: "Учебный аллерген",
    reaction: "Синтетическое описание реакции",
  },
];
const documentId = randomUUID();
assert.equal(
  (
    await command({
      type: "document.add",
      value: {
        id: documentId,
        title: "Учебная выписка контекста",
        documentDate: new Date().toISOString().slice(0, 10),
        issuer: "Синтетическая клиника",
        text: "Учебный документ: сообщена аллергическая реакция",
        status: "unverified",
        exclusionReason: "",
        facts: [],
        createdAt: "",
        author: "forged",
      },
    })
  ).status,
  200,
);
const documentFactId = randomUUID();
const documentOrigin = {
  kind: "document",
  reference: documentId,
  quote: "сообщена аллергическая реакция",
  observedAt: "",
};
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: documentFactId,
        expectedVersion: 0,
        content: facts[3],
        origin: documentOrigin,
        reason: "",
      },
    })
  ).status,
  200,
);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: documentFactId,
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    })
  ).status,
  200,
);
assert.deepEqual(
  patient.clinicalFacts.find((f) => f.id === documentFactId).versions.at(-1)
    .origin,
  documentOrigin,
);
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: randomUUID(),
        expectedVersion: 0,
        content: facts[3],
        origin: { ...documentOrigin, quote: "Несуществующая цитата" },
        reason: "",
      },
    })
  ).status,
  400,
);
ok(
  "document provenance requires current patient document and literal quote; confirmation retains source",
);
const planBeforeFacts = structuredClone(patient.plan);
for (const content of facts) {
  const id = randomUUID();
  factIds[content.category] = id;
  const mutation = {
    type: "fact.save",
    value: { id, expectedVersion: 0, content, origin: factOrigin, reason: "" },
  };
  const commandId = randomUUID();
  const before = patient.revision;
  const saved = await command(mutation, commandId);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(
    (await command(mutation, commandId, before)).body,
    saved.body,
  );
  const version = patient.clinicalFacts.find((f) => f.id === id).versions[0];
  assert.equal(version.status, "unverified");
  assert.deepEqual(version.origin, factOrigin);
  assert.equal(version.changedBy.id, actor.id);
  assert.equal(version.verifiedBy, null);
  assert.equal(
    (
      await command({
        type: "fact.review",
        id,
        expectedVersion: 1,
        decision: "confirm",
        reason: "",
      })
    ).status,
    200,
  );
  const confirmed = patient.clinicalFacts
    .find((f) => f.id === id)
    .versions.at(-1);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.verifiedBy.id, actor.id);
  assert.deepEqual(confirmed.origin, factOrigin);
}
assert.deepEqual(patient.plan, planBeforeFacts);
ok(
  "four fact categories persist provenance and independent doctor confirmation without changing prescriptions",
);
const allergyId = factIds.allergy;
const badRevision = patient.revision;
for (const mutation of [
  {
    type: "fact.save",
    value: {
      id: randomUUID(),
      expectedVersion: 0,
      content: facts[3],
      origin: factOrigin,
      reason: "",
      verifiedBy: actor,
    },
  },
  {
    type: "fact.save",
    value: {
      id: randomUUID(),
      expectedVersion: 0,
      content: facts[3],
      origin: {
        ...factOrigin,
        kind: "document",
        reference: "foreign-document",
      },
      reason: "",
    },
  },
  {
    type: "fact.save",
    value: {
      id: allergyId,
      expectedVersion: 2,
      content: { ...facts[3], reaction: "Исправлено" },
      origin: factOrigin,
      reason: "",
    },
  },
  {
    type: "fact.review",
    id: allergyId,
    expectedVersion: 2,
    decision: "contradict",
    reason: "",
  },
])
  assert.equal((await command(mutation)).status, 400);
assert.equal(patient.revision, badRevision);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: allergyId,
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    })
  ).status,
  409,
);
ok(
  "forged verification, foreign documents, missing reasons and stale fact versions are rejected atomically",
);
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: allergyId,
        expectedVersion: 2,
        content: { ...facts[3], reaction: "Уточнённое описание" },
        origin: factOrigin,
        reason: "Сверено с пациентом",
      },
    })
  ).status,
  200,
);
let allergyFact = patient.clinicalFacts.find((f) => f.id === allergyId);
assert.equal(allergyFact.versions.length, 3);
assert.equal(allergyFact.versions[2].status, "unverified");
assert.equal(allergyFact.versions[2].verifiedBy, null);
assert.deepEqual(allergyFact.versions[0].content, facts[3]);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: allergyId,
      expectedVersion: 3,
      decision: "inactivate",
      reason: "Исторические сведения",
    })
  ).status,
  200,
);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: allergyId,
      expectedVersion: 4,
      decision: "confirm",
      reason: "",
    })
  ).status,
  400,
);
ok(
  "correction resets verification and appends history; inactive facts cannot be silently reactivated",
);
const unknownId = randomUUID();
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: unknownId,
        expectedVersion: 0,
        content: { category: "allergy", state: "unknown" },
        origin: factOrigin,
        reason: "",
      },
    })
  ).status,
  200,
);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: unknownId,
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    })
  ).status,
  400,
);
const noneId = randomUUID();
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: noneId,
        expectedVersion: 0,
        content: { category: "allergy", state: "none-known" },
        origin: { ...factOrigin, quote: "Явно отрицает известные аллергии" },
        reason: "",
      },
    })
  ).status,
  200,
);
assert.equal(
  patient.clinicalFacts.find((f) => f.id === unknownId).versions[0].status,
  "unknown",
);
ok("unknown allergy remains distinct from explicit negative self-report");
const legacyFact = legacyClinicalFacts(patient).find(
  (f) => f.key === "profile:currentMedication",
);
assert.ok(legacyFact);
const legacyId = randomUUID();
assert.equal(
  (
    await command({
      type: "fact.save",
      value: {
        id: legacyId,
        expectedVersion: 0,
        content: legacyFact.content,
        origin: legacyFact.origin,
        reason: "",
      },
    })
  ).status,
  200,
);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: legacyId,
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    })
  ).status,
  400,
);
assert.ok(!legacyClinicalFacts(patient).some((f) => f.key === legacyFact.key));
ok(
  "legacy data transfer remains unverified and unresolved text cannot be confirmed",
);
const parsedLegacy = legacyClinicalFacts(patient).find(
  (f) => f.content.category === "somatic",
);
assert.ok(parsedLegacy);
const parsedValue = {
  id: randomUUID(),
  expectedVersion: 0,
  content: parsedLegacy.content,
  origin: parsedLegacy.origin,
  reason: "",
};
assert.equal(
  (await command({ type: "fact.save", value: parsedValue })).status,
  200,
);
assert.equal(
  (
    await command({
      type: "fact.save",
      value: { ...parsedValue, id: randomUUID() },
    })
  ).status,
  409,
);
assert.ok(
  !legacyClinicalFacts(patient).some((f) => f.key === parsedLegacy.key),
);
ok(
  "legacy structured snapshot has identical API/local identity and cannot be transferred twice",
);
const persistedFacts = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
).clinicalFacts;
assert.deepEqual(persistedFacts, patient.clinicalFacts);
const contextDraft = {
  ...aviandrDraft,
  id: randomUUID(),
  status: "draft",
  replacesId: "",
  changeReason: "",
  aviandrReview: newAviandrReview(patient, "new"),
};
contextDraft.aviandrReview = newAviandrReview(patient, contextDraft.id);
assert.equal(
  (await command({ type: "plan.save", value: contextDraft })).status,
  200,
);
assert.deepEqual(
  patient.plan.find((p) => p.id === contextDraft.id).aviandrReview.context
    .clinicalFacts,
  clinicalFactsContext(patient),
);
assert.equal(
  (
    await command({
      type: "fact.review",
      id: factIds.medication,
      expectedVersion: 2,
      decision: "clarify",
      reason: "",
    })
  ).status,
  200,
);
assert.equal(
  (await command({ type: "plan.save", value: contextDraft })).status,
  409,
);
assert.equal(
  (await patientClient.call("/patient/record")).body.clinicalFacts,
  undefined,
);
ok(
  "PostgreSQL round-trip, local/API context parity and stale medicine checks after fact changes",
);
const physicianFactId = randomUUID();
let physicianRecord = (await physician.call("/patients")).body.find(
  (p) => p.id === physicianPatient.body.id,
);
const physicianFactCommand = async (mutation) => {
  const response = await physician.call(
    `/patients/${physicianRecord.id}/commands`,
    "POST",
    {
      commandId: randomUUID(),
      expectedRevision: physicianRecord.revision,
      mutation,
    },
  );
  if (response.status === 200) physicianRecord = response.body;
  return response;
};
assert.equal(
  (
    await physicianFactCommand({
      type: "fact.save",
      value: {
        id: physicianFactId,
        expectedVersion: 0,
        content: facts[0],
        origin: factOrigin,
        reason: "",
      },
    })
  ).status,
  200,
);
assert.equal(
  (
    await physicianFactCommand({
      type: "fact.review",
      id: physicianFactId,
      expectedVersion: 1,
      decision: "confirm",
      reason: "",
    })
  ).status,
  403,
);
ok("API enforces psychiatrist-only diagnosis confirmation on server");
// Complete synthetic workflow: use exactly the same commands in HTTP and the local domain.
async function flowCommand(
  mutation,
  expectedStatus = 200,
  who = doctor,
  localActor = actor,
) {
  const before = structuredClone(patient);
  const id = randomUUID();
  const revision = patient.revision;
  const response = await command(mutation, id, revision, who);
  assert.equal(
    response.status,
    expectedStatus,
    `${mutation.type}: ${JSON.stringify(response.body).slice(0, 600)}`,
  );
  if (response.status === 200) {
    // HTTP authorizes an explicit care relationship. The local fixture models
    // one doctor per view, so bind that already-authorized view to its actor.
    const localBefore =
      before.doctorId === localActor.id
        ? before
        : { ...before, doctorId: localActor.id };
    const local = applyCommand(
      localBefore,
      { commandId: id, expectedRevision: revision, mutation },
      localActor,
      patient.updatedAt,
    );
    assert.deepEqual(
      patient.workflow,
      local.workflow,
      "HTTP/local workflow parity",
    );
    assert.deepEqual(patient.plan, local.plan, "HTTP/local plan parity");
    assert.deepEqual(
      patient.referrals,
      local.referrals,
      "HTTP/local referral parity",
    );
    assert.deepEqual(
      patient.clinicalSupport,
      local.clinicalSupport,
      "HTTP/local clinical support parity",
    );
    assert.deepEqual(
      patient.adherence,
      local.adherence,
      "HTTP/local adherence parity",
    );
    assert.deepEqual(
      patient.events,
      local.events,
      "HTTP/local care event parity",
    );
    const persisted = structuredClone(patient);
    const replay = await command(mutation, id, revision, who);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(
      replay.body,
      persisted,
      "Root command replay must not duplicate workflow effects or history",
    );
  } else {
    const persisted = (await who.call("/patients")).body.find(
      (p) => p.id === patient.id,
    );
    assert.deepEqual(
      persisted,
      before,
      "Rejected workflow command must be atomic",
    );
  }
  return response;
}
const flowReference = new Date();
const flowPrefix = randomUUID();
for (const mutation of scenarioMutations("complete", flowReference, flowPrefix))
  await flowCommand(mutation);
assert.equal(patient.workflow.assessments.at(-1).score, 14);
assert.equal(workflowComparison(patient, `${flowPrefix}-current`).delta, 7);
ok(
  "synthetic intake computes score, provenance and comparable changes identically in HTTP/local modes",
);
const invalidFlow = {
  type: "workflow.submit",
  value: {
    id: randomUUID(),
    protocolVersion: "synthetic-7-v1",
    measuredAt: new Date().toISOString(),
    answers: [0, 0, 0, 0, 0, 0, 0],
    state: "completed",
    safety: "no",
    note: "Учебная подмена",
    assignmentId: "",
    score: 0,
  },
};
await flowCommand(invalidFlow, 400);
await flowCommand(
  {
    ...invalidFlow,
    value: { ...invalidFlow.value, source: { status: "approved" } },
  },
  400,
);
const beforeInvalidRevision = patient.revision;
await flowCommand(
  {
    type: "workflow.submit",
    value: {
      id: randomUUID(),
      protocolVersion: "not-approved",
      measuredAt: new Date().toISOString(),
      answers: [0, 0, 0, 0, 0, 0, 0],
      state: "completed",
      safety: "no",
      note: "",
      assignmentId: "",
    },
  },
  400,
);
assert.equal(patient.revision, beforeInvalidRevision);
ok(
  "workflow API rejects supplied scores, forged approval and unsupported protocol versions atomically",
);
let flowRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation",
);
await flowCommand(
  {
    type: "workflow.decide",
    id: flowRec.id,
    expectedVersion: flowRec.version,
    decision: "reject",
    reason: "",
    action: flowRec.action,
    dueDate: "",
  },
  400,
);
const acceptPayload = {
  type: "workflow.decide",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  decision: "accept",
  reason: "",
  action: flowRec.action,
  dueDate: "",
};
const acceptId = randomUUID();
const acceptRevision = patient.revision;
const acceptBefore = structuredClone(patient);
const accepted = await command(acceptPayload, acceptId, acceptRevision);
assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
assert.deepEqual(
  patient.workflow,
  applyCommand(
    acceptBefore,
    {
      commandId: acceptId,
      expectedRevision: acceptRevision,
      mutation: acceptPayload,
    },
    actor,
    patient.updatedAt,
  ).workflow,
);
assert.deepEqual(
  (await command(acceptPayload, acceptId, acceptRevision)).body,
  patient,
);
flowRec = patient.workflow.recommendations.find((r) => r.id === flowRec.id);
assert.equal(
  patient.plan.find((p) => p.id === flowRec.effectId).status,
  "draft",
);
await flowCommand(
  {
    type: "workflow.execute",
    id: flowRec.id,
    expectedVersion: flowRec.version,
    confirmation: false,
  },
  400,
);
await flowCommand({
  type: "workflow.execute",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  confirmation: true,
});
assert.equal(
  patient.plan.find((p) => p.id === flowRec.effectId).status,
  "confirmed",
);
ok(
  "acceptance creates one draft; explicit confirmation and idempotency protect the clinical action",
);
flowRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "next-scale",
);
const followupDate = new Date(Date.now() + 7 * 86400000)
  .toISOString()
  .slice(0, 10);
await flowCommand(
  {
    type: "workflow.decide",
    id: flowRec.id,
    expectedVersion: flowRec.version,
    decision: "accept",
    reason: "",
    action: "scale",
    dueDate: "",
  },
  400,
);
await flowCommand({
  type: "workflow.decide",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  decision: "accept",
  reason: "",
  action: "scale",
  dueDate: followupDate,
});
flowRec = patient.workflow.recommendations.find((r) => r.id === flowRec.id);
await flowCommand({
  type: "workflow.execute",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  confirmation: true,
});
const issuedAssignment = patient.workflow.assignments.at(-1);
assert.equal(issuedAssignment.delivery, "synthetic-local");
const assignedResult = {
  type: "workflow.submit",
  value: {
    id: randomUUID(),
    protocolVersion: "synthetic-7-v1",
    measuredAt: new Date().toISOString(),
    answers: [0, 0, 0, 0, 0, 0, 0],
    state: "completed",
    safety: "no",
    note: "Ответ на учебное задание",
    assignmentId: issuedAssignment.id,
  },
};
await flowCommand(assignedResult);
assert.equal(patient.workflow.assignments.at(-1).status, "submitted");
await flowCommand(
  { ...assignedResult, value: { ...assignedResult.value, id: randomUUID() } },
  400,
);
ok(
  "only confirmed questionnaire decision creates a dated assignment; a submitted assignment cannot be consumed twice",
);
flowRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation",
);
await flowCommand({
  type: "workflow.decide",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  decision: "modify",
  reason: "Синтетическое решение врача",
  action: "consultation",
  destination: "Учебный специалист",
  dueDate: "",
});
flowRec = patient.workflow.recommendations.find((r) => r.id === flowRec.id);
assert.equal(
  patient.referrals.find((f) => f.id === flowRec.effectId).status,
  "draft",
);
await flowCommand({
  type: "workflow.execute",
  id: flowRec.id,
  expectedVersion: flowRec.version,
  confirmation: true,
});
assert.equal(
  patient.referrals.find((f) => f.id === flowRec.effectId).status,
  "issued",
);
ok(
  "referral reason and data gaps are prepared from evidence; issuance requires a separate physician action",
);
for (const id of [
  "partial",
  "declined",
  "safety",
  "contradiction",
  "unchanged",
  "cannot",
]) {
  for (const mutation of scenarioMutations(id, new Date(), randomUUID()))
    await flowCommand(mutation);
}
const last = patient.workflow.assessments.at(-1);
assert.equal(last.completeness, "cannot");
assert.equal(last.score, null);
const concern = patient.workflow.safety.find(
  (s) => s.kind === "explicit-concern",
);
assert.ok(concern);
assert.equal(concern.evaluation, "not-assessed");
await flowCommand(
  {
    type: "workflow.safety",
    id: concern.id,
    expectedVersion: concern.version,
    status: "acted",
    note: "Просмотрено",
  },
  400,
);
for (const status of ["delivered", "acknowledged", "assessed", "acted"]) {
  const current = patient.workflow.safety.find((s) => s.id === concern.id);
  await flowCommand({
    type: "workflow.safety",
    id: current.id,
    expectedVersion: current.version,
    status,
    note: `Синтетический отдельный этап ${status}`,
  });
}
assert.equal(
  patient.workflow.safety.find((s) => s.id === concern.id).history.length,
  5,
);
ok(
  "all seven synthetic cases preserve missing/refused data, contradictions and independent safety delivery/assessment/action stages",
);
await flowCommand(
  {
    type: "patient.archive",
    archived: true,
    reason: "Проверка незавершённой безопасности",
  },
  400,
);
ok("unresolved workflow safety blocks archival independently of legacy events");
const offsetPrefix = randomUUID();
for (const [name, measuredAt] of [
  ["early", "2000-10-23T10:00:00+03:00"],
  ["previous", "2000-10-23T08:00:00Z"],
  ["current", "2000-10-23T09:00:00Z"],
])
  await flowCommand({
    type: "workflow.submit",
    value: {
      id: `${offsetPrefix}-${name}`,
      protocolVersion: "synthetic-7-v1",
      measuredAt,
      answers: [1, 1, 1, 1, 1, 1, 1],
      state: "completed",
      safety: "no",
      note: "Учебная проверка часового пояса",
      assignmentId: "",
    },
  });
assert.equal(
  patient.workflow.assessments.find((a) => a.id === `${offsetPrefix}-early`)
    .measuredAt,
  "2000-10-23T07:00:00.000Z",
);
assert.equal(
  workflowComparison(patient, `${offsetPrefix}-current`).previous.id,
  `${offsetPrefix}-previous`,
);
assert.equal(
  workflowComparison(patient, `${offsetPrefix}-current`).baseline.id,
  `${offsetPrefix}-early`,
);
ok(
  "mixed timestamp offsets normalize to UTC and compare chronologically in HTTP/local modes",
);
await flowCommand({
  type: "workflow.submit",
  value: {
    id: "x".repeat(100),
    protocolVersion: "synthetic-7-v1",
    measuredAt: new Date().toISOString(),
    answers: [1, 1, 1, 1, 1, 1, 1],
    state: "completed",
    safety: "yes",
    note: "Учебная проверка длины ID",
    assignmentId: "",
  },
});
const longSafety = patient.workflow.safety.find(
  (e) => e.assessmentId === "x".repeat(100),
);
assert.ok(longSafety);
assert.equal(longSafety.id.length, 105);
await flowCommand({
  type: "workflow.safety",
  id: longSafety.id,
  expectedVersion: longSafety.version,
  status: "delivered",
  note: "Получено врачом",
});
ok(
  "maximum result ID produces a valid 105-character safety ID and can be processed",
);
let revisionRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation",
);
await flowCommand({
  type: "workflow.decide",
  id: revisionRec.id,
  expectedVersion: revisionRec.version,
  decision: "accept",
  reason: "",
  action: revisionRec.action,
  dueDate: "",
});
revisionRec = patient.workflow.recommendations.find(
  (r) => r.id === revisionRec.id,
);
const supersededPlan = structuredClone(
  patient.plan.find((p) => p.id === revisionRec.effectId),
);
await flowCommand({
  type: "workflow.decide",
  id: revisionRec.id,
  expectedVersion: revisionRec.version,
  decision: "modify",
  reason: "Уточнён способ помощи",
  action: "consultation",
  dueDate: "",
  destination: "Учебный специалист",
  projectReason: "Уточнённое врачом основание",
});
revisionRec = patient.workflow.recommendations.find(
  (r) => r.id === revisionRec.id,
);
const supersededReferral = structuredClone(
  patient.referrals.find((p) => p.id === revisionRec.effectId),
);
assert.ok(supersededReferral.reason.includes("Уточнённое врачом основание"));
assert.ok(supersededReferral.rationale.includes("synthetic-only"));
assert.deepEqual(revisionRec.supersededEffects[0].snapshot, supersededPlan);
await flowCommand({
  type: "workflow.decide",
  id: revisionRec.id,
  expectedVersion: revisionRec.version,
  decision: "reject",
  reason: "Отменено врачом",
  action: revisionRec.action,
  dueDate: "",
});
revisionRec = patient.workflow.recommendations.find(
  (r) => r.id === revisionRec.id,
);
assert.equal(revisionRec.status, "rejected");
assert.equal(revisionRec.effectId, "");
assert.deepEqual(
  revisionRec.supersededEffects.map((e) => e.id),
  [supersededPlan.id, supersededReferral.id],
);
assert.deepEqual(revisionRec.supersededEffects[1].snapshot, supersededReferral);
await flowCommand({ type: "plan.confirm", id: supersededPlan.id }, 409);
await flowCommand(
  { type: "referral.save", value: { ...supersededReferral, status: "issued" } },
  409,
);
ok(
  "accepted drafts can be revised/rejected with doctor-edited reason; superseded snapshots persist and ordinary actions cannot bypass rejection",
);
await flowCommand({
  type: "workflow.contact",
  note: "Сверены учебные изменения",
});
assert.equal(changesSinceContact(patient).results.length, 0);
const staleRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.status === "new",
);
assert.ok(staleRec);
await command({
  type: "fact.save",
  value: {
    id: randomUUID(),
    expectedVersion: 0,
    content: { category: "medication", state: "unknown" },
    origin: {
      kind: "patient",
      reference: "Учебное уточнение",
      quote: "Список приёма неизвестен",
      observedAt: "",
    },
    reason: "",
  },
});
assert.equal(
  patient.workflow.recommendations.find((r) => r.id === staleRec.id).stale,
  true,
);
await flowCommand(
  {
    type: "workflow.decide",
    id: staleRec.id,
    expectedVersion: staleRec.version,
    decision: "accept",
    reason: "",
    action: staleRec.action,
    dueDate: "",
  },
  409,
);
const reread = (await doctor.call("/patients")).body.find(
  (p) => p.id === patient.id,
);
assert.deepEqual(reread.workflow, patient.workflow);
assert.equal(
  (await patientClient.call("/patient/record")).body.workflow,
  undefined,
);
assert.equal(
  (
    await patientClient.call("/patient/commands", "POST", {
      commandId: randomUUID(),
      expectedRevision: patient.revision,
      mutation: assignedResult,
    })
  ).status,
  403,
);
ok(
  "context changes invalidate proposals without erasing history; workflow persists in PostgreSQL and patient API cannot access internal decisions",
);

// Real source forms remain synthetic demonstrations without clinical activation.
// flowCommand compares the full workflow/plan/referrals and checks every valid
// replay or rejected command for duplication and mutation, respectively.
const gadProtocol = clinicalProtocols.find((p) => p.scale === "GAD-7");
const phqProtocol = clinicalProtocols.find((p) => p.scale === "PHQ-9");
assert.ok(gadProtocol && phqProtocol);
let realSequence = 0;
const realStart = Date.now() - 30 * 60 * 1000;
function realSubmission(protocol, answers, extra = {}) {
  return {
    type: "workflow.submit",
    value: {
      id: randomUUID(),
      protocolVersion: protocol.version,
      measuredAt: new Date(realStart + ++realSequence * 1000).toISOString(),
      answers,
      state: "completed",
      safety: "no",
      immediateDanger: "no",
      note: "Синтетический эталон клинической формы",
      assignmentId: "",
      ...extra,
    },
  };
}
function latestReal() {
  return patient.workflow.assessments.at(-1);
}
function scoreAnswers(items, score) {
  return Array.from({ length: items }, (_, i) =>
    Math.min(3, Math.max(0, score - i * 3)),
  );
}
for (const score of [0, 4, 5, 9, 10, 14, 15, 21]) {
  await flowCommand(realSubmission(gadProtocol, scoreAnswers(7, score)));
  const assessment = latestReal();
  assert.equal(assessment.score, score);
  assert.deepEqual(assessment.source, gadProtocol);
  assert.equal(assessment.source.contentHash, gadProtocol.contentHash);
  assert.equal(assessment.source.clinicalApproval, null);
  assert.deepEqual(
    assessment.interpretation,
    describeClinicalScore(gadProtocol, score),
  );
  assert.equal(assessment.interpretation.diagnostic, false);
}
ok(
  "GAD-7 full range and symptom band boundaries preserve exact registered source/hash with HTTP/local parity",
);

for (const [answers, impact, expected] of [
  [Array(9).fill(0), null, 0],
  [Array(9).fill(1), 3, 9],
  [Array(9).fill(1), null, null],
  [Array(9).fill(3), 0, 27],
]) {
  await flowCommand(realSubmission(phqProtocol, answers, { impact }));
  assert.equal(latestReal().score, expected);
  assert.equal(
    latestReal().completeness,
    expected === null ? "partial" : "complete",
  );
  assert.deepEqual(latestReal().source, phqProtocol);
  assert.deepEqual(
    latestReal().interpretation,
    describeClinicalScore(phqProtocol, expected),
  );
}
ok(
  "PHQ-9 impact is required with symptoms, never summed, and exact source/hash survives HTTP persistence",
);

await flowCommand(
  realSubmission(phqProtocol, [0, 0, 0, 0, 0, 0, 0, 0, 1], { impact: 0 }),
);
let realAssessment = latestReal();
assert.equal(realAssessment.score, 1);
assert.deepEqual(
  {
    kind: patient.workflow.safety.at(-1).kind,
    priority: patient.workflow.safety.at(-1).priority,
  },
  { kind: "phq-item9", priority: "important" },
);
assert.ok(
  patient.workflow.recommendations.some(
    (r) =>
      !r.stale &&
      r.assessmentId === realAssessment.id &&
      r.ruleId === "phq9-item9-v1",
  ),
);
assert.ok(
  !patient.workflow.recommendations.some(
    (r) =>
      r.assessmentId === realAssessment.id &&
      r.ruleId === "immediate-danger-v1",
  ),
);
await flowCommand(realSubmission(phqProtocol, [0, 0, 0, 0, 0, 0, 0, 0, null]));
assert.equal(latestReal().score, null);
assert.equal(patient.workflow.safety.at(-1).kind, "not-assessed");
await flowCommand(
  realSubmission(phqProtocol, [null, 0, 0, 0, 0, 0, 0, 0, 1], { impact: 1 }),
);
assert.equal(latestReal().score, null);
assert.equal(patient.workflow.safety.at(-1).kind, "phq-item9");
ok(
  "PHQ item 9 positive at low score requests assessment without declaring crisis; missing and partial answers retain safety semantics",
);

const previousReferrals = patient.referrals.length;
await flowCommand(
  realSubmission(phqProtocol, Array(9).fill(0), { immediateDanger: "yes" }),
);
assert.equal(latestReal().score, 0);
assert.equal(patient.workflow.safety.at(-1).kind, "immediate-danger");
assert.equal(patient.workflow.safety.at(-1).priority, "urgent");
let realRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.ruleId === "immediate-danger-v1",
);
assert.ok(realRec);
assert.equal(realRec.referralCategory, "required");
assert.equal(realRec.ruleVersion, "clinical-review-2026-10-26-v2");
assert.equal(patient.referrals.length, previousReferrals);
await flowCommand({
  type: "workflow.decide",
  id: realRec.id,
  expectedVersion: realRec.version,
  decision: "accept",
  reason: "",
  action: realRec.action,
  dueDate: "",
  destination: realRec.destination,
});
realRec = patient.workflow.recommendations.find((r) => r.id === realRec.id);
assert.equal(patient.referrals.at(-1).category, "required");
assert.equal(patient.referrals.at(-1).status, "draft");
assert.ok(patient.referrals.at(-1).rationale.includes(phqProtocol.version));
await flowCommand({
  type: "workflow.execute",
  id: realRec.id,
  expectedVersion: realRec.version,
  confirmation: true,
});
assert.equal(patient.referrals.at(-1).status, "issued");
ok(
  "immediate danger overrides zero scale score and creates a required urgent referral only through separate doctor decision and confirmation",
);

await flowCommand(realSubmission(gadProtocol, Array(7).fill(1)));
const gadEarlier = latestReal();
await flowCommand(realSubmission(phqProtocol, Array(9).fill(0)));
const phqEarlier = latestReal();
await flowCommand(realSubmission(gadProtocol, Array(7).fill(2)));
assert.equal(
  workflowComparison(patient, latestReal().id).previous.id,
  gadEarlier.id,
);
await flowCommand(realSubmission(phqProtocol, Array(9).fill(1), { impact: 1 }));
assert.equal(
  workflowComparison(patient, latestReal().id).previous.id,
  phqEarlier.id,
);
const activeScales = patient.workflow.recommendations
  .filter((r) => !r.stale && r.type === "observation")
  .map((r) => r.source.scale)
  .filter(Boolean)
  .sort();
assert.deepEqual(activeScales, ["GAD-7", "PHQ-9"]);
realRec = patient.workflow.recommendations.find(
  (r) =>
    !r.stale &&
    r.type === "next-scale" &&
    r.source.version === phqProtocol.version,
);
assert.ok(realRec);
await flowCommand({
  type: "workflow.decide",
  id: realRec.id,
  expectedVersion: realRec.version,
  decision: "accept",
  reason: "",
  action: "scale",
  dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
});
realRec = patient.workflow.recommendations.find((r) => r.id === realRec.id);
await flowCommand({
  type: "workflow.execute",
  id: realRec.id,
  expectedVersion: realRec.version,
  confirmation: true,
});
assert.equal(
  patient.workflow.assignments.at(-1).protocolVersion,
  phqProtocol.version,
);
assert.notEqual(
  patient.workflow.assignments.at(-1).protocolVersion,
  "synthetic-7-v1",
);
ok(
  "GAD and PHQ proposals coexist, comparisons remain within protocol versions, and issued PHQ assignments retain their protocol",
);

for (const extra of [
  { score: 0 },
  { clinicalApproval: "forged" },
  { source: { ...phqProtocol, clinicalApproval: "forged" } },
  { interpretation: { label: "Безопасно", diagnostic: true } },
  { protocolVersion: "unsupported-form-v999" },
  { impact: 4 },
  { immediateDanger: "safe" },
])
  await flowCommand(realSubmission(phqProtocol, Array(9).fill(0), extra), 400);
for (const answers of [
  Array(8).fill(0),
  [4, 0, 0, 0, 0, 0, 0, 0, 0],
  [true, 0, 0, 0, 0, 0, 0, 0, 0],
  ["1", 0, 0, 0, 0, 0, 0, 0, 0],
])
  await flowCommand(realSubmission(phqProtocol, answers), 400);
await flowCommand(
  {
    type: "profile.update",
    value: { ...patient.profile, birthDate: "2015-01-01" },
  },
  400,
);
// An adult chart still cannot register adult forms measured before age 18.
const childhoodMeasurement = `${Number(patient.profile.birthDate.slice(0, 4)) + 10}-01-01T10:00:00.000Z`;
await flowCommand(
  realSubmission(gadProtocol, Array(7).fill(0), {
    measuredAt: childhoodMeasurement,
  }),
  400,
);
await flowCommand(
  realSubmission(phqProtocol, Array(9).fill(0), {
    measuredAt: childhoodMeasurement,
  }),
  400,
);
ok(
  "real form scores/source/approval cannot be forged; invalid answers and minors reject atomically without changing persisted state",
);

const clinicalOrigin = {
  kind: "clinician",
  reference: "Синтетическое интервью врача",
  quote: "Рабочая гипотеза депрессивного эпизода",
  observedAt: new Date(realStart).toISOString(),
};
const depressionFactId = randomUUID();
const depressionCondition = ICD10_CATALOG.find((c) => c.code === "F32.1");
const gadCondition = ICD10_CATALOG.find((c) => c.code === "F41.1");
assert.ok(depressionCondition && gadCondition);
await flowCommand({
  type: "fact.save",
  value: {
    id: depressionFactId,
    expectedVersion: 0,
    content: {
      category: "diagnosis",
      state: "known",
      condition: depressionCondition,
      diagnosticStatus: "hypothesis",
    },
    origin: clinicalOrigin,
    reason: "",
  },
});
realRec = patient.workflow.recommendations.find(
  (r) =>
    !r.stale &&
    r.ruleId === "depression-assessment-v1" &&
    r.factIds.includes(depressionFactId),
);
assert.ok(realRec);
assert.equal(realRec.action, "discuss");
assert.equal(realRec.type, "clarification");
assert.equal(realRec.title, "Завершить клиническую оценку");
assert.equal(realRec.referralCategory, undefined);
assert.equal(realRec.destination, "");
assert.equal(realRec.priority, "important");
const gadFactId = randomUUID();
await flowCommand({
  type: "fact.save",
  value: {
    id: gadFactId,
    expectedVersion: 0,
    content: {
      category: "diagnosis",
      state: "known",
      condition: gadCondition,
      diagnosticStatus: "confirmed",
    },
    origin: { ...clinicalOrigin, quote: "Подтверждённый ГТР" },
    reason: "",
  },
});
await flowCommand({
  type: "fact.review",
  id: gadFactId,
  expectedVersion: 1,
  decision: "confirm",
  reason: "Проверено на синтетическом интервью",
});
realRec = patient.workflow.recommendations.find(
  (r) =>
    !r.stale && r.ruleId === "gad-followup-v1" && r.factIds.includes(gadFactId),
);
assert.ok(realRec);
assert.equal(realRec.action, "followup");
assert.equal(realRec.referralCategory, undefined);
assert.equal(realRec.priority, "routine");
assert.equal(realRec.destination, "");
assert.equal(realRec.source.clinicalApproval, null);
assert.deepEqual(
  (await doctor.call("/patients")).body.find((p) => p.id === patient.id)
    .workflow,
  patient.workflow,
);
ok(
  "psychiatrist completes depression assessment internally and schedules GAD follow-up without self-referral",
);

// Controlled fixture injection touches this run's synthetic patient only. It
// models persisted records written by an older rule/source version.
function fixtureSql(sql) {
  const cfg = fixtureDatabaseSettings(
    runtime.ConnectionStrings__Doctor,
    process.env.DOCTOR_API_TEST_DATABASE,
  );
  execFileSync(
    process.env.DOCTOR_PSQL ??
      (process.platform === "win32" ? pg("psql") : "psql"),
    [
      "-h",
      cfg.host,
      "-p",
      String(cfg.port),
      "-U",
      cfg.user,
      "-d",
      cfg.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
    ],
    {
      input: sql,
      env: { ...process.env, PGPASSWORD: cfg.password },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
async function fixtureJson(path, value) {
  assert.ok(path.every((part) => /^[a-zA-Z0-9]+$/.test(String(part))));
  fixtureSql(
    `UPDATE patient_records SET document=jsonb_set(document, ${sqlString(`{${path.join(",")}}`)}, ${sqlString(JSON.stringify(value))}::jsonb) WHERE id=${sqlString(patient.id)} AND clinic_id=${sqlString(actor.clinicId)};`,
  );
  patient = (await doctor.call("/patients")).body.find(
    (p) => p.id === patient.id,
  );
}
let guardedRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation" && r.source.scale === "GAD-7",
);
assert.ok(guardedRec);
await fixtureJson(
  [
    "workflow",
    "recommendations",
    patient.workflow.recommendations.indexOf(guardedRec),
    "ruleVersion",
  ],
  "clinical-review-obsolete",
);
await flowCommand(
  {
    type: "workflow.open",
    id: guardedRec.id,
    expectedVersion: guardedRec.version,
  },
  409,
);
await flowCommand(
  {
    type: "workflow.decide",
    id: guardedRec.id,
    expectedVersion: guardedRec.version,
    decision: "accept",
    reason: "",
    action: guardedRec.action,
    dueDate: "",
  },
  409,
);
await flowCommand(
  {
    type: "workflow.execute",
    id: guardedRec.id,
    expectedVersion: guardedRec.version,
    confirmation: true,
  },
  409,
);
const contactsBeforeRefresh = patient.workflow.contacts.length;
const planBeforeRefresh = structuredClone(patient.plan);
const referralsBeforeRefresh = structuredClone(patient.referrals);
await flowCommand({ type: "workflow.refresh" });
assert.equal(patient.workflow.contacts.length, contactsBeforeRefresh);
assert.deepEqual(patient.plan, planBeforeRefresh);
assert.deepEqual(patient.referrals, referralsBeforeRefresh);
assert.equal(
  patient.workflow.recommendations.find((r) => r.id === guardedRec.id).stale,
  true,
);
guardedRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation" && r.source.scale === "GAD-7",
);
assert.ok(guardedRec);
assert.equal(guardedRec.ruleVersion, "clinical-review-2026-10-26-v2");
await fixtureJson(
  [
    "workflow",
    "recommendations",
    patient.workflow.recommendations.indexOf(guardedRec),
    "source",
    "contentHash",
  ],
  "obsolete-source-hash",
);
await flowCommand(
  {
    type: "workflow.open",
    id: guardedRec.id,
    expectedVersion: guardedRec.version,
  },
  409,
);
await flowCommand(
  { type: "workflow.refresh", note: "forged extra field" },
  400,
);
await flowCommand({ type: "workflow.refresh" });
assert.equal(
  patient.workflow.recommendations.find((r) => r.id === guardedRec.id).stale,
  true,
);
assert.ok(
  patient.workflow.recommendations.some(
    (r) =>
      !r.stale &&
      r.type === "observation" &&
      r.source.contentHash === gadProtocol.contentHash,
  ),
);
ok(
  "obsolete persisted rule/source versions reject atomically; refresh replaces stale proposals without contact, plan, or referral actions",
);

// Give the second, explicitly provisioned doctor a real care relationship for
// the same synthetic chart, without changing the psychiatrist's confirmation.
fixtureSql(
  `INSERT INTO care_relationships(patient_id,doctor_id,clinic_id) VALUES(${sqlString(patient.id)},${sqlString(physicianActor.id)},${sqlString(actor.clinicId)}) ON CONFLICT(patient_id,doctor_id) DO UPDATE SET active=true;`,
);
const psychiatristRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.ruleId === "gad-followup-v1",
);
assert.ok(psychiatristRec);
await flowCommand(
  {
    type: "workflow.open",
    id: psychiatristRec.id,
    expectedVersion: psychiatristRec.version,
  },
  409,
  physician,
  physicianActor,
);
await flowCommand({ type: "workflow.refresh" }, 200, physician, physicianActor);
assert.equal(patient.workflow.reviewSpecialty, "physician");
const physicianDepression = patient.workflow.recommendations.find(
  (r) => !r.stale && r.ruleId === "depression-assessment-v1",
);
const physicianGad = patient.workflow.recommendations.find(
  (r) => !r.stale && r.ruleId === "gad-followup-v1",
);
assert.ok(physicianDepression && physicianGad);
assert.equal(physicianDepression.action, "consultation");
assert.equal(physicianDepression.referralCategory, "required");
assert.equal(physicianDepression.destination, "Психиатр");
assert.equal(physicianGad.action, "consultation");
assert.equal(physicianGad.referralCategory, "desirable");
assert.equal(physicianGad.priority, "routine");
await flowCommand({ type: "workflow.refresh" });
assert.equal(patient.workflow.reviewSpecialty, "psychiatrist");
assert.equal(
  patient.workflow.recommendations.find((r) => r.id === physicianDepression.id)
    .stale,
  true,
);
ok(
  "actor specialty invalidates prior proposals and preserves general-physician required/desirable referrals while psychiatrists avoid self-referral",
);

// Exercise a real-scale recommendation whose rationale contains a numerical
// score and severity, then prove those internal fields never reach the patient.
const patientPlanStart = patient.plan.length;
realRec = patient.workflow.recommendations.find(
  (r) => !r.stale && r.type === "observation" && r.source.scale === "PHQ-9",
);
assert.ok(realRec && realRec.rationale.includes("PHQ-9:"));
await flowCommand({
  type: "workflow.decide",
  id: realRec.id,
  expectedVersion: realRec.version,
  decision: "accept",
  reason: "",
  action: realRec.action,
  dueDate: "",
});
realRec = patient.workflow.recommendations.find((r) => r.id === realRec.id);
await flowCommand({
  type: "workflow.execute",
  id: realRec.id,
  expectedVersion: realRec.version,
  confirmation: true,
});
assert.equal(patient.plan.length, patientPlanStart + 1);
const internalScalePlan = patient.plan.find((p) => p.id === realRec.effectId);
assert.ok(internalScalePlan.details.includes("PHQ-9:"));
assert.ok(internalScalePlan.rationale.includes("выраженность"));
const privateDoctorSnapshot = structuredClone(patient);
const projected = (await patientClient.call("/patient/record")).body;
assert.equal(projected.workflow, undefined);
assert.equal(projected.referrals, undefined);
assert.equal(projected.measurements, undefined);
const patientScalePlan = projected.plan.find(
  (p) => p.id === internalScalePlan.id,
);
assert.ok(patientScalePlan);
assert.equal(
  patientScalePlan.patientInstructions,
  internalScalePlan.patientInstructions,
);
for (const row of projected.plan) {
  for (const privateField of [
    "rationale",
    "details",
    "source",
    "sourceIds",
    "aviandrReview",
    "score",
    "interpretation",
    "effectSnapshot",
  ])
    assert.equal(
      row[privateField],
      undefined,
      `Patient projection must omit ${privateField}`,
    );
}
const serializedPatient = JSON.stringify(projected);
assert.ok(!serializedPatient.includes(internalScalePlan.details));
assert.ok(!serializedPatient.includes(internalScalePlan.rationale));
assert.deepEqual(
  (await doctor.call("/patients")).body.find((p) => p.id === patient.id),
  privateDoctorSnapshot,
);
ok(
  "confirmed scale follow-up keeps score/severity and referral rationale in doctor history while patient record exposes only explicit patient plan fields",
);

const historicalGad = patient.workflow.assessments.findLast(
  (a) => a.protocolVersion === gadProtocol.version,
);
assert.ok(historicalGad);
await fixtureJson(
  [
    "workflow",
    "assessments",
    patient.workflow.assessments.indexOf(historicalGad),
    "source",
    "contentHash",
  ],
  "persisted-incompatible-source",
);
const gadProposalIndexes = patient.workflow.recommendations.flatMap((r, i) =>
  !r.stale && r.assessmentId === historicalGad.id ? [i] : [],
);
for (const index of gadProposalIndexes)
  await fixtureJson(
    ["workflow", "recommendations", index, "source", "contentHash"],
    "persisted-incompatible-source",
  );
const historicalBeforeRefresh = structuredClone(patient.workflow.assessments);
await flowCommand({ type: "workflow.refresh" });
assert.deepEqual(patient.workflow.assessments, historicalBeforeRefresh);
const refreshedGad = patient.workflow.recommendations.filter(
  (r) => !r.stale && r.assessmentId === historicalGad.id,
);
assert.equal(refreshedGad.length, 1);
assert.equal(refreshedGad[0].ruleId, "source-review-v1");
assert.equal(refreshedGad[0].action, "verify");
assert.equal(refreshedGad[0].source.contentHash, gadProtocol.contentHash);
assert.equal(refreshedGad[0].source.clinicalApproval, null);
ok(
  "historical form source mismatch preserves assessment history and regenerates only a source clarification, without clinical routing",
);

// Clinical support and adherence use a separate synthetic chart, never fixtures
// belonging to a real patient or a different run.
const supportCreated = await doctor.call("/patients", "POST", {
  id: randomUUID(),
  profile: {
    name: "Синтетический пациент поддержки и приверженности",
    birthDate: "1990-01-01",
  },
});
assert.equal(supportCreated.status, 201);
patient = supportCreated.body;
const supportVisit = createVisit(randomUUID(), new Date().toISOString(), actor);
supportVisit.status = "in-progress";
await flowCommand({ type: "visit.save", value: supportVisit });
const supportAt = new Date(Date.now() - 60_000).toISOString();
const supportInput = (extra = {}) => ({
  ...newSupportInput(),
  functioning: "preserved",
  response: "not-started",
  ...extra,
});
const obs = (key, answer, provenance = "clinician") => ({
  key,
  answer,
  provenance,
  observedAt: supportAt,
  note: "Синтетическое интервью",
});
await flowCommand({
  type: "support.evaluate",
  id: "support-initial",
  input: supportInput(),
});
let evaluation = patient.clinicalSupport.evaluations.at(-1);
assert.equal(evaluation.catalogVersion, supportCatalog.version);
assert.deepEqual(evaluation.sources, supportCatalog.sources);
assert.ok(evaluation.result.findings.some((f) => f.id === "safety-unknown"));
assert.ok(
  evaluation.result.options
    .filter((o) => o.kind === "medication")
    .every((o) => o.status === "clarify"),
);
assert.equal(patient.plan.length, 0);
for (const bad of [
  {
    type: "support.evaluate",
    id: "forged-result",
    input: supportInput(),
    result: evaluation.result,
  },
  {
    type: "support.evaluate",
    id: "forged-source",
    input: { ...supportInput(), sources: supportCatalog.sources },
  },
  {
    type: "support.evaluate",
    id: "future-observation",
    input: supportInput({
      observations: [
        {
          ...obs("maniaHistory", "no"),
          observedAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
    }),
  },
  {
    type: "support.evaluate",
    id: "duplicate-signal",
    input: supportInput({
      observations: [obs("psychosis", "no"), obs("psychosis", "yes")],
    }),
  },
  { type: "support.unknown", id: "unsupported", input: supportInput() },
])
  await flowCommand(bad, 400);
ok(
  "clinical support computes literature options and source snapshots on server; missing facts, forged outputs and invalid observations preserve atomicity",
);

const obsoleteEvaluationId = evaluation.id;
await fixtureJson(
  ["clinicalSupport", "evaluations", 0, "catalogVersion"],
  "obsolete-support-catalog",
);
const obsoleteSupport = await flowCommand(
  {
    type: "support.decide",
    id: "obsolete-source",
    evaluationId: obsoleteEvaluationId,
    optionId: evaluation.result.options[0].id,
    decision: "accept",
    reason: "",
  },
  400,
);
assert.match(obsoleteSupport.body.detail, /Оценка устарела/);
await flowCommand({
  type: "support.evaluate",
  id: "support-current",
  input: supportInput(),
});
evaluation = patient.clinicalSupport.evaluations.at(-1);
const cbtOption = evaluation.result.options.find(
  (o) => o.kind === "psychotherapy",
);
assert.ok(cbtOption);
await flowCommand({
  type: "support.decide",
  id: "cbt-accept",
  evaluationId: evaluation.id,
  optionId: cbtOption.id,
  decision: "accept",
  reason: "Обсуждён вариант",
});
let supportPlan = patient.plan.at(-1);
assert.equal(supportPlan.status, "draft");
assert.deepEqual(supportPlan.sourceIds, []);
assert.ok(supportPlan.rationale.includes("https://"));
await flowCommand({
  type: "plan.save",
  value: {
    ...supportPlan,
    patientInstructions: "Согласовать работу со специалистом",
  },
});
await flowCommand({ type: "plan.confirm", id: supportPlan.id });
assert.equal(
  patient.plan.find((p) => p.id === supportPlan.id).status,
  "confirmed",
);
await flowCommand(
  {
    type: "support.decide",
    id: "cbt-duplicate",
    evaluationId: evaluation.id,
    optionId: cbtOption.id,
    decision: "accept",
    reason: "",
  },
  400,
);
await flowCommand({
  type: "support.evaluate",
  id: "support-stale",
  input: supportInput(),
});
evaluation = patient.clinicalSupport.evaluations.at(-1);
const followOption =
  evaluation.result.options.find((o) => o.kind === "follow-up") ??
  evaluation.result.options.find((o) => o.kind === "psychotherapy");
await flowCommand({
  type: "support.decide",
  id: "stale-plan",
  evaluationId: evaluation.id,
  optionId: followOption.id,
  decision: "accept",
  reason: "Основания обсуждены",
});
const staleSupportPlan = patient.plan.at(-1);
await flowCommand({
  type: "profile.update",
  value: {
    ...patient.profile,
    goals: "Изменён контекст для проверки устаревания",
  },
});
const staleConfirmation = await flowCommand(
  { type: "plan.confirm", id: staleSupportPlan.id },
  400,
);
assert.match(staleConfirmation.body.detail, /Основания проекта изменились/);
await flowCommand(
  {
    type: "support.decide",
    id: "stale-decision",
    evaluationId: evaluation.id,
    optionId: evaluation.result.options[1].id,
    decision: "accept",
    reason: "Подмена старой оценки",
  },
  400,
);
ok(
  "support acceptance creates a source-backed draft; separate confirmation works and changed clinical context prevents stale decisions or confirmation",
);

const dangerInput = supportInput({
  observations: [obs("suicidalIntent", "yes", "patient")],
});
await flowCommand({
  type: "support.evaluate",
  id: "support-danger",
  input: dangerInput,
});
evaluation = patient.clinicalSupport.evaluations.at(-1);
assert.ok(evaluation.result.options.every((o) => o.status === "defer"));
assert.equal(
  patient.events.filter((e) => e.relatedId === "clinical-risk-immediate-danger")
    .length,
  1,
);
await flowCommand({
  type: "support.evaluate",
  id: "support-danger-again",
  input: dangerInput,
});
assert.equal(
  patient.events.filter((e) => e.relatedId === "clinical-risk-immediate-danger")
    .length,
  1,
);
evaluation = patient.clinicalSupport.evaluations.at(-1);
await flowCommand({
  type: "support.route",
  id: "danger-route",
  evaluationId: evaluation.id,
  findingId: "immediate-danger",
  decision: "accept",
  reason: "",
});
const supportReferral = patient.referrals.at(-1);
assert.equal(supportReferral.status, "draft");
assert.equal(supportReferral.category, "required");
assert.equal(supportReferral.urgency, "urgent");
await flowCommand({
  type: "referral.save",
  value: { ...supportReferral, status: "issued" },
});
assert.equal(patient.referrals.at(-1).status, "issued");
await flowCommand({
  type: "support.evaluate",
  id: "support-route-stale",
  input: dangerInput,
});
evaluation = patient.clinicalSupport.evaluations.at(-1);
await flowCommand({
  type: "support.route",
  id: "stale-route",
  evaluationId: evaluation.id,
  findingId: "immediate-danger",
  decision: "accept",
  reason: "",
});
const staleSupportReferral = patient.referrals.at(-1);
await flowCommand({
  type: "profile.update",
  value: { ...patient.profile, goals: "Изменён контекст направления" },
});
const staleIssuance = await flowCommand(
  {
    type: "referral.save",
    value: { ...staleSupportReferral, status: "issued" },
  },
  400,
);
assert.match(staleIssuance.body.detail, /Основания направления изменились/);
ok(
  "structured danger defers standard therapy, deduplicates open safety events, and routes through a draft with current-source confirmation guards",
);

const adverseInput = (extra = {}) => ({
  symptoms: "Синтетическая тошнота",
  onsetAt: supportAt,
  suspectPlanIds: [],
  severity: "severe",
  seriousness: "unknown",
  criteria: [],
  outcome: "ongoing",
  dechallenge: "not-done",
  rechallenge: "not-done",
  causality: "unassessed",
  provenance: "patient",
  assessment: "",
  ...extra,
});
await flowCommand({
  type: "support.adverse",
  id: "adverse-1",
  expectedVersion: 0,
  input: adverseInput(),
  reason: "",
});
assert.equal(
  patient.events.find((e) => e.id === "cs-event-adverse-1").urgency,
  "important",
);
await flowCommand({
  type: "support.adverse",
  id: "adverse-1",
  expectedVersion: 1,
  input: adverseInput({
    severity: "moderate",
    seriousness: "serious",
    criteria: ["hospitalization"],
  }),
  reason: "Уточнена госпитализация вследствие события",
});
assert.equal(patient.clinicalSupport.adverseEvents[0].versions.length, 2);
assert.equal(
  patient.clinicalSupport.adverseEvents[0].versions[0].input.seriousness,
  "unknown",
);
assert.equal(
  patient.events.find((e) => e.id === "cs-event-adverse-1").urgency,
  "urgent",
);
for (const bad of [
  { ...adverseInput(), seriousness: "serious", criteria: [] },
  { ...adverseInput(), seriousness: "not-serious", criteria: ["death"] },
  { ...adverseInput(), outcome: "fatal" },
  { ...adverseInput(), causality: "certain", assessment: "" },
])
  await flowCommand(
    {
      type: "support.adverse",
      id: "bad-adverse",
      expectedVersion: 0,
      input: bad,
      reason: "",
    },
    400,
  );
await flowCommand(
  {
    type: "support.adverse",
    id: "adverse-1",
    expectedVersion: 1,
    input: adverseInput(),
    reason: "Старая версия",
  },
  400,
);
ok(
  "adverse events keep intensity, seriousness and causality separate; corrections preserve prior input and invalid criteria/fatal outcomes/causality reject atomically",
);

await flowCommand({
  type: "support.evaluate",
  id: "danger-still-open",
  input: supportInput(),
});
assert.ok(
  patient.clinicalSupport.evaluations
    .at(-1)
    .result.options.every((o) => o.status === "defer"),
);
for (const event of patient.events.filter(
  (e) => e.relatedId === "clinical-risk-immediate-danger",
)) {
  for (const status of ["acknowledged", "assessed", "acted"])
    await flowCommand({
      type: "event.transition",
      id: event.id,
      status,
      note: "Синтетическое подтверждение этапа очной оценки",
    });
}
const reviewedAdverseId = "cs-event-adverse-1";
for (const status of ["acknowledged", "assessed", "acted"])
  await flowCommand({
    type: "event.transition",
    id: reviewedAdverseId,
    status,
    note: "Предыдущее клиническое действие",
  });
await flowCommand({
  type: "support.adverse",
  id: "adverse-1",
  expectedVersion: 2,
  input: adverseInput({
    symptoms: "Повторная тошнота",
    seriousness: "serious",
    criteria: ["hospitalization"],
  }),
  reason: "Уточнены проявления",
});
const reopenedAdverse = patient.events.find((e) => e.id === reviewedAdverseId);
assert.equal(reopenedAdverse.status, "created");
assert.equal(reopenedAdverse.action, "");
assert.ok(
  reopenedAdverse.history.some((h) =>
    h.note.includes("Предыдущее клиническое действие"),
  ),
);
ok(
  "a negative form cannot clear unresolved danger; revised adverse events reopen clinical assessment while preserving prior actions",
);

await flowCommand({
  type: "support.evaluate",
  id: "medication-choice",
  input: supportInput({
    observations: [
      obs("maniaHistory", "no"),
      obs("medicationListComplete", "yes"),
    ],
  }),
});
evaluation = patient.clinicalSupport.evaluations.at(-1);
const medicationOption =
  evaluation.result.options.find((o) => o.id === "ssri") ??
  evaluation.result.options.find((o) => o.kind === "medication");
assert.ok(medicationOption && medicationOption.status !== "defer");
await flowCommand({
  type: "support.decide",
  id: "medication-project",
  evaluationId: evaluation.id,
  optionId: medicationOption.id,
  decision: "accept",
  reason: "Применимость требует отдельной сверки; синтетическое решение",
});
const medicationProject = patient.plan.at(-1);
await flowCommand({
  type: "plan.save",
  value: {
    ...medicationProject,
    visitId: supportVisit.id,
    title: otherMedicine.tradeName,
    medicine: otherMedicine,
    dose: "Синтетическая доза",
    schedule: "По плану врача",
    instructionUrl: "https://grls.minzdrav.gov.ru/",
    patientInstructions: "Синтетический пример",
  },
});
const wrongClass = await flowCommand(
  { type: "plan.confirm", id: medicationProject.id },
  400,
);
assert.match(wrongClass.body.detail, /рассматриваемой группы/);
ok(
  "medication support produces an unsigned draft and prevents confirming an unrelated registered medicine through the option decision",
);

const standaloneMedicine = {
  ...patient.plan.find((p) => p.id === medicationProject.id),
  id: "adherence-medication",
  title: otherMedicine.tradeName,
  medicine: otherMedicine,
};
await flowCommand({ type: "plan.save", value: standaloneMedicine });
await flowCommand({
  type: "fact.save",
  value: {
    id: "candidate-allergy",
    expectedVersion: 0,
    content: {
      category: "allergy",
      state: "known",
      substance: otherMedicine.inn,
      reaction: "Синтетическое сообщение о сыпи",
    },
    origin: {
      kind: "patient",
      reference: "Самоотчёт",
      quote: "Синтетическое сообщение: после препарата появилась сыпь",
      observedAt: supportAt,
    },
    reason: "",
  },
});
const allergyBlocked = await flowCommand(
  { type: "plan.confirm", id: standaloneMedicine.id },
  400,
);
assert.match(allergyBlocked.body.detail, /аллерг/i);
await flowCommand({
  type: "fact.review",
  id: "candidate-allergy",
  expectedVersion: 1,
  decision: "inactivate",
  reason:
    "Синтетический сценарий: запись относится к другому средству, уточнено врачом",
});
await flowCommand({ type: "plan.confirm", id: standaloneMedicine.id });
assert.equal(
  patient.clinicalFacts.find((f) => f.id === "candidate-allergy").versions
    .length,
  2,
);
ok(
  "an active patient-reported allergy blocks confirming the exact selected medicine; reviewed correction preserves the original fact",
);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const endDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
// An old confirmed prescription is a controlled fixture; new UI commands must
// never backdate a schedule before its actual confirmation.
const adherencePlanIndex = patient.plan.findIndex(
  (p) => p.id === standaloneMedicine.id,
);
await fixtureJson(
  ["plan", adherencePlanIndex, "confirmedAt"],
  `${yesterday}T00:00:00.000Z`,
);
const scheduleCommand = {
  type: "adherence.schedule",
  value: {
    id: "adherence-schedule",
    expectedVersion: 0,
    planId: standaloneMedicine.id,
    times: ["09:00", "21:00"],
    offsetMinutes: 180,
    effectiveFrom: `${yesterday}T00:00:00.000Z`,
    endDate,
    reason: "Уточнено время приёма",
  },
};
await flowCommand(scheduleCommand);
const firstPlanned = `${yesterday}T06:00:00.000Z`;
const recordCommand = {
  type: "adherence.record",
  value: {
    scheduleId: "adherence-schedule",
    scheduleVersion: 1,
    plannedAt: firstPlanned,
    status: "missed",
    reportedAt: new Date().toISOString(),
    provenance: "patient",
    reason: "",
    expectedVersion: 0,
  },
};
await flowCommand(recordCommand);
await flowCommand({
  type: "adherence.record",
  value: {
    ...recordCommand.value,
    status: "taken",
    expectedVersion: 1,
    reason: "Пациент уточнил первоначальную отметку",
  },
});
assert.deepEqual(
  patient.adherence.records[0].history.map((h) => h.status),
  ["missed", "taken"],
);
await flowCommand(
  {
    type: "adherence.record",
    value: { ...recordCommand.value, expectedVersion: 0 },
  },
  400,
);
await flowCommand(
  {
    type: "adherence.record",
    value: { ...recordCommand.value, plannedAt: `${endDate}T06:00:00.000Z` },
  },
  400,
);
await flowCommand(
  {
    type: "adherence.schedule",
    value: { ...scheduleCommand.value, id: "forged-schedule", percentage: 100 },
  },
  400,
);
await flowCommand(
  {
    type: "adherence.schedule",
    value: { ...scheduleCommand.value, id: "invalid-times", times: ["9:00"] },
  },
  400,
);
await flowCommand(
  {
    type: "adherence.record",
    value: {
      ...recordCommand.value,
      plannedAt: `${yesterday}T18:00:00.000Z`,
      status: "not-applicable",
      reason: "",
    },
  },
  400,
);
const fromV2 = new Date(Date.now() + 60_000).toISOString();
await flowCommand({
  type: "adherence.schedule",
  value: {
    ...scheduleCommand.value,
    expectedVersion: 1,
    effectiveFrom: fromV2,
    times: ["15:00"],
    reason: "Новая версия расписания",
  },
});
assert.equal(patient.adherence.schedules.length, 2);
assert.equal(patient.adherence.schedules[0].effectiveUntil, fromV2);
const adherenceBeforeStop = structuredClone(patient.adherence);
await flowCommand({
  type: "plan.status",
  id: standaloneMedicine.id,
  status: "stopped",
  reason: "Синтетическая отмена врачом",
  visitId: supportVisit.id,
});
assert.ok(
  patient.adherence.schedules.every((s) => s.effectiveUntil && s.closedAt),
);
assert.deepEqual(patient.adherence.records, adherenceBeforeStop.records);
assert.equal(patient.adherence.schedules[0].planSnapshot.status, "confirmed");
const summarized = adherenceSummary(
  patient,
  yesterday,
  endDate,
  patient.updatedAt,
);
assert.equal(summarized.taken, 1);
assert.equal(summarized.missed, 0);
assert.ok(summarized.unknown > 0);
assert.equal(summarized.percentage, 100 / summarized.applicable);
ok(
  "adherence validates confirmed prescription snapshots and due slots, preserves corrected history, excludes future and closes revised schedules on medication stop without inventing missed doses",
);

const privateClient = client();
const privateEmail = `support-patient-${suffix}@example.test`;
const privatePassword = randomUUID();
provision({
  id: `support-patient-${suffix}`,
  clinicId: actor.clinicId,
  email: privateEmail,
  password: privatePassword,
  specialty: "patient",
  patientId: patient.id,
});
await privateClient.login(privateEmail, privatePassword, true);
const privateProjection = (await privateClient.call("/patient/record")).body;
assert.equal(privateProjection.clinicalSupport, undefined);
assert.equal(privateProjection.adherence, undefined);
assert.equal(privateProjection.events, undefined);
for (const mutation of [
  { type: "support.evaluate", id: "patient-forged", input: supportInput() },
  recordCommand,
]) {
  const beforeForbidden = structuredClone(patient);
  assert.equal(
    (
      await privateClient.call("/patient/commands", "POST", {
        commandId: randomUUID(),
        expectedRevision: patient.revision,
        mutation,
      })
    ).status,
    403,
  );
  assert.deepEqual(
    (await doctor.call("/patients")).body.find((p) => p.id === patient.id),
    beforeForbidden,
  );
}
ok(
  "patient projection excludes clinical-support and adherence internals and patient commands cannot evaluate treatment or forge adherence records",
);
const ageBounds = patientBirthDateBounds();
const adjacentDate = (day, delta) => {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};
const ageProfile = structuredClone(patient.profile);
for (const birthDate of [
  adjacentDate(ageBounds.max, 1),
  adjacentDate(ageBounds.min, -1),
  "1626-01-01",
]) {
  const before = structuredClone(patient);
  assert.equal(
    (
      await doctor.call("/patients", "POST", {
        id: randomUUID(),
        profile: { name: "Проверка возраста", birthDate },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await command({
        type: "profile.update",
        value: { ...patient.profile, birthDate },
      })
    ).status,
    400,
  );
  assert.deepEqual(patient, before);
}
ok(
  "API rejects ages below 18 and above 120 on creation and profile edits without changing the chart",
);
for (const birthDate of [ageBounds.min, ageBounds.max]) {
  assert.equal(
    (
      await command({
        type: "profile.update",
        value: { ...patient.profile, birthDate },
      })
    ).status,
    200,
  );
  assert.equal(patient.profile.birthDate, birthDate);
}
assert.equal(
  (await command({ type: "profile.update", value: ageProfile })).status,
  200,
);
ok(
  "API accepts exact inclusive age boundaries 18 and 120 and preserves the remaining profile",
);
const questionnaireVisit = createVisit(
  randomUUID(),
  new Date().toISOString(),
  actor,
);
await flowCommand({
  type: "consent.add",
  value: {
    id: randomUUID(),
    createdAt: "",
    author: "",
    purpose: "care",
    status: "documented",
    signedOn: new Date().toISOString().slice(0, 10),
    documentReference: "Синтетический документ проверки приёма",
    person: "Синтетический пациент",
    scope: "Приём",
    informing: "Техническая проверка снимка результата",
  },
});
questionnaireVisit.status = "in-progress";
questionnaireVisit.reason = "Проверка шкалы в приёме";
questionnaireVisit.notes.safetyConclusion =
  "Синтетическая запись оценки рисков";
questionnaireVisit.notes.conclusion = "Техническая проверка связи результата";
questionnaireVisit.notes.recommendations = "Контрольная запись";
await flowCommand({ type: "visit.save", value: questionnaireVisit });
for (const visitId of [
  randomUUID(),
  null,
  123,
  patient.visits.find((v) => v.status === "completed")?.id,
]) {
  if (visitId === undefined) continue;
  await flowCommand(
    realSubmission(gadProtocol, Array(7).fill(0), {
      visitId,
      safety: "no",
      immediateDanger: "no",
    }),
    400,
  );
}
const linkedSubmission = realSubmission(gadProtocol, Array(7).fill(1), {
  visitId: questionnaireVisit.id,
  safety: "no",
  immediateDanger: "no",
});
await flowCommand(linkedSubmission);
assert.equal(
  patient.workflow.assessments.at(-1).visitId,
  questionnaireVisit.id,
);
await flowCommand({ type: "visit.complete", id: questionnaireVisit.id });
const linkedSnapshot = structuredClone(
  patient.visits.find((v) => v.id === questionnaireVisit.id).completionSnapshot,
);
assert.equal(
  linkedSnapshot.measurements.find(
    (m) => m.id === `workflow:${linkedSubmission.value.id}`,
  ).score,
  7,
);
assert.equal(
  patient.measurements.some(
    (m) => m.id === `workflow:${linkedSubmission.value.id}`,
  ),
  false,
);
await flowCommand(
  realSubmission(gadProtocol, Array(7).fill(0), {
    visitId: questionnaireVisit.id,
    safety: "no",
    immediateDanger: "no",
  }),
  400,
);
await flowCommand({
  type: "visit.print",
  id: questionnaireVisit.id,
  reason: "Проверка неизменяемого снимка",
});
await flowCommand(
  realSubmission(gadProtocol, Array(7).fill(0), {
    safety: "no",
    immediateDanger: "no",
  }),
);
assert.deepEqual(
  patient.visits.find((v) => v.id === questionnaireVisit.id).completionSnapshot,
  linkedSnapshot,
);
ok(
  "questionnaires keep encounter association, reject foreign/read-only links and freeze stored scores in completed snapshots without duplicate measurements, with API/local parity",
);
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
