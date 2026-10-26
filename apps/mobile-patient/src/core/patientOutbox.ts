import type { StoragePort } from "./storage.ts";

export type PatientOutboxOwner = {
  origin: string;
  clinicId: string;
  patientId: string;
  actorId: string;
};
export type PatientOutboxCommand = {
  commandId: string;
  mutation: { type: string; [key: string]: unknown };
};
const queues = new WeakMap<StoragePort, Map<string, Promise<void>>>();

function isCommand(value: unknown): value is PatientOutboxCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const mutation = item.mutation;
  return (
    typeof item.commandId === "string" &&
    item.commandId.length > 0 &&
    !!mutation &&
    typeof mutation === "object" &&
    !Array.isArray(mutation) &&
    typeof (mutation as Record<string, unknown>).type === "string" &&
    !!(mutation as Record<string, unknown>).type
  );
}

/** Queue is scoped to the server-confirmed actor and never reads the demo profile. */
export function createPatientOutbox(
  storage: StoragePort,
  owner: PatientOutboxOwner,
  stream = "default",
) {
  const origin = new URL(owner.origin);
  if (
    origin.origin !== owner.origin ||
    !["https:", "http:"].includes(origin.protocol) ||
    !owner.clinicId ||
    !owner.patientId ||
    !owner.actorId ||
    !/^[a-z][a-z0-9-]{0,31}$/.test(stream)
  )
    throw new Error("Некорректный владелец очереди");
  const key =
    "syncli.patient.outbox.v1:" +
    JSON.stringify([
      owner.origin,
      owner.clinicId,
      owner.patientId,
      owner.actorId,
      stream,
    ]);
  let owners = queues.get(storage);
  if (!owners) {
    owners = new Map();
    queues.set(storage, owners);
  }
  const locks = owners;
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const result = (locks.get(key) ?? Promise.resolve()).then(action);
    const tail = result.then(
      () => {},
      () => {},
    );
    locks.set(key, tail);
    void tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return result;
  }
  async function read(): Promise<PatientOutboxCommand[]> {
    const raw = await storage.getItem(key);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      !parsed.every(isCommand) ||
      new Set(parsed.map((item) => item.commandId)).size !== parsed.length
    )
      throw new Error("Не удалось прочитать очередь отправки");
    return parsed;
  }
  return {
    list: () => serial(read),
    clear: () => serial(() => storage.setItem(key, "[]")),
    remove(commandId: string) {
      return serial(async () => {
        const current = await read();
        const remaining = current.filter(
          (item) => item.commandId !== commandId,
        );
        if (remaining.length !== current.length)
          await storage.setItem(key, JSON.stringify(remaining));
      });
    },
    enqueue(
      command: PatientOutboxCommand,
      conflicts?: (existing: PatientOutboxCommand) => boolean,
    ) {
      // Capture the exact payload now, before the caller can mutate its object.
      const encoded = JSON.stringify(command);
      const copy: unknown = JSON.parse(encoded);
      if (!isCommand(copy)) throw new Error("Некорректная команда");
      return serial(async () => {
        const current = await read();
        const existing = current.find(
          (item) => item.commandId === copy.commandId,
        );
        if (existing) {
          if (JSON.stringify(existing) !== encoded)
            throw new Error("Идентификатор команды уже используется");
          return;
        }
        if (conflicts && current.some(conflicts))
          throw new Error("Предыдущая отметка ещё ожидает отправки.");
        await storage.setItem(key, JSON.stringify([...current, copy]));
      });
    },
    flush(send: (command: PatientOutboxCommand) => Promise<void>) {
      return serial(async () => {
        const current = await read();
        while (current.length) {
          await send(current[0]!);
          const remaining = current.slice(1);
          // If persistence fails after acceptance, retry with the same commandId.
          await storage.setItem(key, JSON.stringify(remaining));
          current.shift();
        }
      });
    },
  };
}
