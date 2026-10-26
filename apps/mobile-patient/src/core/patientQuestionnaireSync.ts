import { questionnaires } from "../config/questionnaires.ts";
import {
  createPatientOutbox,
  type PatientOutboxOwner,
} from "./patientOutbox.ts";
import { PatientApiError } from "./patientGateway.ts";
import type { StoragePort } from "./storage.ts";
import type { FormId } from "./journeyModel.ts";
export type PatientQuestionnaire = {
  id: string;
  protocolVersion: string;
  dueDate: string;
  status: "issued" | "submitted";
  formId: FormId;
};
export type PatientQuestionnaires =
  { kind: "ready"; items: PatientQuestionnaire[] } | { kind: "unavailable" };
export type PatientQuestionnaireResult = {
  id: string;
  assignmentId: string;
  protocolVersion: string;
  measuredAt: string;
  answers: number[];
  impact: number | null;
};
function formFor(version: string) {
  return Object.values(questionnaires).find((form) => form.version === version);
}
export function decodePatientQuestionnaires(
  raw: unknown,
): PatientQuestionnaires {
  if (!Array.isArray(raw)) return { kind: "unavailable" };
  const items: PatientQuestionnaire[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { kind: "unavailable" };
    const row = value as Record<string, unknown>;
    const form =
      typeof row.protocolVersion === "string"
        ? formFor(row.protocolVersion)
        : undefined;
    if (
      !form ||
      typeof row.id !== "string" ||
      !row.id ||
      typeof row.dueDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) ||
      !Number.isFinite(Date.parse(row.dueDate + "T00:00:00Z")) ||
      !new Date(row.dueDate + "T00:00:00Z")
        .toISOString()
        .startsWith(row.dueDate) ||
      !["issued", "submitted"].includes(String(row.status)) ||
      items.some((a) => a.id === row.id)
    )
      return { kind: "unavailable" };
    items.push({
      id: row.id,
      protocolVersion: form.version,
      dueDate: row.dueDate,
      status: row.status as PatientQuestionnaire["status"],
      formId: form.id,
    });
  }
  return { kind: "ready", items };
}
function valid(value: unknown): value is PatientQuestionnaireResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as PatientQuestionnaireResult,
    form = formFor(v.protocolVersion);
  return (
    !!form &&
    typeof v.id === "string" &&
    !!v.id &&
    v.id.length <= 100 &&
    typeof v.assignmentId === "string" &&
    !!v.assignmentId &&
    v.assignmentId.length <= 100 &&
    Number.isFinite(Date.parse(v.measuredAt)) &&
    Array.isArray(v.answers) &&
    v.answers.length === form.questions.length &&
    v.answers.every((n) => Number.isInteger(n) && n >= 0 && n <= 3) &&
    (form.id === "phq9" && v.answers.some((n) => n > 0)
      ? Number.isInteger(v.impact) && v.impact! >= 0 && v.impact! <= 3
      : v.impact === null)
  );
}
export class QuestionnaireQueuedError extends Error {
  readonly status: number;
  constructor(cause: unknown) {
    super("Ответы сохранены на телефоне и ожидают отправки.");
    this.name = "QuestionnaireQueuedError";
    this.status = cause instanceof PatientApiError ? cause.status : 0;
  }
}
export function createPatientQuestionnaireSync(
  storage: StoragePort,
  owner: PatientOutboxOwner,
  channel: {
    currentOwner: () => PatientOutboxOwner | null;
    send: (value: PatientQuestionnaireResult, id: string) => Promise<unknown>;
  },
) {
  const expected = { ...owner },
    outbox = createPatientOutbox(storage, expected, "questionnaires");
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
        command.mutation.type !== "questionnaire.patient" ||
        !valid(command.mutation.value)
      )
        throw new Error("Неизвестный опрос в очереди");
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
    async send(value: PatientQuestionnaireResult) {
      checkOwner();
      if (!valid(value)) throw new Error("Проверьте ответы опроса.");
      await outbox.enqueue(
        {
          commandId: value.id,
          mutation: { type: "questionnaire.patient", value },
        },
        (existing) =>
          valid(existing.mutation.value) &&
          existing.mutation.value.assignmentId === value.assignmentId,
      );
      try {
        await retry();
      } catch (e) {
        throw new QuestionnaireQueuedError(e);
      }
    },
  };
}
