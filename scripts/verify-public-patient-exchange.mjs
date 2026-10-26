// Explicitly opt-in: appends labelled synthetic evidence; never seeds or resets a database.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPatientChannel } from "../apps/mobile-patient/src/core/patientChannel.ts";
import { createVisit } from "../apps/web-doctor/src/workspace/commands.ts";
import { clinicalProtocols } from "../apps/web-doctor/src/workspace/clinical-protocols.ts";

assert(
  process.argv.includes("--write-synthetic"),
  "Requires --write-synthetic and a private config path",
);
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
const doctorOrigin = "https://syncli-main.layero.app";
const patientOrigin = "https://176.32.37.10";
const evidence = {
  startedAt: new Date().toISOString(),
  doctorOrigin,
  patientOrigin,
  checks: [],
};
let serverOffset = 0;
const pass = (name) => {
  evidence.checks.push(name);
  console.log("PASS", name);
};
function client(origin) {
  const cookies = new Map();
  let token = "";
  async function request(url, options = {}) {
    assert.equal(new URL(url).origin, origin);
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    headers.set("Origin", origin);
    if (token && !headers.has("X-CSRF-TOKEN"))
      headers.set("X-CSRF-TOKEN", token);
    if (cookies.size)
      headers.set(
        "Cookie",
        [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    const response = await fetch(url, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    if (response.headers.has("Date"))
      serverOffset = Date.parse(response.headers.get("Date")) - Date.now();
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(";", 1)[0],
        at = first.indexOf("=");
      cookies.set(first.slice(0, at), first.slice(at + 1));
    }
    const body = await response.json();
    token = body?.csrfToken ?? body?.token ?? token;
    return {
      ok: response.ok,
      status: response.status,
      json: async () => body,
      body,
    };
  }
  async function call(path, method = "GET", body, expected = 200) {
    const result = await request(origin + "/api" + path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    assert.equal(
      result.status,
      expected,
      `${method} ${path}: HTTP ${result.status}, ${JSON.stringify(result.body)}`,
    );
    return result.body;
  }
  return { request, call };
}
const doctor = client(doctorOrigin),
  patient = client(patientOrigin);
const health = await doctor.call("/health");
assert.equal(health.status, "ready");
assert.equal((await patient.call("/health")).release, health.release);
evidence.release = health.release;
await doctor.call("/csrf");
await doctor.call("/login", "POST", {
  email: config.doctorEmail,
  password: config.doctorPassword,
});
const session = await doctor.call("/session");
let record;
async function refresh() {
  record = (await doctor.call("/patients")).find(
    (p) => p.id === config.patientId,
  );
  assert(record && record.clinicId === session.actor.clinicId);
  assert.match(
    record.profile.name,
    /синтетическ/iu,
    "Only an explicitly synthetic card may be changed",
  );
}
await refresh();
async function command(mutation, commandId = randomUUID()) {
  record = await doctor.call(`/patients/${record.id}/commands`, "POST", {
    commandId,
    expectedRevision: record.revision,
    mutation,
  });
  return record;
}
const channel = createPatientChannel({
  baseUrl: patientOrigin,
  request: patient.request,
});
assert.equal((await channel.connect(config.accessCode)).patientId, record.id);
pass(
  "Layero doctor login and VPS mobile-channel login share the synthetic card",
);
// The workstation clock may lag the VPS. Use its HTTPS Date, allowing for second precision.
const now = () => new Date(Date.now() + serverOffset - 1500).toISOString(),
  day = () => now().slice(0, 10);
const tag = `Синтетическая проверка #55 ${now()}`;
const messageId = randomUUID();
await channel.send(tag, messageId);
await channel.send(tag, messageId);
await refresh();
assert.equal(record.messages.filter((m) => m.id === messageId).length, 1);
const replyId = randomUUID();
await command({ type: "message.send", text: `${tag}: ответ врача` }, replyId);
assert(
  (await channel.read()).messages.some(
    (m) => m.id === replyId && m.direction === "doctor",
  ),
);
pass("Bidirectional messages and duplicate retry");

// Exercise an elapsed real slot without altering the database or backdating confirmation.
const visit = createVisit(randomUUID(), now(), session.actor);
visit.status = "in-progress";
visit.reason = tag;
await command({ type: "visit.save", value: visit });
const medicine = (
  await doctor.call("/terminology/grls?q=" + encodeURIComponent("Сертралин"))
).items[0];
assert(medicine);
const plan = {
  id: randomUUID(),
  visitId: visit.id,
  kind: "medication",
  title: medicine.tradeName,
  medicine,
  details: tag,
  dose: "50 мг",
  schedule: "Однократно в день; техническая синтетическая запись",
  startDate: day(),
  endDate: "",
  dueDate: "",
  status: "draft",
  confirmedAt: "",
  confirmedBy: "",
  changeReason: "",
  replacesId: "",
  instructionUrl: "https://grls.rosminzdrav.ru/",
  patientInstructions: tag,
  rationale: tag,
  sourceIds: [],
};
await command({ type: "plan.save", value: plan });
assert(
  !(await channel.read()).plan.items.some((p) => p.id === plan.id),
  "Draft must not reach the patient",
);
await command({ type: "plan.confirm", id: plan.id });
const confirmedAt = record.plan.find((p) => p.id === plan.id).confirmedAt;
const scheduledAt = new Date(
  Math.ceil(
    Math.max(Date.now() + serverOffset + 2000, Date.parse(confirmedAt) + 2000) /
      60000,
  ) * 60000,
).toISOString();
const scheduleId = randomUUID();
await command({
  type: "adherence.schedule",
  value: {
    id: scheduleId,
    expectedVersion: 0,
    planId: plan.id,
    times: [scheduledAt.slice(11, 16)],
    offsetMinutes: 0,
    effectiveFrom: confirmedAt,
    endDate: scheduledAt.slice(0, 10),
    reason: tag,
  },
});
const visible = await channel.read();
assert(visible.plan.items.some((p) => p.id === plan.id));
assert.equal(visible.doses.kind, "ready");
assert(visible.doses.schedules.some((s) => s.id === scheduleId));
pass(
  "Confirmed medicine and structured schedule reach the mobile projection; draft stays private",
);

const entityId = `report:${randomUUID()}`;
const report = {
  id: randomUUID(),
  entityId,
  day: day(),
  formVersion: "syncli-report-v1",
  reportedAt: now(),
  fields: {
    feeling: { valence: 4, energy: 2 },
    sleep: "Обычно",
    anxiety: 3,
    functioning: 7,
    tolerability: "Без трудностей",
  },
  note: `${tag}: первая версия`,
  label: "Состояние",
};
await channel.sendReport(report, report.id);
await channel.sendReport(report, report.id);
const correction = {
  ...report,
  id: randomUUID(),
  reportedAt: now(),
  note: `${tag}: исправленная версия`,
  fields: { ...report.fields, anxiety: 2 },
};
await channel.sendReport(correction, correction.id);
await refresh();
const reports = record.reports.filter((r) => r.mobile?.entityId === entityId);
assert.equal(reports.length, 2);
assert.deepEqual(
  reports.find((r) => r.id === report.id).mobile.fields,
  report.fields,
);
assert.equal(
  reports.find((r) => r.id === correction.id).mobile.fields.anxiety,
  2,
);
assert.equal(reports[0].sleepHours, null);
pass("Raw mobile self-report, correction history and duplicate retry");

for (const scale of ["gad7", "phq9"]) {
  const protocol = clinicalProtocols.find((p) => p.id === scale);
  await command({
    type: "workflow.submit",
    value: {
      id: randomUUID(),
      protocolVersion: protocol.version,
      measuredAt: now(),
      answers: Array(protocol.items).fill(1),
      ...(scale === "phq9" ? { impact: 1 } : {}),
      state: "completed",
      safety: "unknown",
      immediateDanger: "unknown",
      note: tag,
      assignmentId: "",
    },
  });
  let recommendation = record.workflow.recommendations.find(
    (r) =>
      !r.stale &&
      r.type === "next-scale" &&
      r.source.version === protocol.version,
  );
  assert(recommendation, `${scale}: next-scale recommendation`);
  await command({
    type: "workflow.decide",
    id: recommendation.id,
    expectedVersion: recommendation.version,
    decision: "accept",
    reason: "",
    action: "scale",
    dueDate: day(),
  });
  recommendation = record.workflow.recommendations.find(
    (r) => r.id === recommendation.id,
  );
  await command({
    type: "workflow.execute",
    id: recommendation.id,
    expectedVersion: recommendation.version,
    confirmation: true,
  });
  const assignment = record.workflow.assignments.at(-1);
  const snapshot = await channel.read();
  assert(snapshot.questionnaires.items.some((q) => q.id === assignment.id));
  const result = {
    id: randomUUID(),
    assignmentId: assignment.id,
    protocolVersion: protocol.version,
    measuredAt: now(),
    answers: Array(protocol.items).fill(1),
    impact: scale === "phq9" ? 1 : null,
  };
  await channel.sendQuestionnaire(result, result.id);
  await channel.sendQuestionnaire(result, result.id);
  await refresh();
  const matches = record.workflow.assessments.filter((a) => a.id === result.id);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].answers, result.answers);
  assert.equal(matches[0].assignmentId, assignment.id);
  assert.equal(matches[0].receivedBy.specialty, "patient");
  assert.equal(
    record.workflow.assignments.find((a) => a.id === assignment.id).status,
    "submitted",
  );
  assert.notEqual(record.workflow.reviewSpecialty, "patient");
  pass(
    `${scale}: issued questionnaire, raw answers and duplicate retry visible through Layero`,
  );
}

while (Date.now() + serverOffset < Date.parse(scheduledAt) + 2500) {
  console.log("Waiting for the real scheduled slot");
  await new Promise((resolve) =>
    setTimeout(
      resolve,
      Math.min(
        10000,
        Date.parse(scheduledAt) + 2500 - Date.now() - serverOffset,
      ),
    ),
  );
}
const dose = {
  scheduleId,
  scheduleVersion: 1,
  plannedAt: scheduledAt,
  status: "taken",
  reportedAt: now(),
  expectedVersion: 0,
  reason: "",
};
const doseId = randomUUID();
await channel.markDose(dose, doseId);
await channel.markDose(dose, doseId);
await channel.markDose(
  {
    ...dose,
    status: "missed",
    expectedVersion: 1,
    reportedAt: now(),
    reason: tag,
  },
  randomUUID(),
);
await refresh();
const doses = record.adherence.records.filter(
  (r) => r.scheduleId === scheduleId,
);
assert.equal(doses.length, 1);
assert.equal(doses[0].status, "missed");
assert.equal(doses[0].provenance, "patient");
assert.equal(doses[0].history.length, 2);
assert.equal(doses[0].history[0].status, "taken");
pass(
  "Dose taken, retry without duplicate, corrected to missed with immutable history",
);
channel.lock();
const recovered = await channel.connect(config.accessCode);
assert(recovered.messages.some((m) => m.id === replyId));
assert.equal(recovered.reports.kind, "ready");
pass("Re-login restores server data through the actual mobile decoder");
evidence.completedAt = now();
evidence.patientId = record.id;
evidence.artifacts = {
  visitId: visit.id,
  planId: plan.id,
  scheduleId,
  entityId,
  messageId,
  replyId,
};
if (process.env.EXCHANGE_EVIDENCE_FILE)
  await writeFile(
    process.env.EXCHANGE_EVIDENCE_FILE,
    JSON.stringify(evidence, null, 2) + "\n",
  );
console.log(
  `Completed ${evidence.checks.length} scenarios; labelled synthetic records retained.`,
);
