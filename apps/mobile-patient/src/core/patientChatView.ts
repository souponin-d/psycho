import type { ServerMessage } from "./patientChannel.ts";
import type { PatientOutboxCommand } from "./patientOutbox.ts";

export type PatientChatRow = {
  id: string;
  direction: "patient" | "doctor";
  text: string;
  createdAt: string | null;
  state: ServerMessage["status"] | "pending";
};

export function chatRows(
  messages: ServerMessage[],
  pending: PatientOutboxCommand[],
): PatientChatRow[] {
  const ids = new Set(messages.map((message) => message.id));
  return [
    ...messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      text: message.text,
      createdAt: message.createdAt,
      state: message.status,
    })),
    ...pending
      .filter(
        (command) =>
          !ids.has(command.commandId) &&
          command.mutation.type === "message.patient" &&
          typeof command.mutation.text === "string",
      )
      .map((command) => ({
        id: command.commandId,
        direction: "patient" as const,
        text: command.mutation.text as string,
        createdAt: null,
        state: "pending" as const,
      })),
  ];
}
