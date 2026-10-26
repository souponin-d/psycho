import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  assessmentCatalog,
  calculateAssessment,
  type AssessmentForm,
} from "./assessmentCatalog";
import {
  CurrentDraftValues,
  DraftConflict,
  useDraftGuard,
} from "./DraftConflict";
import { formatDate, localDateTime } from "./labels";
import type {
  AssessmentDraft,
  AssessmentFormDefinition,
  PatientRecord,
} from "./model";
import { SourceLinks } from "./SourceLibrary";
import { message, type WorkspaceActions } from "./useWorkspace";
import {
  Badge,
  Button,
  Empty,
  ErrorNotice,
  Field,
  Modal,
  Section,
  Select,
  Textarea,
  styles,
} from "./ui/Elements";

type FormItem = AssessmentFormDefinition["sections"][number]["items"][number];
type FormSection = AssessmentFormDefinition["sections"][number];
const assessorLabels = { patient: "Пациент", clinician: "Специалист" };
const calculationLabels: Record<AssessmentForm["calculation"], string> = {
  sum: "Сумма ответов",
  mean: "Среднее значение",
  subscales: "Отдельные подшкалы",
  indices: "Отдельные индексы",
  formula: "Расчёт по формуле",
  unsupported: "Расчёт не подготовлен",
};
const stampOptions: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};
const numberFormat = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 3,
});

