import { useState, type FormEvent } from "react";
import type { PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import {
  factCategoryLabels,
  factStatusLabels,
  factOriginLabels,
  factValueText,
  latestFact,
  legacyClinicalFacts,
  type ClinicalFact,
  type ClinicalFactCategory,
  type ClinicalFactValue,
  type ClinicalFactOrigin,
  type ClinicalFactDecision,
  type LegacyClinicalFact,
} from "./clinical-facts";
import { type TerminologySelection } from "./terminology";
import { type MedicineSelection } from "./grls";
import { TerminologyPicker } from "./TerminologyPicker";
import { MedicinePicker } from "./MedicinePicker";
import { DraftConflict, useDraftGuard } from "./DraftConflict";
import {
  Button,
  Field,
  Select,
  Textarea,
  Modal,
  ErrorNotice,
  styles,
} from "./ui/Elements";

function FactEditor({
  patient,
  actions,
  fact,
  legacy,
  category = "allergy",
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  fact?: ClinicalFact;
  legacy?: LegacyClinicalFact;
  category?: ClinicalFactCategory;
  onClose: () => void;
}) {
  const original = fact ? latestFact(fact) : undefined;
  const initial = original?.content ??
    legacy?.content ?? { category, state: "unknown" as const };
  const [id] = useState(fact?.id ?? crypto.randomUUID());
  const [version, setVersion] = useState(original?.version ?? 0);
  const [content, setContent] = useState<ClinicalFactValue>(initial);
  const [origin, setOrigin] = useState<ClinicalFactOrigin>(
    original?.origin ??
      legacy?.origin ?? {
        kind: "clinician",
        reference: "Клиническая запись врача",
        quote: "",
        observedAt: new Date().toISOString(),
      },
  );
  const [condition, setCondition] = useState<TerminologySelection | null>(
    initial.state === "known" &&
      (initial.category === "diagnosis" || initial.category === "somatic")
      ? initial.condition
      : null,
  );
  const [medicine, setMedicine] = useState<MedicineSelection | null>(
    initial.state === "known" && initial.category === "medication"
      ? initial.medicine
      : null,
  );
  const [substance, setSubstance] = useState(
    initial.state === "known" && initial.category === "allergy"
      ? initial.substance
      : "",
  );
  const [reaction, setReaction] = useState(
    initial.state === "known" && initial.category === "allergy"
      ? initial.reaction
      : "",
  );
  const [details, setDetails] = useState(
    initial.state === "known" && initial.category === "medication"
      ? initial.details
      : "",
  );
  const [diagnosticStatus, setDiagnosticStatus] = useState<
    "hypothesis" | "confirmed"
  >(
    initial.state === "known" && initial.category === "diagnosis"
      ? initial.diagnosticStatus
      : "hypothesis",
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const current = patient.clinicalFacts?.find((f) => f.id === id);
  const guard = useDraftGuard(current, patient.revision);
  function state(value: string) {
    if (value === "unresolved" && initial.state === "unresolved") {
      setContent(initial);
      return;
    }
    setContent({
      category: content.category,
      state: value,
    } as ClinicalFactValue);
  }
  function build(): ClinicalFactValue {
    if (content.state === "unknown" || content.state === "unresolved")
      return content;
    if (content.category === "allergy")
      return content.state === "none-known"
        ? { category: "allergy", state: "none-known" }
        : { category: "allergy", state: "known", substance, reaction };
    if (content.category === "medication") {
      if (!medicine) throw new Error("Выберите лекарство из ГРЛС.");
      return { category: "medication", state: "known", medicine, details };
    }
    if (!condition) throw new Error("Выберите запись МКБ-10.");
    return content.category === "diagnosis"
      ? { category: "diagnosis", state: "known", condition, diagnosticStatus }
      : { category: "somatic", state: "known", condition };
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (guard.conflict)
        throw new Error(
          "Факт изменён в другой сессии. Закройте форму и откройте актуальную версию.",
        );
      const value = build();
      const source =
        origin.kind === "clinician" && !origin.quote.trim()
          ? { ...origin, quote: factValueText(value) }
          : origin;
      await actions.mutate(
        patient.id,
        {
          type: "fact.save",
          value: {
            id,
            expectedVersion: version,
            content: value,
            origin: source,
            reason,
          },
        },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  function reload() {
    if (!current) return;
    const v = latestFact(current);
    setVersion(v.version);
    setContent(v.content);
    setOrigin(v.origin);
    if (v.content.state === "known") {
      if (
        v.content.category === "diagnosis" ||
        v.content.category === "somatic"
      )
        setCondition(v.content.condition);
      if (v.content.category === "diagnosis")
        setDiagnosticStatus(v.content.diagnosticStatus);
      if (v.content.category === "medication") {
        setMedicine(v.content.medicine);
        setDetails(v.content.details);
      }
      if (v.content.category === "allergy") {
        setSubstance(v.content.substance);
        setReaction(v.content.reaction);
      }
    }
    setReason("");
    setError("");
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={fact ? "Уточнение клинического факта" : "Новый клинический факт"}
    >
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <DraftConflict guard={guard} allowKeep={false} onReload={reload}>
          <p>
            Исправление сохраняется отдельной версией. Исходные сведения
            остаются в истории.
          </p>
        </DraftConflict>
        <Select
          label="Категория сведений"
          value={content.category}
          disabled={!!fact || !!legacy}
          onChange={(e) => {
            setContent({
              category: e.target.value as ClinicalFactCategory,
              state: "unknown",
            });
            setCondition(null);
            setMedicine(null);
          }}
        >
          {Object.entries(factCategoryLabels).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          label="Содержание сведений"
          value={content.state}
          onChange={(e) => state(e.target.value)}
        >
          <option value="unknown">Данных нет / неизвестно</option>
          <option value="known">Есть конкретные сведения</option>
          {content.category === "allergy" && (
            <option value="none-known">Явно отрицает известные аллергии</option>
          )}
          {(initial.state === "unresolved" ||
            content.state === "unresolved") && (
            <option value="unresolved">Прежний текст, ещё не разобран</option>
          )}
        </Select>
        {content.state === "unknown" && (
          <p className={styles.inlineNote}>
            Неизвестно не означает отсутствия болезни, лекарств или аллергии.
            Такой факт нельзя подтвердить как отрицательный результат.
          </p>
        )}
        {content.state === "unresolved" && (
          <p className={styles.inlineNote}>{content.text}</p>
        )}
        {content.state === "known" &&
          (content.category === "diagnosis" ||
            content.category === "somatic") && (
            <TerminologyPicker
              label="МКБ-10 для клинического факта"
              value={condition ? [condition] : []}
              multiple={false}
              onChange={(items) => setCondition(items[0] ?? null)}
            />
          )}
        {content.state === "known" && content.category === "diagnosis" && (
          <Select
            label="Клинический статус диагноза"
            value={diagnosticStatus}
            onChange={(e) =>
              setDiagnosticStatus(e.target.value as "hypothesis" | "confirmed")
            }
          >
            <option value="hypothesis">Рабочая гипотеза</option>
            <option
              value="confirmed"
              disabled={actions.actor.specialty !== "psychiatrist"}
            >
              Подтверждённый диагноз — решение психиатра
            </option>
          </Select>
        )}
        {content.state === "known" && content.category === "medication" && (
          <>
            <MedicinePicker value={medicine} onChange={setMedicine} />
            <Textarea
              label="Сведения о фактическом приёме"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              hint="Самоотчёт и проверка факта не назначают и не отменяют лечение"
            />
          </>
        )}
        {content.state === "known" && content.category === "allergy" && (
          <>
            <Field
              label="Аллерген / препарат / вещество"
              value={substance}
              onChange={(e) => setSubstance(e.target.value)}
              required
            />
            <Textarea
              label="Описание реакции"
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
            />
          </>
        )}
        <Select
          label="Происхождение сведений"
          value={origin.kind}
          onChange={(e) =>
            setOrigin({
              kind: e.target.value as ClinicalFactOrigin["kind"],
              reference:
                e.target.value === "clinician"
                  ? "Клиническая запись врача"
                  : "",
              quote: "",
              observedAt:
                e.target.value === "document" ? "" : new Date().toISOString(),
            })
          }
        >
          {Object.entries(factOriginLabels)
            .filter(([k]) => k !== "legacy" || origin.kind === "legacy")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </Select>
        {origin.kind === "document" ? (
          <Select
            label="Документ текущей карты"
            value={origin.reference}
            onChange={(e) =>
              setOrigin({ ...origin, reference: e.target.value })
            }
            required
          >
            <option value="">Выберите документ</option>
            {patient.documents
              .filter((d) => d.status !== "excluded")
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
          </Select>
        ) : (
          <Field
            label="Ссылка / описание источника"
            value={origin.reference}
            readOnly={origin.kind === "legacy"}
            onChange={(e) =>
              setOrigin({ ...origin, reference: e.target.value })
            }
            required
          />
        )}
        <Textarea
          label="Исходные сведения / цитата"
          value={origin.quote}
          readOnly={origin.kind === "legacy"}
          required={origin.kind !== "clinician"}
          onChange={(e) => setOrigin({ ...origin, quote: e.target.value })}
          hint={
            origin.kind === "clinician"
              ? "Можно оставить пустым: сохранится выбранное врачом значение"
              : "Исходный текст останется после подтверждения"
          }
        />
        <Field
          label="Когда сведения получены"
          type="datetime-local"
          disabled={origin.kind === "legacy"}
          value={
            origin.observedAt
              ? new Date(
                  new Date(origin.observedAt).getTime() -
                    new Date(origin.observedAt).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : ""
          }
          onChange={(e) =>
            setOrigin({
              ...origin,
              observedAt: e.target.value
                ? new Date(e.target.value).toISOString()
                : "",
            })
          }
          hint="Пустое поле означает, что дата источника неизвестна"
        />
        <Textarea
          label="Причина исправления"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required={!!fact}
          hint={
            legacy
              ? "Нужна при изменении смысла прежней записи"
              : "Для нового факта не обязательна"
          }
        />
        <p className={styles.subtext}>
          Сохранение не подтверждает клинические сведения. Подтверждение
          выполняется отдельно.
        </p>
        <div className={styles.row}>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy || guard.conflict}>
            Сохранить сведения
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ClinicalFacts({
  patient,
  actions,
}: {
  patient: PatientRecord;
  actions?: WorkspaceActions;
  compact?: boolean;
}) {
  const [editor, setEditor] = useState<{
    fact?: ClinicalFact;
    legacy?: LegacyClinicalFact;
    category?: ClinicalFactCategory;
  } | null>(null);
  const [review, setReview] = useState<{
    fact: ClinicalFact;
    decision: ClinicalFactDecision;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const active = (patient.clinicalFacts ?? []).filter(
    (f) => latestFact(f).status !== "inactive",
  );
  const archived = (patient.clinicalFacts ?? []).filter(
    (f) => latestFact(f).status === "inactive",
  );
  const legacy = legacyClinicalFacts(patient);
  const canWrite = !!actions && !patient.archived;
  async function decide(event: FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!review || !actions) return;
    try {
      await actions.mutate(
        patient.id,
        {
          type: "fact.review",
          id: review.fact.id,
          expectedVersion: latestFact(review.fact).version,
          decision: review.decision,
          reason,
        },
        patient.revision,
      );
      setReview(null);
      setReason("");
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  const decisionLabels: Record<ClinicalFactDecision, string> = {
    confirm: "Подтвердить сведения",
    clarify: "Требует уточнения",
    contradict: "Отметить противоречие",
    unknown: "Неизвестно",
    inactivate: "Перевести в историю",
  };
  function card(fact: ClinicalFact) {
    const v = latestFact(fact);
    const changedSource = legacy.some(
      (r) =>
        r.changed && v.origin.kind === "legacy" && r.key === v.origin.reference,
    );
    const excludedSource =
      v.origin.kind === "document" &&
      !patient.documents.some(
        (d) =>
          d.id === v.origin.reference &&
          d.status !== "excluded" &&
          d.text.includes(v.origin.quote),
      );
    return (
      <article
        className={styles.inlineNote}
        key={fact.id}
        aria-label={`Факт: ${factValueText(v.content)}`}
      >
        <p>
          <strong>{factValueText(v.content)}</strong>
        </p>
        <p>
          {factStatusLabels[v.status]} · {factOriginLabels[v.origin.kind]}
        </p>
        {changedSource && (
          <p role="status">
            В прежней записи появились изменения. Нужна сверка; они не заменяют
            проверенный факт автоматически.
          </p>
        )}
        {excludedSource && (
          <p role="status">
            Документ-источник исключён или изменён. Прежнее подтверждение
            сохранено в истории; нужна новая сверка применимости сведений.
          </p>
        )}
        <p className={styles.subtext}>
          {v.origin.observedAt
            ? `Получено: ${new Date(v.origin.observedAt).toLocaleString("ru-RU")}`
            : "Дата источника неизвестна"}{" "}
          · {v.origin.reference}
        </p>
        <p className={styles.subtext}>
          {v.verifiedBy
            ? `Проверил: ${v.verifiedBy.name} · ${new Date(v.verifiedAt).toLocaleString("ru-RU")}`
            : `Записал: ${v.changedBy.name} · ${new Date(v.changedAt).toLocaleString("ru-RU")}`}
        </p>
        <details className={styles.details}>
          <summary>Источник и история ({fact.versions.length})</summary>
          {fact.versions.map((version) => (
            <div className={styles.stack} key={version.version}>
              <p>
                Версия {version.version} · {factStatusLabels[version.status]} ·{" "}
                {version.changedBy.name} ·{" "}
                {new Date(version.changedAt).toLocaleString("ru-RU")}
              </p>
              <p>{factValueText(version.content)}</p>
              <p>
                {factOriginLabels[version.origin.kind]} ·{" "}
                {version.origin.reference}
              </p>
              <blockquote>{version.origin.quote}</blockquote>
              {version.reason && <p>Причина: {version.reason}</p>}
            </div>
          ))}
        </details>
        {canWrite && v.status !== "inactive" && (
          <div className={styles.row}>
            <Button
              type="button"
              variant="secondary"
              disabled={
                actions!.busy ||
                v.content.state === "unknown" ||
                v.content.state === "unresolved" ||
                (v.content.category === "diagnosis" &&
                  actions!.actor.specialty !== "psychiatrist")
              }
              onClick={() => {
                setReview({ fact, decision: "confirm" });
                setReason("");
                setError("");
              }}
            >
              Подтвердить факт
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditor({ fact })}
            >
              Исправить факт
            </Button>
            {(["clarify", "contradict", "inactivate"] as const).map(
              (decision) => (
                <Button
                  key={decision}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setReview({ fact, decision });
                    setReason("");
                    setError("");
                  }}
                >
                  {decisionLabels[decision]}
                </Button>
              ),
            )}
          </div>
        )}
      </article>
    );
  }
  return (
    <section className={styles.form} aria-label="Единый клинический контекст">
      <div className={styles.between}>
        <h3>Клинический контекст</h3>
        {canWrite && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEditor({})}
          >
            Добавить клинический факт
          </Button>
        )}
      </div>
      {Object.entries(factCategoryLabels).map(([category, label]) => {
        const records = active.filter(
          (f) => latestFact(f).content.category === category,
        );
        return (
          <div className={styles.stack} key={category}>
            <h4>{label}</h4>
            {records.length ? (
              records.map(card)
            ) : (
              <p className={styles.subtext}>
                Неизвестно · проверенных сведений в реестре пока нет
              </p>
            )}
          </div>
        );
      })}
      {!!archived.length && (
        <details className={styles.details}>
          <summary>Неактуальные сведения ({archived.length})</summary>
          {archived.map(card)}
        </details>
      )}
      {editor && actions && (
        <FactEditor
          key={editor.fact?.id ?? editor.legacy?.key ?? "new"}
          patient={patient}
          actions={actions}
          {...editor}
          onClose={() => setEditor(null)}
        />
      )}
      {review && actions && (
        <Modal
          open
          onClose={() => setReview(null)}
          title="Решение по клиническому факту"
        >
          <form className={styles.form} onSubmit={decide}>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <p>{factValueText(latestFact(review.fact).content)}</p>
            <p>
              {factOriginLabels[latestFact(review.fact).origin.kind]} ·{" "}
              {latestFact(review.fact).origin.reference}
            </p>
            <p>
              Подтверждение относится к этим сведениям и не назначает лечение.
            </p>
            <Textarea
              label="Причина решения по факту"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={
                review.decision === "contradict" ||
                review.decision === "inactivate"
              }
            />
            <div className={styles.row}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReview(null)}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={actions.busy}>
                {decisionLabels[review.decision]}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
