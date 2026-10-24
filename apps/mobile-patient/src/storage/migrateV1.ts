import { restoreState } from "../core/model.ts";
import { seedScenario } from "../core/scenario.ts";
import type { DayKey, JourneyState } from "../core/journeyModel.ts";

export function migrateLegacy(raw: string | null, today: DayKey): JourneyState {
  const state = { ...seedScenario(today), connected: false };
  if (raw === null) return state;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "Не удалось прочитать старые записи. Исходные данные не изменены.",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    (value as { version?: unknown }).version !== 1
  )
    throw new Error(
      "Неизвестный формат старых записей. Данные сохранены без изменений.",
    );
  const legacy = restoreState(raw);
  return {
    ...state,
    legacyArchive: legacy.reports.map((r) => ({
      ...r,
      ...(r.feeling ? { feeling: { ...r.feeling } } : {}),
    })),
  };
}

export function restoreJourney(raw: string): JourneyState {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Повреждён профиль");
  const s = value as Partial<JourneyState>;
  if (
    s.version !== 2 ||
    typeof s.scenarioId !== "string" ||
    typeof s.connected !== "boolean" ||
    !s.plan ||
    !Array.isArray(s.plan.medication?.slots) ||
    !Array.isArray(s.plan.tests) ||
    !Array.isArray(s.plan.reportFields) ||
    !Array.isArray(s.events) ||
    !s.closedDays ||
    !s.drafts ||
    !s.world ||
    !Array.isArray(s.world.placements) ||
    !Array.isArray(s.rewards) ||
    !Array.isArray(s.legacyArchive)
  )
    throw new Error("Не удалось восстановить профиль. Данные не перезаписаны.");
  return s as JourneyState;
}
