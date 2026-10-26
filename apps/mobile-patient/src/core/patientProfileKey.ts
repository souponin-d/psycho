import type { PatientOutboxOwner } from "./patientOutbox.ts";

/** The owner must come from the confirmed server session, never from a draft. */
export function patientProfileKey(owner: PatientOutboxOwner | null): string {
  if (owner === null) return "demo";
  const origin = new URL(owner.origin);
  if (
    origin.origin !== owner.origin ||
    !["http:", "https:"].includes(origin.protocol) ||
    !owner.clinicId ||
    !owner.patientId ||
    !owner.actorId
  )
    throw new Error("Неизвестный владелец профиля");
  return (
    "server:" +
    JSON.stringify([
      owner.origin,
      owner.clinicId,
      owner.patientId,
      owner.actorId,
    ])
  );
}
