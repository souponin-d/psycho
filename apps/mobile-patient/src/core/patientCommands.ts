import { sameReport } from "./reportFlow.ts";
import { openWorldSection } from "./worldSections.ts";
import { validateContactDraft } from "./contactDraft.ts";
import { dayAt, closeElapsedDays } from "./calendar.ts";
import { isDay } from "./shore.ts";
import { fieldComplete, planForDay } from "./therapy.ts";
import {
  completeQuestionnaire,
  latestDose,
  latestReports,
} from "./questionnaires.ts";
import { PatientValidationError } from "./patientErrors.ts";
import { connectScenario, seedScenario } from "./scenario.ts";
import { validateWorld } from "./world.ts";
import { grantRewards } from "./achievements.ts";
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
    case "world:section":
      if (
        !isDay(command.day) ||
        command.day > today ||
        command.day < base.plan.startedAt
      )
        throw new PatientValidationError("Этот участок ещё недоступен");
      return openWorldSection(base, command.day);
    case "world":
      validateWorld(base, command.world);
      return grantRewards({
        ...base,
        world: command.world,
        activity: { ...base.activity, customized: true },
      });
    case "activity":
      if (base.activity?.[command.activity]) return base;
      return grantRewards({
        ...base,
        activity: { ...base.activity, [command.activity]: true },
      });
    case "event": {
      const input = command.event;
      let completion: ReturnType<typeof completeQuestionnaire> | undefined;
      if (!input.id || base.events.some((e) => e.id === input.id)) return base;
      if (!isDay(input.day) || input.day > today)
        throw new PatientValidationError("Нельзя выполнить будущий день");
      // Runs inside the repository's serialized transaction, so simultaneous
      // main/snooze receipts cannot both append a clinical fact.
      if (
        input.kind === "dose" &&
        input.action === "select" &&
        latestDose(base, input.day, input.slotId)?.status === input.status
      )
        return base;
      if (
        input.kind === "dose" &&
        input.source === "notification" &&
        input.status === "taken" &&
        latestDose(base, input.day, input.slotId)?.status === "taken"
      )
        return base;
      if (
        input.kind === "dose" &&
        !planForDay(base, input.day).medication.slots.some(
          (s) => s.id === input.slotId,
        )
      )
        throw new PatientValidationError("Приём не найден в плане");
      if (
        input.kind === "report" &&
        input.required &&
        !input.deleted &&
        !planForDay(base, input.day).reportFields.every((f) =>
          fieldComplete(input.fields, f),
        )
      )
        throw new PatientValidationError(
          "Заполните обязательные поля самоотчёта",
        );
      if (input.kind === "report") {
        const previous = latestReports(base, input.day).find(
          (e) => (e.entityId ?? e.id) === (input.entityId ?? input.id),
        );
        if (previous && sameReport(previous, input)) {
          if (
            command.draftId &&
            base.drafts[command.draftId]?.day === input.day
          ) {
            const drafts = { ...base.drafts };
            delete drafts[command.draftId];
            return { ...base, drafts };
          }
          return base;
        }
      }
      if (input.kind === "questionnaire") {
        if (base.closedDays[input.day])
          throw new PatientValidationError(
            "Этот день уже завершён. Назначенный опрос нельзя пройти задним числом.",
          );
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
      if (input.kind === "contact") {
        const invalid = validateContactDraft(input, today);
        if (invalid) throw new PatientValidationError(invalid);
      }
      const event: PatientEvent = {
        ...input,
        ...completion,
        at: now.utcMs,
        recordedDay: today,
        gameEligible: input.day === today && !base.closedDays[input.day],
      };
      const drafts = { ...base.drafts };
      if (command.draftId && drafts[command.draftId]?.day === input.day)
        delete drafts[command.draftId];
      if (event.kind === "report" && event.required)
        delete drafts["report:" + event.day];
      if (event.kind === "questionnaire")
        delete drafts["questionnaire:" + event.assignmentId];
      if (event.kind === "contact") delete drafts["contact:" + event.day];
      return grantRewards({ ...base, events: [...base.events, event], drafts });
    }
  }
}
