import { useState, type FormEvent } from "react";
import type { PatientRecord } from "./model";
import { message, type WorkspaceActions } from "./useWorkspace";
import { syntheticProtocol } from "./clinical-workflow";
import { clinicalProtocols, getClinicalProtocol } from "./clinical-protocols";
import {
  Button,
  ErrorNotice,
  Field,
  Modal,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

/** Shared source-backed questionnaire. Scoring stays in workflow.submit. */
export function ClinicalQuestionnaire({
  patient,
  actions,
  onClose,
  visitId,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
  visitId?: string;
}) {
  const [error, setError] = useState("");
  const [state, setState] = useState<"completed" | "declined" | "cannot">(
    "completed",
  );
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(7).fill(null),
  );
  const [protocolVersion, setProtocolVersion] = useState(
    clinicalProtocols[0]!.version,
  );
  const protocol =
    getClinicalProtocol(protocolVersion) ??
    (protocolVersion === syntheticProtocol.version
      ? syntheticProtocol
      : undefined);
  const [impact, setImpact] = useState<number | null>(null);
  const [immediateDanger, setImmediateDanger] = useState<
    "yes" | "no" | "unknown"
  >("unknown");
  const sourceForm = getClinicalProtocol(protocolVersion);
  const needsImpact =
    state === "completed" &&
    !!sourceForm?.impactQuestion &&
    answers.some((answer) => answer !== null && answer > 0);
  const [safety, setSafety] = useState<"yes" | "no" | "unknown">("unknown");
  const [note, setNote] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [measuredAt, setMeasuredAt] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!actions || !protocol) return;
    try {
      await actions.mutate(
        patient.id,
        {
          type: "workflow.submit",
          value: {
            id: crypto.randomUUID(),
            ...(visitId ? { visitId } : {}),
            protocolVersion,
            measuredAt: measuredAt
              ? new Date(measuredAt).toISOString()
              : new Date().toISOString(),
            state,
            answers:
              state === "completed"
                ? answers
                : Array(protocol.items).fill(null),
            safety,
            ...(needsImpact ? { impact } : {}),
            ...(immediateDanger !== "unknown" ? { immediateDanger } : {}),
            note,
            assignmentId,
          },
        },
        patient.revision,
      );
      onClose();
    } catch (err) {
      setError(message(err));
    }
  }
  function changeProtocol(version: string, assignment = "") {
    const next =
      getClinicalProtocol(version) ??
      (version === syntheticProtocol.version ? syntheticProtocol : undefined);
    setProtocolVersion(version);
    setAnswers(Array(next?.items ?? 0).fill(null));
    setImpact(null);
    setAssignmentId(assignment);
    setError(
      next ? "" : "Версия выданной формы недоступна. Нужна проверка задания.",
    );
  }
  return (
    <Modal open onClose={onClose} title="Новый самоотчёт">
      <form className={styles.form} onSubmit={submit}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Select
          label="Форма самоопросника"
          value={protocolVersion}
          onChange={(e) => changeProtocol(e.target.value)}
        >
          {clinicalProtocols.map((entry) => (
            <option key={entry.version} value={entry.version}>
              {entry.title}
            </option>
          ))}
          {!sourceForm && (
            <option value={protocolVersion}>
              {protocol?.title ?? "Версия формы недоступна"}
            </option>
          )}
        </Select>
        <p>{sourceForm?.instruction ?? protocol?.window}</p>
        <details className={styles.details}>
          <summary>Источник формы</summary>
          <p>{protocol?.source}</p>
          <p>
            {protocolVersion} · {protocol?.window} · {protocol?.status} ·
            Клиническое утверждение отсутствует.
          </p>
          {sourceForm?.attribution && <p>{sourceForm.attribution}</p>}
          {sourceForm?.sourceUrl && (
            <p>
              <a href={sourceForm.sourceUrl} target="_blank" rel="noreferrer">
                Бланк источника
              </a>
            </p>
          )}
        </details>
        <Field
          label="Дата и время результата"
          type="datetime-local"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          hint="Если не указана, используется время получения"
        />
        <Select
          label="Заполнение"
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
        >
          <option value="completed">Ответы / частичное заполнение</option>
          <option value="declined">Отказ</option>
          <option value="cannot">Не смог заполнить</option>
        </Select>
        {state === "completed" &&
          answers.map((value, i) => (
            <Select
              key={i}
              label={`${i + 1}. ${sourceForm?.questions?.[i] ?? `Пункт ${i + 1}`}`}
              value={value === null ? "" : String(value)}
              onChange={(e) =>
                setAnswers((old) =>
                  old.map((v, j) =>
                    i === j
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : v,
                  ),
                )
              }
            >
              <option value="">Пропуск / неизвестно</option>
              {[0, 1, 2, 3].map((v) => (
                <option key={v} value={v}>
                  {sourceForm?.options?.[v] ?? v}
                </option>
              ))}
            </Select>
          ))}
        {needsImpact && (
          <Select
            label={sourceForm!.impactQuestion!}
            value={impact === null ? "" : String(impact)}
            onChange={(e) =>
              setImpact(e.target.value === "" ? null : Number(e.target.value))
            }
            hint="Дополнительный вопрос не входит в сумму"
          >
            <option value="">Пропуск / неизвестно</option>
            {sourceForm!.impactOptions!.map((label, value) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Прямой ответ о рисках"
          value={safety}
          onChange={(e) => setSafety(e.target.value as typeof safety)}
        >
          <option value="unknown">Ответ неизвестен / не получен</option>
          <option value="yes">Требуется помощь врача</option>
          <option value="no">
            Прямое сообщение не отмечено; клинический риск не исключён
          </option>
        </Select>
        <Select
          label="Непосредственная опасность сейчас"
          value={immediateDanger}
          onChange={(e) =>
            setImmediateDanger(e.target.value as typeof immediateDanger)
          }
        >
          <option value="unknown">Неизвестно / не оценено</option>
          <option value="yes">Есть прямое сообщение об опасности сейчас</option>
          <option value="no">
            Прямое сообщение об опасности сейчас не отмечено
          </option>
        </Select>
        <Select
          label="Связанное задание на самоопросник"
          value={assignmentId}
          onChange={(e) => {
            const assignment = patient.workflow?.assignments.find(
              (entry) => entry.id === e.target.value,
            );
            if (assignment)
              changeProtocol(assignment.protocolVersion, assignment.id);
            else setAssignmentId("");
          }}
        >
          <option value="">Вне задания</option>
          {patient.workflow?.assignments
            .filter((a) => a.status === "issued")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {getClinicalProtocol(a.protocolVersion)?.title ??
                  "Самоопросник"}{" "}
                · {a.dueDate}
              </option>
            ))}
        </Select>
        <Textarea
          label="Что изменилось"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" disabled={actions.busy || !protocol}>
          Сохранить самоотчёт
        </Button>
      </form>
    </Modal>
  );
}
