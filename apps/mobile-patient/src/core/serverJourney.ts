import { seedScenario } from "./scenario.ts";
import type {
  DayKey,
  JourneyState,
  WorldState,
  OnboardingProgress,
} from "./journeyModel.ts";

/** Empty server-linked history; never copies the demo's clinical events or plan. */
export function createServerJourney(
  day: DayKey,
  world?: WorldState,
  onboarding?: OnboardingProgress,
): JourneyState {
  const appearance = JSON.parse(
    JSON.stringify(world ?? seedScenario(day).world),
  ) as WorldState;
  return {
    version: 2,
    scenarioId: "server-patient-v1",
    seedDay: day,
    connected: true,
    goal: "Следовать плану терапии",
    lastObservedDay: day,
    plan: {
      id: "server-plan-unavailable",
      status: "unavailable",
      startedAt: day,
      doctor: "",
      medication: { name: "", dosageLabel: "", slots: [] },
      reportFields: [],
      tests: [],
      visit: { day: "", time: "", specialist: "", place: "" },
    },
    events: [],
    closedDays: {},
    rewards: [],
    drafts: {},
    legacyArchive: [],
    world: appearance,
    ...(onboarding ? { onboarding: { ...onboarding, code: "" } } : {}),
  };
}
