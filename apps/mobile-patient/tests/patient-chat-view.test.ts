import { test } from "node:test";
import assert from "node:assert/strict";
import { chatRows } from "../src/core/patientChatView.ts";

test("серверные сообщения и ожидающие отправки показаны один раз", () => {
  const rows = chatRows(
    [
      {
        id: "m1",
        direction: "patient",
        text: "Первое",
        status: "recorded",
        createdAt: "2026-10-26T10:00:00Z",
      },
      {
        id: "m2",
        direction: "doctor",
        text: "Ответ",
        status: "recorded",
        createdAt: "2026-10-26T10:05:00Z",
      },
    ],
    [
      {
        commandId: "m1",
        mutation: { type: "message.patient", text: "Первое" },
      },
      {
        commandId: "m3",
        mutation: { type: "message.patient", text: "Ожидает" },
      },
    ],
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.state]),
    [
      ["m1", "recorded"],
      ["m2", "recorded"],
      ["m3", "pending"],
    ],
  );
  assert.equal(rows[2]?.text, "Ожидает");
});

test("чужие типы очереди не становятся сообщениями и неизвестное время не выдумывается", () => {
  const rows = chatRows(
    [],
    [
      {
        commandId: "r1",
        mutation: { type: "report.add", text: "Не сообщение" },
      },
      {
        commandId: "m1",
        mutation: { type: "message.patient", text: "Привет" },
      },
    ],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.createdAt, null);
});
