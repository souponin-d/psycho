import { applyCommand, createPatient, DomainError } from "./commands";
import { demoActor, seedPatients } from "./seed";
import type { Actor, Command, PatientRecord, Profile } from "./model";
import * as api from "./api.generated";

export interface Repository {
  readonly mode: "demo" | "server";
  readonly actor: Actor;
  list(): Promise<PatientRecord[]>;
  create(profile: Partial<Profile>, id: string): Promise<PatientRecord>;
  execute(id: string, command: Command): Promise<PatientRecord>;
  logout(): Promise<void>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
let csrf = "";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-TOKEN": csrf } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Ответ сервера не получен. Результат сохранения пока неизвестен. Повторите действие: оно не будет записано дважды.",
      0,
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof body.detail === "string"
        ? body.detail
        : response.status === 401
          ? "Сессия завершилась. Войдите снова."
          : response.status === 409
            ? "Карта изменена в другой сессии. Обновите данные перед повтором."
            : "Не удалось выполнить действие. Повторите попытку.",
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function serverSession(): Promise<{
  actor: Actor;
  csrfToken: string;
}> {
  const session = await api.session(request);
  csrf = session.csrfToken;
  return session;
}
export async function login(
  email: string,
  password: string,
): Promise<Repository> {
  const token = await api.csrf(request);
  csrf = token.token ?? "";
  await api.login(request, { email, password });
  const session = await serverSession();
  return serverRepository(session.actor);
}
export function serverRepository(actor: Actor): Repository {
  return {
    mode: "server",
    actor,
    list: () => api.patients(request),
    create: (profile, id) =>
      api.createPatient(request, {
        id,
        profile: { ...profile, name: profile.name ?? "" },
      }),
    execute: (id, command) => api.execute(request, id, command),
    logout: () => api.logout(request),
  };
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("syncli-doctor-synthetic-v2", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("patients", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Локальное хранилище недоступно. Разрешите хранение данных для этого сайта.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error("Закройте другие вкладки приложения и повторите открытие."),
      );
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    set: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("patients", mode);
    let result: T;
    let failure: unknown;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(
        failure ??
          new Error(
            "Не удалось сохранить данные. Проверьте свободное место и повторите.",
          ),
      );
    };
    tx.onabort = () => {
      db.close();
      reject(
        failure ?? new Error("Сохранение прервано. Изменения не записаны."),
      );
    };
    const fail = (error: unknown) => {
      failure = error;
      tx.abort();
    };
    try {
      operation(
        tx.objectStore("patients"),
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}
export async function demoRepository(): Promise<Repository> {
  await transaction<void>("readwrite", (store, set) => {
    const count = store.count();
    count.onsuccess = () => {
      if (count.result === 0)
        for (const patient of seedPatients()) store.add(patient);
      set(undefined);
    };
  });
  return {
    mode: "demo",
    actor: demoActor,
    list: () =>
      transaction<PatientRecord[]>("readonly", (store, set) => {
        const request = store.getAll();
        request.onsuccess = () => set(request.result as PatientRecord[]);
      }),
    create: async (profile, id) => {
      const patient = createPatient(
        profile,
        demoActor,
        new Date().toISOString(),
        id,
      );
      return transaction<PatientRecord>("readwrite", (store, set) => {
        const existing = store.get(id);
        existing.onsuccess = () => {
          if (existing.result) set(existing.result as PatientRecord);
          else {
            store.add(patient);
            set(patient);
          }
        };
      });
    },
    execute: (id, command) =>
      transaction<PatientRecord>("readwrite", (store, set, fail) => {
        const request = store.get(id);
        request.onsuccess = () => {
          try {
            if (!request.result)
              throw new DomainError("Пациент не найден.", "not-found");
            const patient = applyCommand(
              request.result as PatientRecord,
              command,
              demoActor,
              new Date().toISOString(),
            );
            store.put(patient);
            set(patient);
          } catch (error) {
            fail(error);
          }
        };
      }),
    logout: async () => {},
  };
}
