import { dayAt, closeElapsedDays } from "./calendar.ts";
import { isDay } from "./shore.ts";
import { fieldComplete } from "./therapy.ts";
import { completeQuestionnaire } from "./questionnaires.ts";
import { PatientValidationError } from "./patientErrors.ts";
import { connectScenario, seedScenario } from "./scenario.ts";
import type {
  Instant,
  JourneyState,
  PatientCommand,
  PatientEvent,
} from "./journeyModel.ts";

export function applyPatientCommand(
  state: JourneyState,
  command: PatientCommand,
  now: Instant,
): JourneyState {
  const base = closeElapsedDays(state, now);
  const today = dayAt(now);
  switch (command.type) {
    case "reset": {
      const fresh = seedScenario(today);
      return {
        ...fresh,
        connected: false,
        plan: { ...fresh.plan, id: fresh.plan.id + ":" + now.utcMs },
      };
    }
    case "tick":
      return base;
    case "connect":
      return connectScenario(command.code, base);
    case "goal":
      return {
        ...base,
        goal: command.goal.trim().slice(0, 120) || "Следовать плану терапии",
      };
    case "draft": {
      if (!isDay(command.draft.day) || command.draft.day > today)
        throw new PatientValidationError("Нельзя заполнить будущий день");
      return {
        ...base,
        drafts: { ...base.drafts, [command.draft.id]: command.draft },
      };
    }
    case "draft:remove": {
      const drafts = { ...base.drafts };
      delete drafts[command.id];
      return { ...base, drafts };
    }
    case "world":
      return { ...base, world: command.world };
    case "event": {
      const input = command.event;
      let completion: ReturnType<typeof completeQuestionnaire> | undefined;
      if (!input.id || base.events.some((e) => e.id === input.id)) return base;
      if (!isDay(input.day) || input.day > today)
        throw new PatientValidationError("Нельзя выполнить будущий день");
      if (
        input.kind === "dose" &&
        !base.plan.medication.slots.some((s) => s.id === input.slotId)
      )
        throw new PatientValidationError("Приём не найден в плане");
      if (
        input.kind === "report" &&
        input.required &&
        !input.deleted &&
        !base.plan.reportFields.every((f) => fieldComplete(input.fields, f))
      )
        throw new PatientValidationError(
          "Заполните обязательные поля самоотчёта",
        );
      if (input.kind === "questionnaire") {
        const assignment = base.plan.tests.find(
          (t) => t.id === input.assignmentId,
        );
        if (
          !assignment ||
          assignment.day !== today ||
          input.day !== today ||
          assignment.formId !== input.formId ||
          assignment.questionCount !== input.answers.length ||
          input.answers.some((v) => !Number.isInteger(v) || v < 0 || v > 3)
        )
          throw new PatientValidationError(
            "Опрос не назначен на сегодня или заполнен не полностью",
          );
        if (
          base.events.some(
            (e) =>
              e.kind === "questionnaire" &&
              e.assignmentId === input.assignmentId,
          )
        )
          return base;
        completion = completeQuestionnaire(
          assignment,
          input.answers,
          input.impact,
        );
      }
      const event: PatientEvent = {
        ...input,
        ...completion,
        at: now.utcMs,
        recordedDay: today,
      };
      const drafts = { ...base.drafts };
      if (event.kind === "report" && event.required)
        delete drafts["report:" + event.day];
      if (event.kind === "questionnaire")
        delete drafts["questionnaire:" + event.assignmentId];
      return { ...base, events: [...base.events, event], drafts };
    }
  }
}
