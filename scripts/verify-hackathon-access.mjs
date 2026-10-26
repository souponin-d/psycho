import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  seed,
  start,
  stop,
  config,
  client,
  sql,
} from "./hackathon-runtime.mjs";
await seed();
let child = await start();
let passed = 0;
const ok = (name) => {
  passed++;
  console.log("PASS " + name);
};
try {
  const p = client();
  await p.call("/csrf");
  let r = await p.call("/patient/access", "POST", { code: config.accessCode });
  assert.equal(
    r.status,
    200,
    "existing invitation field must open a real patient session",
  );
  r = await p.call("/patient/session");
  assert.equal(r.status, 200);
  assert.equal(r.body.actor.patientId, config.patientId);
  assert.equal(r.body.actor.specialty, "patient");
  ok("code creates a patient session bound by server");
  assert.equal((await p.call("/patients")).status, 403);
  assert.equal(
    (await p.call("/patient/record")).body.patientId,
    config.patientId,
  );
  ok("patient cannot enter doctor API");
  const invalid = client();
  await invalid.call("/csrf");
  assert.equal(
    (
      await invalid.call("/patient/access", "POST", {
        code: "INVALID-CODE-123456",
      })
    ).status,
    401,
  );
  assert.equal((await invalid.call("/patient/session")).status, 401);
  ok("wrong code creates no session");
  const noCsrf = client();
  assert.equal(
    (
      await noCsrf.call(
        "/patient/access",
        "POST",
        { code: config.accessCode },
        false,
      )
    ).status,
    400,
  );
  ok("CSRF is required for code login");
  const repeat = client();
  await repeat.call("/csrf");
  assert.equal(
    (
      await repeat.call("/patient/access", "POST", {
        code: config.accessCode,
        patientId: "forged",
        role: "doctor",
      })
    ).status,
    200,
  );
  assert.equal(
    (await repeat.call("/patient/session")).body.actor.patientId,
    config.patientId,
  );
  ok("code is reusable and client identity injection is ignored");
  const id = randomUUID(),
    payload = {
      commandId: id,
      mutation: { type: "message.patient", text: "Проверка связи " + id },
    };
  assert.equal(
    (await p.call("/patient/commands", "POST", payload)).status,
    200,
  );
  assert.equal(
    (await p.call("/patient/commands", "POST", payload)).status,
    200,
  );
  const doctor = client();
  await doctor.login();
  let record = (await doctor.call("/patients")).body.find(
    (x) => x.id === config.patientId,
  );
  assert.equal(record.messages.filter((m) => m.id === id).length, 1);
  ok("patient message reaches doctor through PostgreSQL without duplicate");
  const answer = randomUUID();
  r = await doctor.call(`/patients/${config.patientId}/commands`, "POST", {
    commandId: answer,
    expectedRevision: record.revision,
    mutation: { type: "message.send", text: "Связь подтверждена " + id },
  });
  assert.equal(r.status, 200);
  assert(
    (await p.call("/patient/record")).body.messages.some(
      (m) => m.id === answer && m.direction === "doctor",
    ),
  );
  ok("doctor answer reaches the same patient");
  sql(
    `UPDATE care_relationships SET active=false WHERE patient_id='${config.patientId}'`,
  );
  assert.equal((await p.call("/patient/record")).status, 401);
  sql(
    `UPDATE care_relationships SET active=true WHERE patient_id='${config.patientId}'`,
  );
  ok("revoked care relationship rejects code session");
  await stop(child);
  child = await start({ Hackathon__Enabled: "false" });
  assert.equal((await p.call("/patient/record")).status, 401);
  const disabled = client();
  await disabled.call("/csrf");
  assert.equal(
    (
      await disabled.call("/patient/access", "POST", {
        code: config.accessCode,
      })
    ).status,
    401,
  );
  ok("disabled feature rejects login and existing session");
  const bypass = client();
  await bypass.call("/csrf");
  assert.equal(
    (
      await bypass.call("/login", "POST", {
        email: config.patientUserId + "@example.test",
        password: config.accessCode,
      })
    ).status,
    401,
    "code must not work as a normal account password",
  );
  ok("code cannot bypass disabled mode via generic login");
  await stop(child);
  child = await start({ Hackathon__ExpiresAt: "2020-01-01T00:00:00Z" });
  const expired = client();
  await expired.call("/csrf");
  assert.equal(
    (await expired.call("/patient/access", "POST", { code: config.accessCode }))
      .status,
    401,
  );
  ok("expired access code is rejected");
  await stop(child);
  child = await start({ Hackathon__PatientUserId: config.doctorId });
  const badActor = client();
  await badActor.call("/csrf");
  assert.equal(
    (
      await badActor.call("/patient/access", "POST", {
        code: config.accessCode,
      })
    ).status,
    401,
  );
  ok("configuration cannot turn a doctor into a code patient");
  await stop(child);
  child = await start();
  const limited = client();
  await limited.call("/csrf");
  for (let i = 0; i < 12; i++)
    r = await limited.call("/patient/access", "POST", {
      code: "INVALID-CODE-123456",
    });
  assert.equal(r.status, 429);
  ok("code guessing is rate limited");
  console.log(`PASS: ${passed} HTTP groups against isolated PostgreSQL`);
} finally {
  sql(
    `UPDATE care_relationships SET active=true WHERE patient_id='${config.patientId}'`,
  );
  await stop(child);
}
