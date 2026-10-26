import {
  createPatientOutbox,
  type PatientOutboxOwner,
} from "./patientOutbox.ts";
import { PatientApiError } from "./patientGateway.ts";
import type { StoragePort } from "./storage.ts";

export type PatientReport = {
  id: string;
  entityId: string;
  day: string;
  formVersion: "syncli-report-v1";
  reportedAt: string;
  fields: {
    feeling: { valence: number; energy: number };
    sleep: string;
    anxiety: number;
    functioning: number;
    tolerability: string;
  };
  note: string;
  label: string;
};
export class ReportQueuedError extends Error {
  readonly status: number;
  constructor(cause: unknown) {
    super("Самоотчёт сохранён на телефоне и ожидает отправки.");
    this.name = "ReportQueuedError";
    this.status = cause instanceof PatientApiError ? cause.status : 0;
  }
}
export function isPatientReport(value: unknown): value is PatientReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as PatientReport,
    f = v.fields,
    feeling = f?.feeling;
  return (
    typeof v.id === "string" &&
    !!v.id &&
    v.id.length <= 100 &&
    typeof v.entityId === "string" &&
    !!v.entityId &&
    v.entityId.length <= 100 &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.day) &&
    Number.isFinite(Date.parse(v.day + "T00:00:00Z")) &&
    new Date(v.day + "T00:00:00Z").toISOString().startsWith(v.day) &&
    v.formVersion === "syncli-report-v1" &&
    Number.isFinite(Date.parse(v.reportedAt)) &&
    !!feeling &&
    [feeling.valence, feeling.energy].every(
      (x) => Number.isInteger(x) && x >= 0 && x <= 6,
    ) &&
    [f.anxiety, f.functioning].every(
      (x) => Number.isInteger(x) && x >= 0 && x <= 10,
    ) &&
    ["Плохо", "Обычно", "Хорошо"].includes(f.sleep) &&
    ["Без трудностей", "Есть трудности"].includes(f.tolerability) &&
    typeof v.note === "string" &&
    v.note.length <= 2000 &&
    typeof v.label === "string" &&
    v.label.length <= 80
  );
}
export function createPatientReportSync(
  storage: StoragePort,
  owner: PatientOutboxOwner,
  channel: {
    currentOwner: () => PatientOutboxOwner | null;
    send: (value: PatientReport, id: string) => Promise<unknown>;
  },
) {
  const expected = { ...owner },
    outbox = createPatientOutbox(storage, expected, "reports");
  function checkOwner() {
    const current = channel.currentOwner();
    if (
      !current ||
      current.origin !== expected.origin ||
      current.clinicId !== expected.clinicId ||
      current.patientId !== expected.patientId ||
      current.actorId !== expected.actorId
    )
      throw new Error("Подключение изменилось. Войдите ещё раз.");
  }
  async function retry() {
    checkOwner();
    await outbox.flush(async (command) => {
      checkOwner();
      if (
        command.mutation.type !== "report.patient" ||
        !isPatientReport(command.mutation.value)
      )
        throw new Error("Неизвестный самоотчёт в очереди");
      await channel.send(command.mutation.value, command.commandId);
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
    async send(value: PatientReport) {
      checkOwner();
      if (!isPatientReport(value))
        throw new Error("Проверьте ответы самоотчёта.");
      await outbox.enqueue({
        commandId: value.id,
        mutation: { type: "report.patient", value },
      });
      try {
        await retry();
      } catch (e) {
        throw new ReportQueuedError(e);
      }
    },
  };
}
