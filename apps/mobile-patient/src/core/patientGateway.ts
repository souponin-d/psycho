/** Подготовленный reader: не импортируется providers и не делает фоновых запросов. */
type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};
type RequestPort = (url: string, options: RequestInit) => Promise<JsonResponse>;
export class PatientApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "PatientApiError";
    this.status = status;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function checkAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  // React Native's abort-controller polyfill has no throwIfAborted/reason.
  const error = new Error("Запрос отменён");
  error.name = "AbortError";
  throw error;
}
export function createPatientReader(options: {
  baseUrl: string;
  allowLocalHttp?: boolean;
  request?: RequestPort;
}) {
  const url = new URL(options.baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]", "10.0.2.2"].includes(
    url.hostname,
  );
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && local && options.allowLocalHttp)
    )
  )
    throw new Error("Нужен HTTPS-адрес сервера без пути и учётных данных");
  const request = options.request ?? ((address, init) => fetch(address, init));
  async function get(path: string, signal?: AbortSignal): Promise<unknown> {
    checkAborted(signal);
    let response: JsonResponse;
    try {
      response = await request(url.origin + path, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (e) {
      if (signal?.aborted) {
        checkAborted(signal);
      }
      if (e instanceof Error && e.name === "AbortError") throw e;
      throw new PatientApiError(0, "Не удалось соединиться с сервером");
    }
    checkAborted(signal);
    if (!response.ok)
      throw new PatientApiError(
        response.status,
        response.status === 401
          ? "Войдите в аккаунт"
          : response.status === 403
            ? "Доступ к записи отозван"
            : response.status === 409
              ? "Данные на сервере изменились"
              : "Сервер не смог выполнить запрос",
      );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      checkAborted(signal);
      throw new PatientApiError(502, "Неизвестный формат ответа сервера");
    }
    checkAborted(signal);
    return data;
  }
  return {
    async session(signal?: AbortSignal) {
      const data = await get("/api/patient/session", signal);
      if (
        !object(data) ||
        !object(data.actor) ||
        typeof data.csrfToken !== "string" ||
        !data.csrfToken
      )
        throw new PatientApiError(502, "Неизвестный формат сессии");
      return { actor: data.actor, csrfToken: data.csrfToken };
    },
    async record(signal?: AbortSignal) {
      const data = await get("/api/patient/record", signal);
      if (
        !object(data) ||
        typeof data.patientId !== "string" ||
        !data.patientId ||
        !Array.isArray(data.plan) ||
        !Array.isArray(data.reports) ||
        !Array.isArray(data.messages)
      )
        throw new PatientApiError(502, "Неизвестный формат записи пациента");
      return {
        patientId: data.patientId,
        name: typeof data.name === "string" ? data.name : undefined,
        plan: data.plan as unknown[],
        reports: data.reports as unknown[],
        messages: data.messages as unknown[],
      };
    },
  };
}
