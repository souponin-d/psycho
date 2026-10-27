// Synthetic benchmark; never changes source catalogs or activates clinical rules.
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { extractCandidates } from "../../apps/web-doctor/src/workspace/extraction.ts";
import { createPatient } from "../../apps/web-doctor/src/workspace/commands.ts";
import {
  demoActor,
  seedPatients,
} from "../../apps/web-doctor/src/workspace/seed.ts";
import {
  evaluateSupport,
  newSupportInput,
  supportCatalog,
  clinicalDrugClasses,
} from "../../apps/web-doctor/src/workspace/clinical-support-engine.ts";
import {
  clinicalProtocols,
  getClinicalProtocol,
} from "../../apps/web-doctor/src/workspace/clinical-protocols.ts";

const out = pathToFileURL(
  path.resolve("docs/verification/technical-metrics") + path.sep,
);
await fs.mkdir(out, { recursive: true });
const fields = [
  ["Жалобы", "Жалобы", "Техническая жалоба"],
  ["Анамнез", "Анамнез", "Синтетическое описание истории"],
  [
    "Диагноз",
    "Диагноз в исходном документе",
    "F32.0; запись из синтетического документа",
  ],
  [
    "Назначения",
    "Назначения в исходном документе",
    "Учебный препарат X; фактический приём неизвестен",
  ],
  [
    "Рекомендации",
    "Рекомендации в исходном документе",
    "Уточнить сведения на техническом примере",
  ],
  ["Аллергии", "Аллергии", "Неизвестно; не означает отсутствие"],
  ["Состояние", "Описание состояния", "Описание синтетического состояния"],
];
const variants = {
  standard: (rows) => rows.map(([h, , v]) => `${h}: ${v}`).join("\n"),
  reordered: (rows) =>
    [...rows]
      .reverse()
      .map(([h, , v]) => `  ${h.toUpperCase()} — ${v}`)
      .join("\r\n"),
  multiline: (rows) => rows.map(([h, , v]) => `${h}:\n${v}`).join("\n"),
  numbered: (rows) =>
    rows.map(([h, , v], i) => `${i + 1}. ${h}: ${v}`).join("\n"),
  narrative: (rows) =>
    rows.map(([h, , v]) => `В разделе «${h}» указано: ${v}.`).join(" "),
};
const corpus = [];
const groups = {};
for (const [variant, render] of Object.entries(variants)) {
  const result = {
    documents: 0,
    expected: 0,
    extracted: 0,
    exact: 0,
    quote_matches: 0,
    ms: [],
  };
  for (let n = 0; n < 20; n++) {
    const values = fields.map(([h, field, value]) => [
      h,
      field,
      `${value}; пример ${n + 1}`,
    ]);
    const text = render(values);
    const expected = values.map(([, field, value]) => ({ field, value }));
    const start = performance.now();
    const extracted = extractCandidates(text);
    result.ms.push(performance.now() - start);
    result.documents++;
    result.expected += expected.length;
    result.extracted += extracted.length;
    result.exact += extracted.filter((fact) =>
      expected.some((e) => e.field === fact.field && e.value === fact.value),
    ).length;
    result.quote_matches += extracted.filter((fact) =>
      text.includes(fact.quote),
    ).length;
    corpus.push({ id: `${variant}-${n + 1}`, variant, text, expected });
  }
  result.precision = result.extracted ? result.exact / result.extracted : null;
  result.recall = result.exact / result.expected;
  result.f1 =
    result.precision && result.recall
      ? (2 * result.precision * result.recall) /
        (result.precision + result.recall)
      : 0;
  groups[variant] = result;
}
const now = "2026-10-27T11:00:00.000Z";
const patient = createPatient(
  { name: "Синтетический технический пациент", birthDate: "1995-01-01" },
  demoActor,
  now,
  "technical-measure-58",
);
const sources = new Map(supportCatalog.sources.map((s) => [s.id, s]));
const cases = [];
for (let n = 0; n < 100; n++) {
  const input = newSupportInput();
  input.route = n % 2 ? "gad" : "depression";
  if (n % 3 === 0)
    input.observations.push({ key: "medicationListComplete", answer: "no" });
  const start = performance.now();
  const result = evaluateSupport(patient, input, demoActor, now);
  cases.push({
    ms: performance.now() - start,
    findings: result.findings.length,
    findings_with_sources: result.findings.filter((f) => f.sourceIds.length > 0)
      .length,
    findings_with_resolved_sources: result.findings.filter(
      (f) =>
        f.sourceIds.length > 0 && f.sourceIds.every((id) => sources.has(id)),
    ).length,
    options: result.options.length,
    option_keys: Object.keys(result.options[0] ?? {}),
  });
}
const automaticGrounding = [];
const signals = [
  "currentMania",
  "psychosis",
  "pregnancy",
  "renalImpairment",
  "medicationListComplete",
];
for (let n = 0; n < 50; n++) {
  const input = newSupportInput();
  input.route = n % 2 ? "gad" : "depression";
  input.observations = signals.map((key, index) => ({
    key,
    answer: (n >> index) & 1 ? "yes" : "unknown",
    provenance: "patient",
    observedAt: now,
    note: "Синтетический технический вход",
  }));
  const before = JSON.stringify({ patient, input });
  const result = evaluateSupport(patient, input, demoActor, now);
  const repeated = evaluateSupport(patient, input, demoActor, now);
  const reordered = evaluateSupport(
    patient,
    { ...input, observations: [...input.observations].reverse() },
    demoActor,
    now,
  );
  const outputs = [...result.findings, ...result.options];
  automaticGrounding.push({
    case: n + 1,
    repeat_exact: JSON.stringify(result) === JSON.stringify(repeated),
    input_order_invariant: JSON.stringify(result) === JSON.stringify(reordered),
    input_not_mutated: before === JSON.stringify({ patient, input }),
    outputs: outputs.length,
    outputs_with_resolved_locator: outputs.filter(
      (o) =>
        o.sourceIds?.length &&
        o.sourceIds.every((id) => {
          const source = sources.get(id);
          return source?.version && source?.url && source?.section;
        }),
    ).length,
  });
}
const examples = seedPatients(new Date(now));
const coverage = [
  "profile",
  "episodes",
  "visits",
  "measurements",
  "plan",
  "reports",
  "events",
  "consents",
  "messages",
  "referrals",
  "documents",
  "audit",
  "clinicalFacts",
  "clinicalSupport",
  "adherence",
  "workflow",
].map((field) => ({
  field,
  present_on_new_record: Object.hasOwn(patient, field),
  examples_with_nonempty_value: examples.filter((p) =>
    Array.isArray(p[field])
      ? p[field].length > 0
      : p[field] && Object.keys(p[field]).length > 0,
  ).length,
}));
const originalVersions = clinicalProtocols.map((p) => p.version);
const synthetic = {
  ...structuredClone(clinicalProtocols[0]),
  id: "technical-58",
  version: "technical-58-v1",
  status: "synthetic-only",
  clinicalApproval: null,
};
let start = performance.now();
clinicalProtocols.push(synthetic);
const added = getClinicalProtocol(synthetic.version)?.id === synthetic.id;
const oldPreserved = originalVersions.every((version) =>
  getClinicalProtocol(version),
);
clinicalProtocols.pop();
const extension = {
  experiment: "in-memory form catalog registration and rollback",
  ms: performance.now() - start,
  added,
  old_versions_preserved: oldPreserved,
  rollback_removed_new: !getClinicalProtocol(synthetic.version),
  persisted: false,
  engine_changes: 0,
  limitation:
    "Does not prove arbitrary scoring, medicine registration, alert-rule or new feature extensibility",
};
const catalogBefore = JSON.stringify(supportCatalog);
const experiments = [];
start = performance.now();
supportCatalog.drugClasses.push(
  {
    id: "technical58-a",
    title: "Синтетический класс A",
    inns: ["Техническое МНН A"],
  },
  {
    id: "technical58-b",
    title: "Синтетический класс B",
    inns: ["Техническое МНН B"],
  },
);
experiments.push({
  kind: "medicine class",
  observed: clinicalDrugClasses("Техническое МНН A").includes("technical58-a"),
  ms: performance.now() - start,
});
const syntheticPatient = structuredClone(patient);
syntheticPatient.plan = ["a", "b"].map((letter) => ({
  id: `technical58-${letter}`,
  kind: "medication",
  status: "confirmed",
  title: `Синтетическое средство ${letter}`,
  medicine: { inn: `Техническое МНН ${letter.toUpperCase()}` },
  startDate: "",
  endDate: "",
}));
start = performance.now();
supportCatalog.interactions.push({
  id: "technical58-interaction",
  left: "technical58-a",
  right: "technical58-b",
  title: "Синтетическая проверка расширения",
  detail: "Техническое правило без медицинского содержания",
  sourceIds: [supportCatalog.sources[0].id],
});
const interactionResult = evaluateSupport(
  syntheticPatient,
  newSupportInput(),
  demoActor,
  now,
);
experiments.push({
  kind: "interaction warning",
  observed: interactionResult.findings.some((f) =>
    f.id.includes("technical58-interaction"),
  ),
  ms: performance.now() - start,
  limitation:
    "Warning generation only; not arbitrary clinical alert conditions or external delivery",
});
start = performance.now();
supportCatalog.options.push({
  id: "technical58-option",
  routes: ["gad"],
  title: "Синтетический пункт",
  kind: "follow-up",
  position: "adjunct",
  summary: "Технический пример",
  drugClasses: [],
  monitoring: [],
  sourceIds: [supportCatalog.sources[0].id],
});
experiments.push({
  kind: "catalog option",
  observed: evaluateSupport(
    patient,
    newSupportInput(),
    demoActor,
    now,
  ).options.some((o) => o.id === "technical58-option"),
  ms: performance.now() - start,
  limitation:
    "Existing option schema only; not arbitrary new application functionality",
});
supportCatalog.options.pop();
supportCatalog.interactions.pop();
supportCatalog.drugClasses.splice(-2);
extension.catalog_experiments = experiments;
extension.catalog_rollback_exact =
  JSON.stringify(supportCatalog) === catalogBefore;
