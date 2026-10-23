import { useState, type FormEvent } from "react";
import type { ClinicalDocument, PatientRecord } from "./model";
import type { WorkspaceActions } from "./useWorkspace";
import { message } from "./useWorkspace";
import { extractCandidates } from "./extraction";
import { formatDate, today } from "./labels";
import { SourceLinks } from "./SourceLibrary";
import { DraftConflict, useDraftGuard } from "./DraftConflict";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  Section,
  Textarea,
  styles,
} from "./ui/Elements";
export function Documents({
  patient,
  actions,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
}) {
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState<ClinicalDocument | null>(null);
  return (
    <>
      <Section
        title="Документы и происхождение сведений"
        description="Сначала оригинал и фрагмент, затем подтверждение врачом"
        action={
          <Button icon="plus" onClick={() => setForm(true)}>
            Добавить документ
          </Button>
        }
      >
        {patient.documents.map((doc) => (
          <article className={styles.inlineNote} key={doc.id}>
            <div className={styles.between}>
              <h3>{doc.title}</h3>
              <Badge
                tone={
                  doc.status === "excluded"
                    ? "red"
                    : doc.status === "verified"
                      ? "green"
                      : "amber"
                }
              >
                {
                  {
                    excluded: "Исключён из использования",
                    verified: "Факты проверены",
                    unverified: "Требует проверки",
                  }[doc.status]
                }
              </Badge>
            </div>
            <p>
              {doc.issuer} · {formatDate(doc.documentDate)}
            </p>
            <Button
              variant="ghost"
              icon="file"
              onClick={() => setSelected(doc)}
            >
              Оригинал и факты
            </Button>
          </article>
        ))}
        {!patient.documents.length && (
          <Empty title="Документы ещё не добавлены" icon="file">
            Добавьте текст выписки или истории болезни, сохраните источник и
            подтвердите нужные фрагменты.
          </Empty>
        )}
        <SourceLinks ids={["S10", "S11"]} />
      </Section>
      <Section
        title="Журнал изменений"
        description="Автор, время и действие сохраняются вместе с версией карты"
      >
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Время</th>
                <th>Автор</th>
                <th>Действие</th>
                <th>Основание</th>
              </tr>
            </thead>
            <tbody>
              {patient.audit
                .slice()
                .reverse()
                .map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {formatDate(entry.createdAt, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>{entry.author}</td>
                    <td>{auditLabel(entry.action)}</td>
                    <td>{entry.detail || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!patient.audit.length && (
          <p className={styles.subtext}>
            После первого изменения здесь появится запись.
          </p>
        )}
      </Section>
      {form && (
        <DocumentForm
          patient={patient}
          actions={actions}
          onClose={() => setForm(false)}
        />
      )}
      {selected && (
        <DocumentReview
          key={selected.id}
          patient={patient}
          actions={actions}
          document={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function initialFacts(doc: ClinicalDocument) {
  return doc.status === "excluded"
    ? []
    : doc.facts.length
      ? structuredClone(doc.facts)
      : extractCandidates(doc.text);
}
function DocumentReview({
  patient,
  actions,
  document,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  document: ClinicalDocument;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(document);
  const [facts, setFacts] = useState(() => initialFacts(document));
  const [error, setError] = useState("");
  const current = patient.documents.find((doc) => doc.id === document.id);
  const guard = useDraftGuard(current, patient.revision);
  async function save() {
    try {
      if (guard.conflict)
        throw new Error(
          "Сначала сравните изменения документа и выберите актуальные данные или свой вариант.",
        );
      await actions.mutate(
        patient.id,
        { type: "document.facts", id: document.id, facts },
        guard.expectedRevision,
      );
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={() => onClose()} title="Оригинал и проверка фактов">
      {selected && (
        <div className={styles.form}>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <DraftConflict
            guard={guard}
            allowKeep={current?.status !== "excluded" && !!current}
            onReload={() => {
              if (current) {
                setSelected(current);
                setFacts(initialFacts(current));
                setError("");
              }
            }}
          >
            <h4>Факты в актуальной записи</h4>
            {current?.facts.map((fact) => (
              <p key={fact.id} className={styles.reviewText}>
                <strong>{fact.field}</strong>: {fact.value}
                <br />
                {fact.confirmed ? "Проверено по оригиналу" : "Не подтверждено"}
              </p>
            ))}
            {!current?.facts.length && <p>Подтверждённых фактов нет.</p>}
            {current?.status === "excluded" && (
              <p>Документ исключён: {current.exclusionReason}</p>
            )}
          </DraftConflict>
          <h3>{selected.title}</h3>
          <div className={styles.notice}>
            {selected.status === "excluded"
              ? `Исключён из клинического использования: ${selected.exclusionReason}`
              : "Автоматически выделены только строки с распознаваемыми заголовками. Проверяйте формулировку, отрицания, дату и источник. Кандидат не добавляется в клиническое заключение автоматически."}
          </div>
          <details className={styles.details} open>
            <summary>Исходный текст</summary>
            <p className={styles.reviewText}>{selected.text}</p>
          </details>
          {selected.status !== "excluded" && (
            <>
              <div className={styles.smallStack}>
                {facts.map((fact, i) => (
                  <div className={styles.details} key={fact.id}>
                    <Field
                      label="Тип сведений"
                      value={fact.field}
                      onChange={(e) =>
                        setFacts(
                          facts.map((f, j) =>
                            j === i ? { ...f, field: e.target.value } : f,
                          ),
                        )
                      }
                    />
                    <p className={styles.subtext} style={{ margin: "10px 0" }}>
                      Оригинал: «{fact.quote}»
                    </p>
                    <Textarea
                      label="Формулировка врача"
                      value={fact.value}
                      onChange={(e) =>
                        setFacts(
                          facts.map((f, j) =>
                            j === i
                              ? {
                                  ...f,
                                  value: e.target.value,
                                  confirmed: false,
                                }
                              : f,
                          ),
                        )
                      }
                      rows={2}
                    />
                    <label
                      className={styles.checkLabel}
                      style={{ marginTop: 10 }}
                    >
                      <input
                        type="checkbox"
                        checked={fact.confirmed}
                        onChange={(e) =>
                          setFacts(
                            facts.map((f, j) =>
                              j === i
                                ? { ...f, confirmed: e.target.checked }
                                : f,
                            ),
                          )
                        }
                      />
                      <span>Проверено по оригиналу, контекст сохранён</span>
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => setFacts(facts.filter((_, j) => j !== i))}
                    >
                      Убрать кандидат
                    </Button>
                  </div>
                ))}
              </div>
              {!facts.length && (
                <p className={styles.subtext}>
                  Структурированные разделы не распознаны. Добавьте точную
                  цитату вручную.
                </p>
              )}
              <Button
                variant="secondary"
                icon="plus"
                onClick={() =>
                  setFacts([
                    ...facts,
                    {
                      id: crypto.randomUUID(),
                      field: "",
                      quote: selected.text,
                      value: "",
                      confirmed: false,
                    },
                  ])
                }
              >
                Выделить факт вручную
              </Button>
              {facts.some((f) => f.quote === selected.text) && (
                <p className={styles.subtext}>
                  Для ручного кандидата основанием служит полный текст
                  оригинала.
                </p>
              )}
              <div className={styles.formActions}>
                <Button variant="secondary" onClick={() => onClose()}>
                  Закрыть
                </Button>
                <Button onClick={() => void save()} disabled={actions.busy}>
                  Сохранить проверку
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
function DocumentForm({
  patient,
  actions,
  onClose,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [documentDate, setDate] = useState(today());
  const [text, setText] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await actions.mutate(patient.id, {
        type: "document.add",
        value: {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          title,
          issuer,
          documentDate,
          text,
          status: excluded ? "excluded" : "unverified",
          exclusionReason: reason,
          facts: [],
        },
      });
      onClose();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <Modal open onClose={onClose} title="Добавить исходный документ">
      <form className={styles.form} onSubmit={save}>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <Field
          label="Название документа"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Field
          label="Автор / организация / источник"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          required
        />
        <Field
          label="Дата документа"
          type="date"
          value={documentDate}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <Field
          label="Загрузить текстовый файл"
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 100000) {
              setError("Текстовый файл: не более 100 КБ.");
              return;
            }
            const content = await file.text();
            if (content.length > 20000) {
              setError("Для одного документа доступно 20 000 символов текста.");
              return;
            }
            setText(content);
            if (!title) setTitle(file.name);
          }}
        />
        <Textarea
          label="Текст оригинала"
          hint="Вставьте текст выписки или распознанного документа. Оригинальную формулировку можно проверить до сохранения."
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          rows={8}
          maxLength={20000}
        />
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={excluded}
            onChange={(e) => setExcluded(e.target.checked)}
          />
          <span>
            Материал исключён из клинического использования по установленному
            основанию
          </span>
        </label>
        {excluded && (
          <Textarea
            label="Акт и основание исключения"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        )}
        <SourceLinks ids={["S10", "S11"]} />
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={actions.busy}>
            Сохранить оригинал
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function auditLabel(action: string) {
  return (
    (
      {
        "profile.update": "Профиль обновлён",
        "episode.save": "Эпизод сохранён",
        "visit.save": "Приём сохранён",
        "visit.complete": "Приём подтверждён",
        "visit.print": "Подготовлена рабочая копия для печати",
        "visit.cancel": "Приём отменён",
        "visit.addendum": "Дополнение к приёму",
        "measurement.add": "Оценка добавлена",
        "assessment.save": "Подготовительная форма шкалы сохранена",
        "plan.save": "Черновик плана сохранён",
        "plan.confirm": "План подтверждён",
        "plan.status": "Статус назначения изменён",
        "report.add": "Дневник дополнен",
        "report.review": "Самоотчёт просмотрен",
        "event.add": "Событие создано",
        "event.transition": "Этап обработки события",
        "consent.add": "Волеизъявление зафиксировано",
        "message.send": "Сообщение сохранено",
        "referral.save": "Направление сохранено",
        "document.add": "Документ добавлен",
        "document.facts": "Факты документа проверены",
        "patient.archive": "Статус карты изменён",
      } as Record<string, string>
    )[action] ?? action
  );
}
