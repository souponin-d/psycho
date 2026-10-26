import {
  createPatientOutbox,
  type PatientOutboxOwner,
} from "./patientOutbox.ts";
import type { StoragePort } from "./storage.ts";

export class MessageQueuedError extends Error {
  constructor() {
    super("Сообщение сохранено на телефоне и ожидает отправки.");
    this.name = "MessageQueuedError";
  }
}

export function createPatientMessageSync(
  storage: StoragePort,
  owner: PatientOutboxOwner,
  channel: {
    currentOwner: () => PatientOutboxOwner | null;
    send: (text: string, id: string) => Promise<unknown>;
  },
) {
  const expected = { ...owner };
  const outbox = createPatientOutbox(storage, expected, "messages");
  function checkOwner() {
    const current = channel.currentOwner();
    if (
      !current ||
      current.origin !== expected.origin ||
      current.clinicId !== expected.clinicId ||
      current.patientId !== expected.patientId ||
      current.actorId !== expected.actorId
    )
      throw new Error(
        "Подключение изменилось. Войдите в свою учётную запись ещё раз.",
      );
  }
  async function retry() {
    checkOwner();
    await outbox.flush(async (command) => {
      checkOwner();
      if (
        command.mutation.type !== "message.patient" ||
        typeof command.mutation.text !== "string"
      )
        throw new Error("Неизвестная команда в очереди");
      await channel.send(command.mutation.text, command.commandId);
      checkOwner();
    });
  }
  return {
    pending: () => outbox.list(),
    retry,
    async send(text: string, commandId: string) {
      checkOwner();
      if (!text.trim() || text.trim().length > 20000 || !commandId)
        throw new Error("Введите сообщение до 20000 символов");
      await outbox.enqueue({
        commandId,
        mutation: { type: "message.patient", text: text.trim() },
      });
      try {
        await retry();
      } catch {
        throw new MessageQueuedError();
      }
    },
  };
}