const metadata = {
  started_at: new Date().toISOString(),
  node: process.version,
  extraction: {
    unit: "exact labelled section, not clinical entity or NLP accuracy",
    clinician_validated: false,
    groups,
  },
  support: {
    cases,
    source_count: sources.size,
    sources_with_version_url_locator: [...sources.values()].filter(
      (s) => s.version && s.url && s.section,
    ).length,
    clinical_approvals: clinicalProtocols.filter(
      (p) => p.clinicalApproval !== null,
    ).length,
    limitation:
      "Synthetic technical traceability only; clinical correctness and source currency not evaluated",
  },
  automatic_grounding: {
    cases: automaticGrounding,
    criteria:
      "Determinism, observation-order invariance, no input mutation, resolution of source/version/locator",
    clinical_content_entailment_evaluated: false,
  },
  model_coverage: {
    synthetic_examples: examples.length,
    fields: coverage,
    limitation:
      "Structural presence and example coverage, not semantic/clinical completeness or full requirements acceptance",
  },
  extension,
};
await fs.writeFile(
  new URL("extraction-corpus.json", out),
  JSON.stringify(corpus, null, 2) + "\n",
);
await fs.writeFile(
  new URL("code-measurements.json", out),
  JSON.stringify(metadata, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      groups: Object.fromEntries(
        Object.entries(groups).map(([k, v]) => [
          k,
          { precision: v.precision, recall: v.recall, f1: v.f1 },
        ]),
      ),
      extension,
    },
    null,
    2,
  ),
);
