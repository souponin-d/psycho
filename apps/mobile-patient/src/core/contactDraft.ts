import { isDay } from "./shore.ts";
import type {
  ContactDraftFields,
  DayKey,
  PatientDraft,
} from "./journeyModel.ts";
export function getContactDraft(draft?: PatientDraft): ContactDraftFields {
  return draft?.kind === "contact" && draft.contact
    ? { ...draft.contact }
    : { description: "", onset: "" };
}
export function validateContactDraft(
  fields: ContactDraftFields,
  today: DayKey,
): string | null {
  if (!fields.description.trim())
    return "Опишите трудность, которую хотите обсудить.";
  if (fields.description.length > 1000)
    return "Сократите описание до 1000 символов.";
  if (!isDay(fields.onset) || fields.onset > today)
    return "Укажите дату начала не позже сегодняшнего дня.";
  if (
    !fields.severity ||
    !["Лёгкая", "Заметная", "Сильная"].includes(fields.severity)
  )
    return "Выберите, насколько это мешает.";
  if (!fields.preference || !["planned", "earlier"].includes(fields.preference))
    return "Выберите, как хотите обсудить трудность.";
  return null;
}
