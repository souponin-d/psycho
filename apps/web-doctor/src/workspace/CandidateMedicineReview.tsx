import type { Actor, PatientRecord, PlanItem } from "./model";
import {
  clinicalDrugClasses,
  evaluateSupport,
  newSupportInput,
  supportCatalog,
} from "./clinical-support-engine";
import { styles, Badge } from "./ui/Elements";
export function CandidateMedicineReview({
  patient,
  plan,
  actor,
}: {
  patient: PatientRecord;
  plan: PlanItem;
  actor: Actor;
}) {
  if (plan.kind !== "medication" || !plan.medicine) return null;
  const today = new Date().toISOString().slice(0, 10);
  const day =
    /^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) && plan.startDate > today
      ? plan.startDate
      : today;
  const snapshot = {
    ...patient,
    plan: [
      ...patient.plan.filter((p) => p.id !== plan.id),
      { ...plan, status: "confirmed" as const, startDate: day },
    ],
  };
  const input =
    patient.clinicalSupport?.evaluations.at(-1)?.input ?? newSupportInput();
  const result = evaluateSupport(
    snapshot,
    input,
    actor,
    day + "T23:59:59.000Z",
  );
  const rows = result.findings.filter(
    (f) =>
      (f.relatedIds.includes(plan.id) &&
        ["allergy", "interaction"].includes(f.kind)) ||
      f.id.startsWith("factor-") ||
      ["allergy-unknown", "medications-unknown", "mania-unknown"].includes(
        f.id,
      ),
  );
  const sources = supportCatalog.sources.filter((s) =>
    rows.some((f) => f.sourceIds.includes(s.id)),
  );
  const recognized = clinicalDrugClasses(plan.medicine.inn).length > 0;
  return (
    <div
      className={styles.inlineNote}
      aria-label="Проверка выбранного препарата"
    >
      <strong>Проверка выбранного препарата</strong>{" "}
      <Badge tone="amber">
        {rows.length ? "Есть сведения для проверки" : "Проверенный перечень"}
      </Badge>
      {!recognized && (
        <p>
          Для этого МНН нет специальных правил в каталоге. Доступна сверка общих
          факторов и записи об аллергии.
        </p>
      )}
      {rows.map((f) => (
        <div key={f.id}>
          <p>
            <strong>{f.title}</strong>
          </p>
          <p className={styles.subtext}>{f.detail}</p>
        </div>
      ))}
      {!rows.length && (
        <p>
          Совпадений в проверенном перечне не найдено. Сверьте инструкцию
          выбранного РУ.
        </p>
      )}
      <details className={styles.details}>
        <summary>Источники проверки</summary>
        {sources.map((s) => (
          <p key={s.id}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{" "}
            · {s.version} · {s.section}
          </p>
        ))}
      </details>
    </div>
  );
}
