import type { JourneyState, OnboardingProgress } from "./journeyModel.ts";
import { PatientValidationError } from "./patientErrors.ts";
export const initialOnboarding = (
  goal = "Следовать плану терапии",
  name = "",
  morning = "09:00",
): OnboardingProgress => ({
  version: 1,
  step: 0,
  name,
  goal,
  code: "",
  morning,
  practiceDose: false,
  practiceItem: { x: 0.3, y: 0.6 },
  completed: false,
});
export function saveOnboarding(
  state: JourneyState,
  p: OnboardingProgress,
): JourneyState {
  if (
    p.version !== 1 ||
    !Number.isInteger(p.step) ||
    p.step < 0 ||
    p.step > 12 ||
    p.name.length > 80 ||
    p.goal.length > 120 ||
    p.code.length > 64 ||
    p.morning.length > 5 ||
    ![p.practiceItem.x, p.practiceItem.y].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 1,
    )
  )
    throw new PatientValidationError("Не удалось сохранить шаг знакомства");
  if ((p.step >= 2 || p.completed) && !state.connected)
    throw new PatientValidationError(
      "Сначала подключите план по коду или продолжите знакомство",
    );
  if (
    p.completed &&
    (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(p.morning) || !p.goal.trim())
  )
    throw new PatientValidationError(
      "Проверьте личную цель и время напоминания",
    );
  return {
    ...state,
    onboarding: {
      ...p,
      practiceItem: { ...p.practiceItem },
      ...(p.practiceFeeling
        ? { practiceFeeling: { ...p.practiceFeeling } }
        : {}),
    },
    ...(p.completed ? { shown: { ...state.shown, "release:4": true } } : {}),
  };
}
