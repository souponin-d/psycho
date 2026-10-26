import {
  createPatientOutbox,
  type PatientOutboxCommand,
  type PatientOutboxOwner,
} from "./patientOutbox.ts";
import { PatientApiError } from "./patientGateway.ts";
import type { PatientDoseUpdate } from "./patientChannel.ts";
import type { StoragePort } from "./storage.ts";

export class DoseQueuedError extends Error {
  readonly status: number;
  constructor(cause: unknown) {
    super(
      cause instanceof PatientApiError && cause.status === 409
        ? "Отметка сохранена на телефоне, но план изменился. Обновите данные."
        : "Отметка сохранена на телефоне и ожидает отправки.",
    );
    this.name = "DoseQueuedError";
    this.status = cause instanceof PatientApiError ? cause.status : 0;
  }
}
function doseValue(command: PatientOutboxCommand): PatientDoseUpdate | null {
  const value = command.mutation.value;
  if (
    command.mutation.type !== "dose.patient" ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  )
    return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (key) =>
        ![
          "scheduleId",
          "scheduleVersion",
          "plannedAt",
          "status",
          "reportedAt",
          "expectedVersion",
          "reason",
        ].includes(key),
    ) ||
    typeof v.scheduleId !== "string" ||
    !v.scheduleId ||
    typeof v.scheduleVersion !== "number" ||
    !Number.isInteger(v.scheduleVersion) ||
    v.scheduleVersion < 1 ||
    typeof v.expectedVersion !== "number" ||
    !Number.isInteger(v.expectedVersion) ||
    v.expectedVersion < 0 ||
    v.expectedVersion > 10000 ||
    typeof v.plannedAt !== "string" ||
    !Number.isFinite(Date.parse(v.plannedAt)) ||
    typeof v.reportedAt !== "string" ||
    !Number.isFinite(Date.parse(v.reportedAt)) ||
    !["taken", "missed", "unknown"].includes(String(v.status)) ||
    (v.status === "unknown" && v.expectedVersion === 0) ||
    typeof v.reason !== "string" ||
    v.reason.length > 2000 ||
    (v.expectedVersion > 0 && !v.reason.trim())
  )
    return null;
  return v as PatientDoseUpdate;
}
export function createPatientDoseSync(
  storage: StoragePort,
  owner: PatientOutboxOwner,
  channel: {
    currentOwner: () => PatientOutboxOwner | null;
    send: (value: PatientDoseUpdate, id: string) => Promise<unknown>;
  },
) {
  const expected = { ...owner };
  const outbox = createPatientOutbox(storage, expected, "doses");
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
      const value = doseValue(command);
      if (!value) throw new Error("Неизвестная отметка в очереди");
      await channel.send(value, command.commandId);
      checkOwner();
    });
  }
  return {
    pending: () => outbox.list(),
    retry,
    async cancel(id: string) {
      checkOwner();
      await outbox.remove(id);
    },
    async mark(value: PatientDoseUpdate, id: string) {
      checkOwner();
      const command = {
        commandId: id,
        mutation: { type: "dose.patient", value },
      };
      if (!id || !doseValue(command))
        throw new Error("Проверьте отметку приёма");
      const key = JSON.stringify([
        value.scheduleId,
        value.scheduleVersion,
        new Date(value.plannedAt).toISOString(),
      ]);
      await outbox.enqueue(command, (existing) => {
        const prior = doseValue(existing);
        return (
          !!prior &&
          JSON.stringify([
            prior.scheduleId,
            prior.scheduleVersion,
            new Date(prior.plannedAt).toISOString(),
          ]) === key
        );
      });
      try {
        await retry();
      } catch (error) {
        throw new DoseQueuedError(error);
      }
    },
  };
}
