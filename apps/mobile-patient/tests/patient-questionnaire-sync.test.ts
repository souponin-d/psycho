import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodePatientQuestionnaires,
  createPatientQuestionnaireSync,
  QuestionnaireQueuedError,
} from "../src/core/patientQuestionnaireSync.ts";
const owner = {
  origin: "https://clinic.example",
  clinicId: "c",
  patientId: "p",
  actorId: "a",
};
const version = "GAD7-Russian-for-Russia-source-copy-2022";
const value = {
  id: "q1",
  assignmentId: "a1",
  protocolVersion: version,
  measuredAt: "2026-10-26T12:00:00.000Z",
  answers: [0, 1, 2, 3, 0, 1, 2],
  impact: null,
};
function memory() {
  const m = new Map<string, string>();
  return {
    async getItem(k: string) {
      return m.get(k) ?? null;
    },
    async setItem(k: string, v: string) {
      m.set(k, v);
    },
  };
}
test("распознаёт только известные версии и не подменяет срок задания", () => {
  assert.deepEqual(
    decodePatientQuestionnaires([
      {
        id: "a1",
        protocolVersion: version,
        dueDate: "2026-10-27",
        status: "issued",
      },
    ]),
    {
      kind: "ready",
      items: [
        {
          id: "a1",
          protocolVersion: version,
          dueDate: "2026-10-27",
          status: "issued",
          formId: "gad7",
        },
      ],
    },
  );
  assert.equal(
    decodePatientQuestionnaires([
      {
        id: "a1",
        protocolVersion: "unknown",
        dueDate: "2026-10-27",
        status: "issued",
      },
    ]).kind,
    "unavailable",
  );
  assert.equal(decodePatientQuestionnaires(undefined).kind, "unavailable");
});
test("ответы сохраняются в очереди и повторно отправляются под тем же ID", async () => {
  const storage = memory(),
    sent: string[] = [];
  const offline = createPatientQuestionnaireSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_v, id) => {
      sent.push(id);
      throw Error("offline");
    },
  });
  await assert.rejects(offline.send(value), QuestionnaireQueuedError);
  const online = createPatientQuestionnaireSync(storage, owner, {
    currentOwner: () => owner,
    send: async (_v, id) => {
      sent.push(id);
    },
  });
  await online.retry();
  assert.deepEqual(sent, ["q1", "q1"]);
  assert.deepEqual(await online.pending(), []);
});
test("не отправляет ответы другого пациента и не принимает неполную форму", async () => {
  const storage = memory();
  let active = owner;
  const sync = createPatientQuestionnaireSync(storage, owner, {
    currentOwner: () => active,
    send: async () => {
      throw Error("offline");
    },
  });
  await assert.rejects(sync.send({ ...value, answers: [0] }));
  await assert.rejects(sync.send(value), QuestionnaireQueuedError);
  active = { ...owner, patientId: "other" };
  await assert.rejects(sync.retry());
});
