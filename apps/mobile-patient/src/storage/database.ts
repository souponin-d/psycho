import { upgradeWorldSections } from "../core/worldSections.ts";
import { migrateLegacy, restoreJourney } from "./migrateV1.ts";
import { closeElapsedDays, dayAt } from "../core/calendar.ts";
import { applyPatientCommand } from "../core/patientCommands.ts";
import type {
  Instant,
  JourneyState,
  PatientCommand,
  PatientDraft,
} from "../core/journeyModel.ts";

export interface SnapshotPort {
  read(): Promise<string | null>;
  write(payload: string): Promise<void>;
}
export interface PatientRepository {
  load(): Promise<JourneyState>;
  apply(command: PatientCommand, now?: Instant): Promise<JourneyState>;
  saveDraft(draft: PatientDraft): Promise<void>;
}
export function createPatientRepository(
  port: SnapshotPort,
  readLegacy: () => Promise<string | null>,
  clock: () => Instant,
): PatientRepository {
  let current: JourneyState | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.catch(() => {}).then(operation);
    queue = next;
    return next;
  }
  async function loadInternal(): Promise<JourneyState> {
    if (current) return current;
    const now = clock(),
      raw = await port.read();
    const state =
      raw === null
        ? migrateLegacy(await readLegacy(), dayAt(now))
        : restoreJourney(raw);
    const closed = closeElapsedDays(
      upgradeWorldSections(state, dayAt(now)),
      now,
    );
    if (raw === null || closed !== state)
      await port.write(JSON.stringify(closed));
    current = closed;
    return current;
  }
  const repository: PatientRepository = {
    load: () => serialize(loadInternal),
    apply: (command, providedNow) =>
      serialize(async () => {
        const previous = await loadInternal();
        const next = applyPatientCommand(
          previous,
          command,
          providedNow ?? clock(),
        );
        if (next !== previous) await port.write(JSON.stringify(next));
        current = next;
        return next;
      }),
    async saveDraft(draft) {
      await repository.apply({ type: "draft", draft });
    },
  };
  return repository;
}