/** These forms are preparation drafts, never clinical measurements or active rules. */
export function AssessmentForms({
  patient,
  actions,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
}) {
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [selection, setSelection] = useState<{
    form: AssessmentForm;
    draftId?: string;
  }>();
  const [savedMessage, setSavedMessage] = useState("");
  const availableForms = assessmentCatalog.filter(
    (form) => !(form.id === "PHQ-9" && form.sourceStatus === "missing-source"),
  );
  const forms = availableForms.filter((form) =>
    `${form.id} ${form.title}`
      .toLocaleLowerCase("ru")
      .includes(query.trim().toLocaleLowerCase("ru")),
  );
  const drafts = [...(patient.assessmentDrafts ?? [])].sort((a, b) =>
    b.measuredAt.localeCompare(a.measuredAt),
  );
  const selectedForms = assessmentCatalog.filter((form) =>
    compare.includes(form.id),
  );

  return (
    <Section
      title="Другие формы шкал"
      description="Подготовительные формы: ответы сохраняются как черновики и не включаются в динамику."
    >
      <div className={styles.stack}>
        {savedMessage && (
          <p className={styles.saved} role="status">
            {savedMessage}
          </p>
        )}
        {drafts.length > 0 && (
          <div className={styles.smallStack}>
            <h3>Сохранённые черновики · {drafts.length}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption style={{ textAlign: "left", paddingBottom: 10 }}>
                  Подготовительные записи; в графики не включены
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Форма и версия</th>
                    <th scope="col">Дата заполнения</th>
                    <th scope="col">Ответы</th>
                    <th scope="col">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((draft) => {
                    const form = assessmentCatalog.find(
                      (item) =>
                        item.sourceId === draft.sourceId &&
                        item.sourceHash === draft.sourceHash &&
                        item.version === draft.formVersion,
                    );
                    return (
                      <tr key={draft.id}>
                        <th scope="row">
                          <strong>
                            {form?.title ?? `Форма ${draft.sourceId}`}
                          </strong>
                          <p className={styles.subtext}>
                            {draft.formVersion} · Не утверждено
                          </p>
                          {!form && (
                            <p className={styles.subtext}>
                              Эта версия отсутствует в текущем каталоге; ответы
                              доступны для просмотра.
                            </p>
                          )}
                        </th>
                        <td>
                          {formatDate(draft.measuredAt, stampOptions)}
                          <p className={styles.subtext}>
                            {assessorLabels[draft.assessor]}
                          </p>
                        </td>
                        <td>
                          <details className={styles.details}>
                            <summary>
                              Заполнено: {answeredCount(draft.responses)}
                            </summary>
                            <dl className={styles.smallStack}>
                              {Object.entries(draft.responses)
                                .sort(([a], [b]) => naturalOrder(a, b))
                                .map(([key, value]) => (
                                  <div key={key}>
                                    <dt>Пункт {key}</dt>
                                    <dd
                                      style={{
                                        margin: 0,
                                        overflowWrap: "anywhere",
                                      }}
                                    >
                                      {hasAnswer(value)
                                        ? String(value)
                                        : "Пропущен"}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                            {draft.note && (
                              <p className={styles.reviewText}>{draft.note}</p>
                            )}
                            <p className={styles.subtext}>
                              Сохранено{" "}
                              {formatDate(draft.createdAt, stampOptions)} ·{" "}
                              {draft.author}
                            </p>
                          </details>
                        </td>
                        <td>
                          <Button
                            variant="secondary"
                            disabled={!form || patient.archived}
                            onClick={() =>
                              form && setSelection({ form, draftId: draft.id })
                            }
                            aria-label={`Продолжить черновик: ${form?.title ?? draft.sourceId}`}
                          >
                            Продолжить
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className={styles.formPair}>
          <Field
            label="Найти форму"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Название или код источника"
          />
          <p
            className={styles.subtext}
            style={{ alignSelf: "end" }}
            role="status"
          >
            Показано {forms.length} из {availableForms.length}. Для сравнения
            выберите до трёх вариантов.
          </p>
        </div>
        {selectedForms.length > 0 && (
          <div className={styles.smallStack}>
            <div className={styles.between}>
              <h3>Сравнение вариантов</h3>
              <Button variant="ghost" onClick={() => setCompare([])}>
                Очистить сравнение
              </Button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption style={{ textAlign: "left", paddingBottom: 10 }}>
                  Сравнение устройства форм; значения разных шкал не
                  приравниваются
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Параметр</th>
                    {selectedForms.map((form) => (
                      <th scope="col" key={form.id}>
                        {form.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Кто заполняет</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>{assessorLabels[form.assessor]}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Период оценки</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>
                        {form.window || "Уточнить по источнику"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Пунктов в каталоге</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>
                        {form.itemCount ?? "Требует проверки"}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Предварительная арифметика</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>
                        {calculationLabels[form.calculation]}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Версия и источник</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>
                        <span style={{ overflowWrap: "anywhere" }}>
                          {form.version}
                        </span>
                        {form.sourceId ? (
                          <SourceLinks ids={[form.sourceId]} />
                        ) : (
                          <p>Источник не подключён</p>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">Ограничения</th>
                    {selectedForms.map((form) => (
                      <td key={form.id}>
                        {form.warnings.length ? (
                          <ul>
                            {form.warnings.map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                          </ul>
                        ) : (
                          "Требуется проверка перед утверждением"
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        {patient.archived && (
          <p className={styles.notice}>
            Карта архивирована. Сохранённые черновики доступны для чтения.
          </p>
        )}
        {forms.length ? (
          <div className={styles.sourceGrid}>
            {forms.map((form) => (
              <article key={form.id} className={styles.sourceCard}>
                <div className={styles.between}>
                  <Badge tone="neutral">{form.sourceId || form.id}</Badge>
                  <Badge tone="amber">
                    {form.sourceStatus === "missing-source"
                      ? "Нет источника"
                      : "Не утверждено"}
                  </Badge>
                </div>
                <h3>{form.title}</h3>
                <p>
                  {assessorLabels[form.assessor]} ·{" "}
                  {form.itemCount === null
                    ? "Число пунктов уточняется"
                    : `${form.itemCount} пунктов`}
                </p>
                <p>{form.window || "Период оценки уточняется по источнику"}</p>
                <details className={styles.details}>
                  <summary>Версия и источник</summary>
                  <p style={{ overflowWrap: "anywhere" }}>{form.version}</p>
                  {form.sourceId && <SourceLinks ids={[form.sourceId]} />}
                  {form.warnings.length > 0 && (
                    <ul>
                      {form.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </details>
                <div className={styles.sourceActions}>
                  <Button
                    variant="secondary"
                    disabled={
                      form.sourceStatus === "missing-source" || patient.archived
                    }
                    onClick={() => {
                      setSavedMessage("");
                      setSelection({ form });
                    }}
                    aria-label={`Заполнить черновик: ${form.title}`}
                  >
                    Заполнить черновик
                  </Button>
                  <label className={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={compare.includes(form.id)}
                      disabled={
                        !compare.includes(form.id) && compare.length >= 3
                      }
                      onChange={(event) =>
                        setCompare((current) =>
                          event.target.checked
                            ? [...current, form.id]
                            : current.filter((id) => id !== form.id),
                        )
                      }
                    />
                    Сравнить{" "}
                    <span
                      style={{
                        position: "absolute",
                        width: 1,
                        height: 1,
                        overflow: "hidden",
                        clipPath: "inset(50%)",
                      }}
                    >
                      {form.title}
                    </span>
                  </label>
                </div>
                {form.sourceStatus === "missing-source" && (
                  <p className={styles.subtext}>
                    Заполнение станет доступно после подключения точного
                    источника.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty icon="search" title="Форма не найдена">
            Попробуйте другое название или код источника.
          </Empty>
        )}
      </div>
      {selection && (
        <AssessmentWizard
          key={`${patient.id}:${selection.form.id}:${selection.draftId ?? "new"}`}
          patient={patient}
          actions={actions}
          form={selection.form}
          draftId={selection.draftId}
          onClose={() => setSelection(undefined)}
          onSaved={() => {
            setSelection(undefined);
            setSavedMessage("Черновик сохранён.");
          }}
        />
      )}
    </Section>
  );
}

function AssessmentWizard({
  patient,
  actions,
  form,
  draftId,
  onClose,
  onSaved,
}: {
  patient: PatientRecord;
  actions: WorkspaceActions;
  form: AssessmentForm;
  draftId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = patient.assessmentDrafts?.find(
    (draft) => draft.id === draftId,
  );
  const [value, setValue] = useState<AssessmentDraft>(() =>
    current
      ? { ...current, responses: { ...current.responses } }
      : {
          id: crypto.randomUUID(),
          createdAt: "",
          author: "",
          sourceId: form.sourceId,
          sourceHash: form.sourceHash,
          formVersion: form.version,
          measuredAt: new Date().toISOString(),
          assessor: form.assessor,
          responses: {},
          note: "",
          status: "unapproved",
        },
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(value));
  const [dateInput, setDateInput] = useState(() =>
    localDateTime(value.measuredAt),
  );
  const [definition, setDefinition] = useState<AssessmentFormDefinition>();
  const [sourceError, setSourceError] = useState("");
  const [sourceLoading, setSourceLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const closeHeading = useRef<HTMLHeadingElement>(null);
  const guard = useDraftGuard(current, patient.revision);
  const sourceHasText = !!definition?.sections.some(
    (section) => section.items.length > 0,
  );
  const sections = useMemo(
    () =>
      definition?.sections.some((section) => section.items.length > 0)
        ? definition.sections
        : fallbackSections(form),
    [definition, form],
  );
  const steps = [
    "Сведения",
    ...sections.map((section) => section.title),
    "Проверка и сохранение",
  ];
  const finalStep = steps.length - 1;
  const calculated = useMemo(() => {
    try {
      const responses = Object.fromEntries(
        form.items.map((item) => [item.key, value.responses[item.key] ?? null]),
      );
      return { result: calculateAssessment(form.id, responses), error: "" };
    } catch (caught) {
      return { result: undefined, error: message(caught) };
    }
  }, [form, value.responses]);
  const dirty =
    JSON.stringify(value) !== baseline ||
    dateInput !== localDateTime(value.measuredAt);

  useEffect(() => {
    const controller = new AbortController();
    setSourceLoading(true);
    setSourceError("");
    async function load() {
      try {
        const response = await fetch(
          `/api/assessment-forms/${encodeURIComponent(form.sourceId)}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Точный текст формы требует серверной сессии. В учебном режиме можно внести ответы по номерам из оригинала."
              : "Точный текст формы сейчас недоступен. Откройте оригинал источника и вносите ответы по номерам.",
          );
        const payload: unknown = await response.json();
        if (
          !isDefinition(payload) ||
          payload.sourceId !== form.sourceId ||
          payload.sourceHash !== form.sourceHash
        )
          throw new Error(
            "Полученный текст не совпадает с версией источника в каталоге. Используйте оригинал этой версии; текст не подставлен.",
          );
        if (controller.signal.aborted) return;
        setDefinition({
          ...payload,
          sections: payload.sections.map((section) => ({
            ...section,
            items: [...section.items].sort((a, b) => naturalOrder(a.id, b.id)),
          })),
        });
        if (!payload.sections.some((section) => section.items.length > 0))
          setSourceError(
            "Источник подключён, но точный текст пунктов ещё не подготовлен. Для заполнения нужен оригинал этой версии.",
          );
        setStep(0);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setDefinition(undefined);
          setSourceError(message(caught));
        }
      } finally {
        if (!controller.signal.aborted) setSourceLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [form.sourceId, form.sourceHash, loadAttempt]);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (closing) closeHeading.current?.focus();
  }, [closing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setResponse(key: string, response: number | string | null) {
    setValue((old) => ({
      ...old,
      responses: { ...old.responses, [key]: response },
    }));
    setFieldErrors((old) => {
      const next = { ...old };
      delete next[key];
      return next;
    });
  }
  function requestClose() {
    if (!pending.current) {
      if (dirty) setClosing(true);
      else onClose();
    }
  }
  function reloadCurrent() {
    if (!current) return;
    const next = { ...current, responses: { ...current.responses } };
    setValue(next);
    setBaseline(JSON.stringify(next));
    setDateInput(localDateTime(next.measuredAt));
    setError("");
    setFieldErrors({});
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (step !== finalStep) {
      setStep((index) => Math.min(index + 1, finalStep));
      return;
    }
    setError("");
    const invalid = validateResponses(value.responses, sections, form);
    if (!dateInput || !Number.isFinite(Date.parse(dateInput)))
      invalid.measuredAt = "Укажите дату и время заполнения.";
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) {
      setError(
        "Проверьте отмеченные поля. Пропуски допустимы; заполненные ответы должны соответствовать выбранной форме.",
      );
      const sectionIndex = sections.findIndex((section) =>
        section.items.some((item) => invalid[item.id]),
      );
      setStep(invalid.measuredAt ? 0 : Math.max(0, sectionIndex + 1));
      return;
    }
    if (guard.conflict) {
      setError(
        "Черновик изменён в другой сессии. Сравните версии перед сохранением.",
      );
      return;
    }
    if (draftId && !current) {
      setError(
        "Сохранённый черновик больше недоступен. Закройте форму и обновите карту.",
      );
      return;
    }
    if (calculated.error) {
      setError(calculated.error);
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await actions.mutate(
        patient.id,
        {
          type: "assessment.save",
          value: {
            ...value,
            measuredAt: new Date(dateInput).toISOString(),
            status: "unapproved",
          },
        },
        guard.expectedRevision,
      );
      onSaved();
    } catch (caught) {
      setError(message(caught));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const activeSection =
    step > 0 && step < finalStep ? sections[step - 1] : undefined;

  return (
    <Modal open onClose={requestClose} title={`${form.title} · черновик`}>
      <form className={styles.form} onSubmit={save} noValidate>
        <div className={styles.between}>
          <Badge tone="amber">Подготовка · не утверждено</Badge>
          <span className={styles.subtext} role="status">
            Шаг {step + 1} из {steps.length} · ответов{" "}
            {answeredCount(value.responses)}
          </span>
        </div>
        {closing && (
          <section
            className={styles.notice}
            aria-labelledby="assessment-close-title"
          >
            <h3 id="assessment-close-title" tabIndex={-1} ref={closeHeading}>
              Закрыть без сохранения?
            </h3>
            <p>
              Изменения этой формы ещё не сохранены в карте. Можно вернуться к
              заполнению или перейти к проверке и сохранить неполный черновик.
            </p>
            <div className={styles.row}>
              <Button
                variant="secondary"
                onClick={() => {
                  setClosing(false);
                  heading.current?.focus();
                }}
              >
                Продолжить заполнение
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setClosing(false);
                  setStep(finalStep);
                }}
              >
                К сохранению
              </Button>
              <Button variant="danger" onClick={onClose}>
                Закрыть без сохранения
              </Button>
            </div>
          </section>
        )}
        {error && <ErrorNotice>{error}</ErrorNotice>}
        <DraftConflict
          guard={guard}
          onReload={reloadCurrent}
          allowKeep={!!current}
        >
          <CurrentDraftValues
            current={current ? draftSummary(current) : undefined}
            draft={draftSummary(value)}
            labels={{
              measuredAt: "Дата заполнения",
              assessor: "Кто заполняет",
              responses: "Ответы",
              note: "Примечание",
            }}
          />
        </DraftConflict>
        <nav className={styles.row} aria-label="Шаги заполнения формы">
          {steps.map((title, index) => (
            <Button
              key={`${index}:${title}`}
              variant={index === step ? "primary" : "ghost"}
              aria-current={index === step ? "step" : undefined}
              disabled={sourceLoading || saving}
              onClick={() => setStep(index)}
            >
              {index + 1}. {title}
            </Button>
          ))}
        </nav>
        <h3 tabIndex={-1} ref={heading}>
          {steps[step]}
        </h3>
        {step === 0 && (
          <>
            <div className={styles.notice}>
              Пустой ответ — пропуск; 0 — заполненный ответ. Сохраните черновик
              кнопкой внизу формы.
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Версия формы</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{form.version}</dd>
              </div>
              <div>
                <dt>Период оценки</dt>
                <dd>{form.window || "Уточнить по источнику"}</dd>
              </div>
              <div>
                <dt>Источник</dt>
                <dd>
                  {form.sourceId}
                  <SourceLinks ids={[form.sourceId]} />
                </dd>
              </div>
            </dl>
            <details className={styles.details}>
              <summary>Контрольная сумма источника</summary>
              <code style={{ overflowWrap: "anywhere" }}>
                {form.sourceHash}
              </code>
            </details>
            {sourceLoading && (
              <p role="status">Загружаем точный текст формы…</p>
            )}
            {sourceError && (
              <div className={styles.notice} role="status">
                <p>{sourceError}</p>
                <p>
                  Поля ниже содержат только номера и допустимый диапазон. Они не
                  заменяют формулировки и варианты ответа из оригинала.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Повторить загрузку текста
                </Button>
              </div>
            )}
            {sourceHasText && (
              <p className={styles.subtext}>
                Точный текст загружен из источника {definition!.sourceId};
                контрольная сумма совпадает.
              </p>
            )}
            <Warnings
              warnings={[...form.warnings, ...(definition?.warnings ?? [])]}
            />
            <div className={styles.formPair}>
              <Field
                label="Дата и время заполнения"
                type="datetime-local"
                value={dateInput}
                error={fieldErrors.measuredAt}
                required
                onChange={(event) => setDateInput(event.target.value)}
              />
              <Select
                label="Кто заполняет"
                value={value.assessor}
                onChange={(event) =>
                  setValue((old) => ({
                    ...old,
                    assessor: event.target.value as AssessmentDraft["assessor"],
                  }))
                }
              >
                <option value="patient">Пациент</option>
                <option value="clinician">Специалист</option>
              </Select>
            </div>
            <Textarea
              label="Примечание к заполнению"
              value={value.note}
              onChange={(event) =>
                setValue((old) => ({ ...old, note: event.target.value }))
              }
              hint="Контекст заполнения или причина пропусков — при необходимости."
            />
          </>
        )}
        {activeSection && (
          <>
            {!sourceHasText && (
              <p className={styles.notice}>
                Текст пунктов недоступен. Сверяйте номер и значение с оригиналом
                источника {form.sourceId}. Пропуск можно оставить пустым.
              </p>
            )}
            {activeSection.items.map((item) => (
              <div key={item.id} style={{ whiteSpace: "pre-wrap" }}>
                <ResponseField
                  item={item}
                  form={form}
                  value={value.responses[item.id] ?? null}
                  error={fieldErrors[item.id]}
                  onChange={(response) => setResponse(item.id, response)}
                />
              </div>
            ))}
            {activeSection.items.length === 0 && (
              <p className={styles.notice}>
                В этом разделе нет подготовленных полей. Сверьте структуру с
                оригиналом.
              </p>
            )}
          </>
        )}
        {step === finalStep && (
          <>
            <dl className={styles.facts}>
              <div>
                <dt>Дата заполнения</dt>
                <dd>{formatDate(dateInput, stampOptions)}</dd>
              </div>
              <div>
                <dt>Кто заполняет</dt>
                <dd>{assessorLabels[value.assessor]}</dd>
              </div>
              <div>
                <dt>Заполнено ответов</dt>
                <dd>
                  {answeredCount(value.responses)} из{" "}
                  {sections.reduce(
                    (total, section) => total + section.items.length,
                    0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Версия</dt>
                <dd style={{ overflowWrap: "anywhere" }}>{form.version}</dd>
              </div>
            </dl>
            <h4>Расчёт по ответам</h4>
            <p className={styles.notice}>
              Пропущенные ответы не заменяются нулями.
            </p>
            {calculated.error && <ErrorNotice>{calculated.error}</ErrorNotice>}
            {calculated.result && (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <caption style={{ textAlign: "left", paddingBottom: 10 }}>
                      Черновой расчёт по текущим ответам
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Показатель</th>
                        <th scope="col">Значение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculated.result.outputs.map((output, index) => (
                        <tr key={index}>
                          <th scope="row">{output.label}</th>
                          <td>
                            {output.value === null
                              ? "Не рассчитано"
                              : numberFormat.format(output.value)}
                            {output.maximum !== undefined &&
                            output.value !== null
                              ? ` из ${numberFormat.format(output.maximum)}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!calculated.result.complete && (
                  <p className={styles.subtext}>
                    Форма заполнена не полностью или расчёт для неё пока
                    недоступен. Черновик можно сохранить с пропусками.
                  </p>
                )}
                <Warnings warnings={calculated.result.warnings} />
              </>
            )}
            <details className={styles.details}>
              <summary>Проверить внесённые ответы</summary>
              <div className={styles.smallStack}>
                {sections.map((section) => (
                  <section key={section.id}>
                    <h4>{section.title}</h4>
                    <dl className={styles.smallStack}>
                      {section.items.map((item) => (
                        <div key={item.id}>
                          <dt>{item.label}</dt>
                          <dd
                            style={{
                              margin: "4px 0 0",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {responseLabel(
                              item,
                              value.responses[item.id] ?? null,
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            </details>
            {value.note && <p className={styles.reviewText}>{value.note}</p>}
            <p className={styles.notice}>
              Черновик сохраняется отдельно от результатов оценки.
            </p>
          </>
        )}
        <div className={styles.formActions} style={{ flexWrap: "wrap" }}>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Закрыть
          </Button>
          {step > 0 && (
            <Button
              variant="secondary"
              onClick={() => setStep((index) => index - 1)}
              disabled={saving}
            >
              Назад
            </Button>
          )}
          {step < finalStep ? (
            <Button type="submit" disabled={sourceLoading || saving}>
              Далее
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={
                saving || actions.busy || patient.archived || guard.conflict
              }
            >
              {saving ? "Сохраняем…" : "Сохранить черновик"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function ResponseField({
  item,
  form,
  value,
  error,
  onChange,
}: {
  item: FormItem;
  form: AssessmentForm;
  value: number | string | null;
  error?: string;
  onChange: (value: number | string | null) => void;
}) {
  const errorId = useId();
  const catalogItem = form.items.find((entry) => entry.key === item.id);
  const minimum = catalogItem?.minimum ?? item.min;
  const maximum = catalogItem?.maximum ?? item.max;
  if (item.options?.length) {
    const selected = item.options.findIndex((option) => option.value === value);
    return (
      <div className={styles.smallStack}>
        <Select
          label={item.label}
          value={
            selected < 0
              ? hasAnswer(value)
                ? "saved-unmatched"
                : ""
              : String(selected)
          }
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? null
                : (item.options![Number(event.target.value)]?.value ?? null),
            )
          }
        >
          <option value="">Пропущен / не заполнен</option>
          {selected < 0 && hasAnswer(value) && (
            <option value="saved-unmatched" disabled>
              Сохранённый ответ: {String(value)} (нет в списке)
            </option>
          )}
          {item.options.map((option, index) => (
            <option value={index} key={index}>
              {option.label || String(option.value)}
            </option>
          ))}
        </Select>
        {error && (
          <p id={errorId} className={styles.errorText} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  if (
    (minimum !== undefined || maximum !== undefined) &&
    typeof value === "string"
  )
    return (
      <Field
        label={item.label}
        aria-label={item.label}
        value={value}
        error={error}
        hint={`Пункт ${item.id}. Сохранён текстовый вариант из оригинала; точный список вариантов сейчас недоступен. Можно оставить ответ или очистить поле.`}
        onChange={(event) => onChange(event.target.value || null)}
      />
    );
  if (minimum !== undefined || maximum !== undefined)
    return (
      <Field
        label={item.label}
        aria-label={item.label}
        type="number"
        inputMode="decimal"
        step="1"
        min={minimum}
        max={maximum}
        value={value ?? ""}
        error={error}
        hint={`Пункт ${item.id}${minimum !== undefined && maximum !== undefined ? ` · от ${minimum} до ${maximum}` : ""}. Пустое поле — пропуск.`}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? null : Number(event.target.value),
          )
        }
      />
    );
  return (
    <Textarea
      label={item.label}
      aria-label={item.label}
      value={value ?? ""}
      error={error}
      hint={`Пункт ${item.id} · пустое поле — пропуск.`}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  const unique = [...new Set(warnings)];
  return unique.length ? (
    <div className={styles.notice}>
      <strong>Ограничения и проверка</strong>
      <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
        {unique.map((warning, index) => (
          <li key={index}>{warning}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
function hasAnswer(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}
function answeredCount(responses: AssessmentDraft["responses"]) {
  return Object.values(responses).filter(hasAnswer).length;
}
function naturalOrder(a: string, b: string) {
  return a.localeCompare(b, "ru", { numeric: true });
}
function responseLabel(item: FormItem, value: number | string | null) {
  return hasAnswer(value)
    ? item.options?.find((option) => option.value === value)?.label ||
        String(value)
    : "Пропущен";
}
function draftSummary(draft: AssessmentDraft) {
  return {
    measuredAt: formatDate(draft.measuredAt, stampOptions),
    assessor: assessorLabels[draft.assessor],
    responses:
      Object.entries(draft.responses)
        .sort(([a], [b]) => naturalOrder(a, b))
        .map(
          ([key, value]) =>
            `${key}: ${hasAnswer(value) ? String(value) : "пропущен"}`,
        )
        .join("\n") || "Нет ответов",
    note: draft.note,
  };
}
function fallbackSections(form: AssessmentForm): FormSection[] {
  const groups = new Map<string, typeof form.items>();
  for (const item of form.items) {
    const prefix = item.key.includes(".")
      ? (item.key.split(".")[0] ?? "items")
      : "items";
    groups.set(prefix, [...(groups.get(prefix) ?? []), item]);
  }
  const groupNames: Record<string, string> = {
    state: "Состояние",
    trait: "Свойство",
    fear: "Страх",
    avoidance: "Избегание",
    items: "Пункты",
  };
  return [...groups.entries()].flatMap(([prefix, items]) => {
    const sorted = [...items].sort((a, b) => naturalOrder(a.key, b.key));
    return Array.from({ length: Math.ceil(sorted.length / 8) }, (_, index) => {
      const chunk = sorted.slice(index * 8, index * 8 + 8);
      const first = chunk[0]!.key.split(".").at(-1);
      const last = chunk.at(-1)!.key.split(".").at(-1);
      return {
        id: `${prefix}-${index}`,
        title: `${groupNames[prefix] ?? prefix} ${first}–${last}`,
        items: chunk.map((item) => ({
          id: item.key,
          label: `Пункт ${item.key}`,
          min: item.minimum,
          max: item.maximum,
        })),
      };
    });
  });
}
function validateResponses(
  responses: AssessmentDraft["responses"],
  sections: FormSection[],
  form: AssessmentForm,
) {
  const errors: Record<string, string> = {};
  const sourceItems = sections.flatMap((section) => section.items);
  for (const [key, value] of Object.entries(responses)) {
    if (!hasAnswer(value)) continue;
    const item = sourceItems.find((entry) => entry.id === key);
    const catalogItem = form.items.find((entry) => entry.key === key);
    if (
      item?.options?.length &&
      !item.options.some((option) => option.value === value)
    )
      errors[key] = "Выберите ответ из вариантов этой версии формы.";
    const minimum = catalogItem?.minimum ?? item?.min;
    const maximum = catalogItem?.maximum ?? item?.max;
    if (
      catalogItem &&
      typeof value === "number" &&
      !Number.isSafeInteger(value)
    )
      errors[key] =
        "Укажите целый балл из этой формы или оставьте поле пустым.";
    if (
      (minimum !== undefined || maximum !== undefined) &&
      !(
        typeof value === "string" &&
        (catalogItem || item?.options?.some((option) => option.value === value))
      )
    ) {
      if (typeof value !== "number" || !Number.isFinite(value))
        errors[key] = "Укажите числовой ответ или оставьте поле пустым.";
      else if (
        (minimum !== undefined && value < minimum) ||
        (maximum !== undefined && value > maximum)
      )
        errors[key] =
          `Ответ должен быть ${minimum !== undefined ? `не меньше ${minimum}` : ""}${minimum !== undefined && maximum !== undefined ? " и " : ""}${maximum !== undefined ? `не больше ${maximum}` : ""}.`;
    }
  }
  return errors;
}
function isDefinition(value: unknown): value is AssessmentFormDefinition {
  if (!value || typeof value !== "object") return false;
  const data = value as AssessmentFormDefinition;
  if (
    typeof data.sourceId !== "string" ||
    typeof data.sourceHash !== "string" ||
    typeof data.title !== "string" ||
    !Array.isArray(data.warnings) ||
    !data.warnings.every((warning) => typeof warning === "string") ||
    !Array.isArray(data.sections)
  )
    return false;
  const ids = new Set<string>();
  return data.sections.every(
    (section) =>
      section &&
      typeof section.id === "string" &&
      typeof section.title === "string" &&
      Array.isArray(section.items) &&
      section.items.every((item) => {
        if (
          !item ||
          typeof item.id !== "string" ||
          !item.id ||
          ids.has(item.id) ||
          typeof item.label !== "string"
        )
          return false;
        ids.add(item.id);
        return (
          (item.min === undefined ||
            (typeof item.min === "number" && Number.isFinite(item.min))) &&
          (item.max === undefined ||
            (typeof item.max === "number" && Number.isFinite(item.max))) &&
          (item.options === undefined ||
            (Array.isArray(item.options) &&
              item.options.every(
                (option) =>
                  option &&
                  typeof option.label === "string" &&
                  (typeof option.value === "string" ||
                    (typeof option.value === "number" &&
                      Number.isFinite(option.value))),
              )))
        );
      }),
  );
}
