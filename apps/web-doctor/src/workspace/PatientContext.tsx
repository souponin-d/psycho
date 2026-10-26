import { ClinicalFacts } from "./ClinicalFacts";
import { useState } from "react";
import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { ProfileForm } from "./PatientForms";
import { Button, styles } from "./ui/Elements";

/** One chart context; no interpretation or copying into encounter notes. */
export function PatientContext({
  patient,
  actions,
  compact = false,
}: {
  patient: PatientRecord;
  actions?: WorkspaceActions;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const facts = [
    ["Жалобы", patient.profile.clinicalContext.complaints],
    ["Анамнез заболевания", patient.profile.clinicalContext.illnessHistory],
    ["Цель обращения", patient.profile.goals],
    ["Семейный анамнез", patient.profile.familyHistory],
    ["Предыдущие эпизоды и лечение", patient.profile.pastEpisodes],
    ["Аллергии и непереносимость", patient.profile.allergies],
    ["Текущие препараты", patient.profile.currentMedication],
    [
      "Соматические заболевания",
      patient.profile.clinicalContext.somaticConditions
        .map((item) => `${item.code} ${item.title}`)
        .join("; "),
    ],
  ];
  return (
    <>
      <section
        className={`${styles.contextCard} ${compact ? styles.contextCompact : ""}`}
        aria-label="Общие сведения пациента"
      >
        <div className={styles.between}>
          <h3>Данные пациента</h3>
          {actions && !patient.archived && (
            <Button
              variant="ghost"
              icon="edit"
              onClick={() => setEditing(true)}
            >
              Редактировать
            </Button>
          )}
        </div>
        <dl className={styles.facts}>
          {facts
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        <details className={styles.details} open={!compact}>
          <summary>Диагнозы, лекарства и аллергии</summary>
          <ClinicalFacts
            patient={patient}
            actions={actions}
            compact={compact}
          />
        </details>
      </section>
      {editing && actions && (
        <ProfileForm
          patient={patient}
          actions={actions}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
