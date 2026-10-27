import type { PatientChatRow } from "./patientChatView.ts";

export function doctorInboxCard(rows: PatientChatRow[], available: boolean) {
  const last = rows.at(-1);
  return {
    available,
    preview: !available
      ? "Подключите план врача по коду приглашения"
      : last
        ? `${last.state === "pending" ? "Ожидает отправки: " : last.direction === "patient" ? "Вы: " : ""}${last.text}`
        : "Здесь появятся ваши сообщения и ответы врача",
    time: available ? (last?.createdAt ?? null) : null,
  };
}
