import type { SnapshotPort } from "./database.ts";

export function createScopedSnapshot(
  port: {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
  },
  key: string,
): SnapshotPort {
  if (!key) throw new Error("Не указан профиль");
  return {
    read: () => port.read(key),
    write: (value) => port.write(key, value),
  };
}
