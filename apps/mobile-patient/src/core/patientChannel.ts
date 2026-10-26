import { createPatientReader, PatientApiError } from "./patientGateway.ts";
import type { PatientOutboxOwner } from "./patientOutbox.ts";
import {
  decodePatientPlan,
  type PatientPlanProjection,
} from "./patientPlanProjection.ts";
import {
  decodePatientDoses,
  type PatientDoses,
} from "./patientDoseSchedule.ts";
import type { PatientReport } from "./patientReportSync.ts";
import { decodePatientReports } from "./patientReportRecovery.ts";
import {
  decodePatientQuestionnaires,
  type PatientQuestionnaires,
  type PatientQuestionnaireResult,
} from "./patientQuestionnaireSync.ts";
export type ServerMessage = {
  id: string;
  direction: "doctor" | "patient";
  text: string;
  status: "recorded" | "delivered" | "read";
  createdAt: string;
};
export type PatientSnapshot = {
  patientId: string;
  name: string;
  messages: ServerMessage[];
  plan: PatientPlanProjection;
  doses: PatientDoses;
  questionnaires: PatientQuestionnaires;
  reports: ReturnType<typeof decodePatientReports>;
};
export type PatientDoseUpdate = {
  scheduleId: string;
  scheduleVersion: number;
  plannedAt: string;
  status: "taken" | "missed" | "unknown";
  reportedAt: string;
  expectedVersion: number;
  reason: string;
};
type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};
type RequestPort = (url: string, options: RequestInit) => Promise<JsonResponse>;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const cancelled = () => {
  const error = new Error("Запрос отменён");
  error.name = "AbortError";
  return error;
};
/** Inert until connect; lock cancels every pending response, including native fetch polyfills. */
export function createPatientChannel(options: {
  baseUrl: string;
  allowLocalHttp?: boolean;
  request?: RequestPort;
}) {
  createPatientReader(options); // Reuse the explicit-origin/TLS validation; no requests.
  const origin = new URL(options.baseUrl).origin;
  const request = options.request ?? ((url, init) => fetch(url, init));
  let generation = 0;
  let snapshotVersion = 0;
  let session: {
    patientId: string;
    token: string;
    owner: PatientOutboxOwner | null;
  } | null = null;
  const pending = new Set<AbortController>();
  function lock() {
    generation++;
    session = null;
    for (const controller of pending) controller.abort();
    pending.clear();
  }
  async function call(
    path: string,
    turn: number,
    body?: unknown,
    token?: string,
  ): Promise<unknown> {
    if (turn !== generation) throw cancelled();
    const controller = new AbortController();
    pending.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    try {
      const response = await request(origin + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { "X-CSRF-TOKEN": token } : {}),
        },
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (turn !== generation) throw cancelled();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) session = null;
        throw new PatientApiError(
          response.status,
          response.status === 401
            ? "Код не подошёл или сессия завершилась. Введите код ещё раз."
            : response.status === 403
              ? "Доступ к карте закрыт."
              : response.status === 429
                ? "Слишком много попыток. Подождите минуту."
                : response.status === 409
                  ? "Данные изменились. Обновите запись и повторите действие."
                  : "Сервер не подтвердил действие. Попробуйте ещё раз.",
        );
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new PatientApiError(502, "Неизвестный формат ответа сервера");
      }
      if (turn !== generation || controller.signal.aborted) throw cancelled();
      return data;
    } catch (error) {
      if (turn !== generation) throw cancelled();
      if (timedOut)
        throw new PatientApiError(0, "Сервер не ответил. Попробуйте ещё раз.");
      if (error instanceof PatientApiError) throw error;
      throw new PatientApiError(
        0,
        "Нет соединения с сервером. Попробуйте ещё раз.",
      );
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
    }
  }
  function snapshot(data: unknown, patientId: string): PatientSnapshot {
    if (
      !object(data) ||
      data.patientId !== patientId ||
      typeof data.name !== "string" ||
      !Array.isArray(data.messages)
    )
      throw new PatientApiError(502, "Неизвестный формат записи пациента");
    const messages = data.messages.map((m): ServerMessage => {
      if (
        !object(m) ||
        typeof m.id !== "string" ||
        !m.id ||
        !["doctor", "patient"].includes(String(m.direction)) ||
        typeof m.text !== "string" ||
        m.text.length > 20000 ||
        !["recorded", "delivered", "read"].includes(String(m.status)) ||
        typeof m.createdAt !== "string"
      )
        throw new PatientApiError(502, "Неизвестный формат сообщения");
      return {
        id: m.id,
        direction: m.direction as ServerMessage["direction"],
        text: m.text,
        status: m.status as ServerMessage["status"],
        createdAt: m.createdAt,
      };
    });
    return {
      patientId,
      name: data.name,
      messages,
      plan: decodePatientPlan(data.plan),
      doses: decodePatientDoses(data.doseSchedules, data.doseRecords),
      questionnaires: decodePatientQuestionnaires(data.questionnaires),
      reports: decodePatientReports(data.reports),
    };
  }
  async function operation(body?: unknown) {
    if (body !== undefined) snapshotVersion++;
    const version = snapshotVersion;
    const pinned = session,
      turn = generation;
    if (!pinned)
      throw new PatientApiError(
        401,
        "Введите код приглашения для связи с врачом",
      );
    const data = await call(
      body === undefined ? "/api/patient/record" : "/api/patient/commands",
      turn,
      body,
      pinned.token,
    );
    if (session !== pinned || version !== snapshotVersion) throw cancelled();
    if (body !== undefined) snapshotVersion++;
    return snapshot(data, pinned.patientId);
  }
  return {
    lock,
    authorized: () => session !== null,
    owner: () => (session?.owner ? { ...session.owner } : null),
    async connect(code: string) {
      lock();
      const turn = generation;
      try {
        if (!code.trim() || code.trim().length > 200)
          throw new PatientApiError(400, "Введите код приглашения");
        const csrf = await call("/api/csrf", turn);
        if (!object(csrf) || typeof csrf.token !== "string" || !csrf.token)
          throw new PatientApiError(502, "Неизвестный формат ответа сервера");
        const access = await call(
          "/api/patient/access",
          turn,
          { code: code.trim() },
          csrf.token,
        );
        if (!object(access) || access.role !== "patient")
          throw new PatientApiError(502, "Неизвестный формат доступа");
        const result = await call("/api/patient/session", turn);
        if (
          !object(result) ||
          !object(result.actor) ||
          result.actor.specialty !== "patient" ||
          typeof result.actor.patientId !== "string" ||
          !result.actor.patientId ||
          typeof result.actor.clinicId !== "string" ||
          typeof result.actor.id !== "string" ||
          typeof result.csrfToken !== "string" ||
          !result.csrfToken
        )
          throw new PatientApiError(502, "Неизвестный формат сессии пациента");
        session = {
          patientId: result.actor.patientId,
          token: result.csrfToken,
          owner: null,
        };
        const confirmed = await operation();
        if (turn !== generation || !session) throw cancelled();
        session.owner = {
          origin,
          patientId: result.actor.patientId,
          clinicId: result.actor.clinicId,
          actorId: result.actor.id,
        };
        return confirmed;
      } catch (error) {
        if (turn === generation) lock();
        throw error;
      }
    },
    read: () => operation(),
    sendQuestionnaire(value: PatientQuestionnaireResult, commandId: string) {
      if (!commandId || value.id !== commandId)
        return Promise.reject(
          new PatientApiError(400, "Некорректный идентификатор опроса"),
        );
      const { id, assignmentId, protocolVersion, measuredAt, answers, impact } =
        value;
      return operation({
        commandId,
        mutation: {
          type: "questionnaire.patient",
          value: {
            id,
            assignmentId,
            protocolVersion,
            measuredAt,
            answers,
            impact,
          },
        },
      });
    },
    sendReport(value: PatientReport, commandId: string) {
      if (!commandId || value.id !== commandId)
        return Promise.reject(
          new PatientApiError(400, "Некорректный идентификатор самоотчёта"),
        );
      const {
        id,
        entityId,
        day,
        formVersion,
        reportedAt,
        fields,
        note,
        label,
      } = value;
      const { feeling, sleep, anxiety, functioning, tolerability } = fields;
      return operation({
        commandId,
        mutation: {
          type: "report.patient",
          value: {
            id,
            entityId,
            day,
            formVersion,
            reportedAt,
            fields: {
              feeling: { valence: feeling.valence, energy: feeling.energy },
              sleep,
              anxiety,
              functioning,
              tolerability,
            },
            note,
            label,
          },
        },
      });
    },
    markDose(value: PatientDoseUpdate, commandId: string) {
      if (
        !commandId ||
        !value.scheduleId ||
        !Number.isInteger(value.scheduleVersion) ||
        value.scheduleVersion < 1 ||
        !Number.isInteger(value.expectedVersion) ||
        value.expectedVersion < 0 ||
        !["taken", "missed", "unknown"].includes(value.status) ||
        (value.status === "unknown" && value.expectedVersion === 0) ||
        !value.plannedAt ||
        !value.reportedAt ||
        typeof value.reason !== "string"
      )
        return Promise.reject(
          new PatientApiError(400, "Проверьте отметку приёма"),
        );
      const {
        scheduleId,
        scheduleVersion,
        plannedAt,
        status,
        reportedAt,
        expectedVersion,
        reason,
      } = value;
      return operation({
        commandId,
        mutation: {
          type: "dose.patient",
          value: {
            scheduleId,
            scheduleVersion,
            plannedAt,
            status,
            reportedAt,
            expectedVersion,
            reason,
          },
        },
      });
    },
    send(text: string, commandId: string) {
      if (!text.trim() || text.trim().length > 20000 || !commandId)
        return Promise.reject(
          new PatientApiError(400, "Введите сообщение до 20000 символов"),
        );
      return operation({
        commandId,
        mutation: { type: "message.patient", text: text.trim() },
      });
    },
  };
}
