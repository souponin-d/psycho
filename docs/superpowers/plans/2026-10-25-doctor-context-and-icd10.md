# Doctor context and ICD-10 Implementation Plan

> **Статус документа:** Исторический план задачи. Поручения, целевые пути, чекбоксы и ограничения описывают исходную постановку, а не состояние текущего main. Сохранён для требований и прослеживаемости; не использовать как инструкцию запуска. [Текущее состояние](../../status.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented visit notes with patient context and two statuses, and support versioned ICD-10 selections in the synthetic doctor workspace.

**Architecture:** A local terminology module supplies an explicitly labelled educational subset and validates immutable terminology snapshots. `PatientRecord` gains structured patient context; visits use two narrative statuses and structured diagnoses. The contract, server/domain validation, IndexedDB seed and React forms move in lockstep; generated API types are regenerated, never hand-edited.

**Tech Stack:** React, TypeScript, Vite, Vitest, ASP.NET Core, OpenAPI generator, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-25-doctor-context-and-icd10-design.md`

## Global Constraints

- Use Node.js 24.x and no new dependencies.
- Use only synthetic patient data; a future full catalogue needs a verified NCI export.
- Do not introduce clinical rules, automatic diagnosis, prescribing or access changes.
- Preserve the cancellation action; remove `Visit.episodeId` from all new contracts.
- Regenerate `apps/web-doctor/src/workspace/api.generated.ts` with `npm run contract:doctor`.

## Review Focus

1. Search matches both code fragments and Russian title fragments; the test belongs to Task 1.
2. A forged or old terminology selection is rejected by both domain validators; the test belongs to Task 2.
3. A visit no longer serializes `episodeId` and appointment creation still works; the test belongs to Task 2.
4. Existing synthetic IndexedDB data never becomes malformed state after the schema change; the test belongs to Task 3.
5. Keyboard search, empty search result, and multiple selected diagnoses remain usable; the UI test belongs to Task 4.

---

### Task 1: Terminology catalogue and shared model

**Files:**

- Create: `apps/web-doctor/src/workspace/terminology.ts`
- Create: `apps/web-doctor/src/workspace/terminology.test.ts`
- Modify: `apps/web-doctor/src/workspace/model.ts`
- Modify: `apps/web-doctor/src/workspace/seed.ts`

**Interfaces:**

- Produces `ICD10_CATALOG`, `searchIcd10(query)`, `isCurrentIcd10Selection(value)` and `TerminologySelection`.
- Produces `PatientClinicalContext`, `DiagnosisSelection`, updated `Profile`, `EncounterNotes`, and `Visit` without `episodeId`.

- [ ] **Step 1: Write failing terminology tests** for code/title search and rejection of a forged code/version.
- [ ] **Step 2: Run** `npx vitest run apps/web-doctor/src/workspace/terminology.test.ts` **and verify it fails because the module does not exist.**
- [ ] **Step 3: Implement the versioned educational subset and search helpers** in `terminology.ts`; create valid empty structured values in the model and seed.
- [ ] **Step 4: Run the terminology test and verify it passes.**
- [ ] **Step 5: Commit** `feat(doctor): add versioned terminology model`.

### Task 2: Command, server and generated contract migration

**Files:**

- Modify: `apps/web-doctor/src/workspace/commands.ts`
- Modify: `apps/web-doctor/src/workspace/commands.test.ts`
- Modify: `apps/doctor-api/Domain.cs`
- Modify: `docs/contracts/doctor.openapi.json`
- Modify: `apps/web-doctor/src/workspace/api.generated.ts` (generated)

**Interfaces:**

- Consumes Task 1 terminology types/helpers.
- Validates `PatientClinicalContext`, `DiagnosisSelection[]`, and visit shapes without `episodeId`.

- [ ] **Step 1: Write failing command tests** proving forged terminology is rejected and a visit without `episodeId` is accepted.
- [ ] **Step 2: Run** `npx vitest run apps/web-doctor/src/workspace/commands.test.ts` **and verify the new assertions fail.**
- [ ] **Step 3: Update local and server validation plus OpenAPI schemas**, then regenerate the client with `npm run contract:doctor`.
- [ ] **Step 4: Run** `npx vitest run apps/web-doctor/src/workspace/commands.test.ts && npm run contract:doctor:check` **and verify both pass.**
- [ ] **Step 5: Commit** `refactor(doctor): migrate visits to context and code selections`.

### Task 3: Synthetic repository schema reset

**Files:**

- Modify: `apps/web-doctor/src/workspace/repository.ts`
- Modify: `apps/web-doctor/src/workspace/useWorkspace.test.tsx`

**Interfaces:**

- Consumes Task 1 seed schema and Task 2 record model.
- Produces a demo repository that opens a new schema-keyed IndexedDB store instead of interpreting v1 records as v2.

- [ ] **Step 1: Write a failing repository/use-workspace test** for startup with a schema v2 record shape.
- [ ] **Step 2: Run the targeted test and verify it fails for the old store name or shape.**
- [ ] **Step 3: Version the synthetic IndexedDB store and seed v2 data.**
- [ ] **Step 4: Run the targeted test and verify it passes.**
- [ ] **Step 5: Commit** `fix(doctor): reset synthetic storage for context schema`.

### Task 4: Context and selection UI

**Files:**

- Create: `apps/web-doctor/src/workspace/TerminologyPicker.tsx`
- Modify: `apps/web-doctor/src/workspace/PatientForms.tsx`
- Modify: `apps/web-doctor/src/workspace/EncounterEditor.tsx`
- Modify: `apps/web-doctor/src/workspace/labels.ts`
- Modify: `apps/web-doctor/src/workspace/EncounterEditor.test.tsx`
- Modify: `apps/web-doctor/src/workspace/WorkspacePresentationCopy.test.tsx`

**Interfaces:**

- Consumes Task 1 selections and search helper and Task 2 validators.
- Produces context fields, two visit status textareas, diagnosis/somatic code pickers, and an appointment form without an episode select.

- [ ] **Step 1: Write failing UI tests** for searching and selecting an ICD-10 diagnosis, the two status labels, patient context fields, and the absence of the episode select.
- [ ] **Step 2: Run** `npx vitest run --project web apps/web-doctor/src/workspace/EncounterEditor.test.tsx apps/web-doctor/src/workspace/WorkspacePresentationCopy.test.tsx` **and verify the assertions fail.**
- [ ] **Step 3: Implement the accessible reusable picker and replace the affected forms.**
- [ ] **Step 4: Run the targeted UI tests and verify they pass.**
- [ ] **Step 5: Commit** `feat(doctor): show context and icd-10 selections`.

### Task 5: Full verification

**Files:**

- Modify: `docs/superpowers/specs/2026-10-25-doctor-context-and-icd10-design.md` only if implementation decisions require a recorded ruling.

- [ ] **Step 1: Run** `npm run check:web` **and verify it passes.**
- [ ] **Step 2: Run** `npm run check` **and verify it passes.**
- [ ] **Step 3: Inspect** `git diff --check` **and the complete branch diff.**
- [ ] **Step 4: Commit any verification-only documentation correction if needed.**

## Self-review

The five functional requirements map one-to-one to Tasks 1–4; Task 5 executes the required workspace checks. The current source certificate prevents importing a full official data file, so the educational subset is deliberately versioned and visibly bounded rather than misrepresented as the NCI catalogue. Task interfaces use the exact `TerminologySelection`/`DiagnosisSelection` names defined in Task 1.
