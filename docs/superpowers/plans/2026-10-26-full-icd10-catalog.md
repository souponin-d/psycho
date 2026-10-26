# Full ICD-10 catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 17-item educational ICD-10 selection list with the supplied full CSV catalogue without adding clinical decision behaviour.

**Architecture:** Keep the supplied CSV as a versioned local resource. `terminology.ts` parses only code-and-title records, excludes hierarchy ranges and builds immutable selection snapshots using the existing OID and a local snapshot-version tag.

**Tech Stack:** React, TypeScript, Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-26-full-icd10-catalog-design.md`

## Global Constraints

- Use only synthetic/demo application data; do not add HTTP requests, clinical rules or automatic diagnosis.
- Preserve `ICD-10-RU` and OID `1.2.643.5.1.13.13.11.1005`.
- Use the local snapshot-version tag `local-csv-2026-10-26` until the next catalogue load.
- Keep the raw source separate from parser logic and do not add dependencies.

## Review Focus

- Rows containing class or block ranges must not become selectable codes.
- Extended subcodes such as `F20.014` must be searchable and preserved exactly.
- Case- and `ё`-insensitive Russian search must keep working across the full catalogue.
- A manually altered title or source version must still fail validation.
- The picker must use the concise label «МКБ-10: поиск по коду или названию».

### Task 1: Full catalogue parser and tests

**Files:**

- Create: `apps/web-doctor/src/workspace/data/mkb10-ru.csv`
- Modify: `apps/web-doctor/src/workspace/terminology.ts`
- Modify: `apps/web-doctor/src/workspace/terminology.test.ts`

**Interfaces:**

- Produces: `ICD10_CATALOG`, `searchIcd10(query)`, and
  `isCurrentIcd10Selection(value)` with the existing public types.

- [x] Write failing tests for 11 529 selectable entries, `Z99.9`, an extended code
      search, excluded ranges and immutable snapshot validation.
- [x] Run the terminology test and confirm it fails against the 17-item slice.
- [x] Add the supplied CSV and parse only rows matching a selectable ICD-10
      code plus a title; attach the existing OID and an unverified source-version
      tag to each entry.
- [x] Run the terminology test and `npm run check:web`.

### Task 2: Picker wording and handoff evidence

**Files:**

- Modify: `apps/web-doctor/src/workspace/TerminologyPicker.tsx`
- Modify: `apps/web-doctor/src/workspace/WorkspacePresentationCopy.test.tsx`
- Modify: `docs/superpowers/specs/2026-10-25-doctor-context-and-icd10-design.md`

**Interfaces:**

- Consumes: `ICD10_SOURCE` metadata from Task 1.
- Produces: concise user-facing search label for the full local catalogue.

- [x] Write a failing presentation test for the concise picker label.
- [x] Run the focused presentation test and confirm it fails.
- [x] Replace the educational-slice text and align the existing design note.
- [x] Run `npm run check` and `npm run check:web`; record the source-version
      limitation in the PR.
