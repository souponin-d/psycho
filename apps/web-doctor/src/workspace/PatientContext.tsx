import { useState } from "react";
import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { ProfileForm } from "./PatientForms";
import { formatDate } from "./labels";
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
  const update = patient.audit
    .filter((a) => a.action === "profile.update")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const facts = compact
    ? [
        ["Аллергии", patient.profile.allergies],
        ["Лекарства", patient.profile.currentMedication],
      ]
    : [
        ["Цели", patient.profile.goals],
        ["Аллергии", patient.profile.allergies],
        ["Заболевания", patient.profile.conditions],
        ["Лекарства", patient.profile.currentMedication],
        ["Поддержка", patient.profile.socialContext],
      ];
  return (
    <>
      <section
        className={styles.contextCard}
        aria-label="Общие сведения пациента"
      >
        <div className={styles.between}>
          <h3>Сведения для решения</h3>
          {actions && !patient.archived && (
            <Button
              variant="ghost"
              icon="edit"
              onClick={() => setEditing(true)}
            >
              Уточнить в карте
            </Button>
          )}
        </div>
        <dl className={styles.facts}>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value || (
                  <span className={styles.subtext}>
                    Нет сведений · уточнить
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className={styles.subtext}>
          {update
            ? `Последнее изменение профиля: ${formatDate(update.createdAt)} · ${update.author}`
            : "Из карты пациента · источник отдельных сведений требует уточнения"}
        </p>
        <p className={styles.subtext}>
          Дата изменения профиля не подтверждает сверку анамнеза. Источник и
          дату уточнения укажите в соответствующем поле.
        </p>
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
