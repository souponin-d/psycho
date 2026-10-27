import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorInboxCard } from "../src/core/doctorInbox.ts";

test("карточка не выдаёт локальный демо-режим за доступ к врачу", () => {
  const card = doctorInboxCard([], false);
  assert.equal(card.available, false);
  assert.equal(card.preview, "Подключите план врача по коду приглашения");
});
test("одна доступная переписка показывается и без сообщений", () => {
  assert.deepEqual(doctorInboxCard([], true), {
    available: true,
    preview: "Здесь появятся ваши сообщения и ответы врача",
    time: null,
  });
});
test("карточка показывает последнее серверное или ожидающее сообщение", () => {
  const rows = [
    {
      id: "1",
      direction: "doctor" as const,
      text: "Ответ врача",
      createdAt: "2026-10-27T08:00:00Z",
      state: "recorded" as const,
    },
  ];
  assert.equal(doctorInboxCard(rows, true).preview, "Ответ врача");
  const pending = {
    id: "2",
    direction: "patient" as const,
    text: "Мой вопрос",
    createdAt: null,
    state: "pending" as const,
  };
  const card = doctorInboxCard([...rows, pending], true);
  assert.equal(card.preview, "Ожидает отправки: Мой вопрос");
  assert.equal(card.time, null);
});
