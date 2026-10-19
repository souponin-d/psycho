# Repository instructions

## Git and pull requests — mandatory

- Never push directly to `main`, force-push `main`, delete it, or bypass review or required checks. This applies to people and AI agents.
- Work on a separate task branch. Agent branches use `codex/<issue>-<topic>`; human branches may use `feat/`, `fix/`, `docs/`, or `chore/`. Check `git status` and the current branch before editing.
- Deliver changes through a pull request targeting `main`. Do not merge locally into `main` and push the result. Publication or PR creation must be within the user's requested scope.
- Use `.github/pull_request_template.md`. Include the issue, owner, changed behavior, requirement IDs, exact verification results, dependencies, and applicable migration or rollback instructions. Add screenshots or a recording for UI changes.
- A PR requires passing checks, resolved blocking discussions, and approval from someone other than its author. New changes invalidate the affected review. Never claim an AI self-review is an independent contributor's approval.
- Shared contracts, access control, clinical decision logic, migrations, deployment, and CI need review by the development lead. If the lead authored the PR, another contributor must independently review it. Clinical content also needs recorded clinical validation before activation.
- Merge only through the approved GitHub PR process, using squash merge. Do not weaken checks to get a PR merged.
- These instructions do not enable GitHub branch protection. Follow the setup and verification procedure in [CONTRIBUTING.md](CONTRIBUTING.md#настройка-github).

## Task boundaries

- Read the assigned issue, [team plan](docs/superpowers/plans/2026-10-19-five-contributor-development.md), and [CONTRIBUTING.md](CONTRIBUTING.md). Implement only the assigned task.
- Use [the starter issue index](docs/team/backlog.md). GitHub Issues owns live status, assignees, dependencies, and acceptance evidence; do not treat roadmap checkboxes as a separate live tracker. Keep blocked helper tasks blocked until the lead supplies runnable examples and exact contracts.
- The lead owns all backend and mobile implementation, API/DB, clinical logic, access control, integrations, automated behavioral tests, CI, and delivery. Contributors 2–5 receive bounded supporting tasks, not full-stack feature ownership.
- Contributor 2 prepares isolated doctor-web presentation components; contributor 3 prepares isolated admin-web presentation components, never the mobile app. Contributor 4 prepares small reusable web components using lead-provided primitives. Contributor 5 prepares synthetic data, component example pages, and narrowly scoped UI fixes. Each receives one repository task delivered through a PR.
- CustDev is a separate team activity, not the primary repository deliverable of contributor 4 or 5. The lead and a clinician retain responsibility for clinical source approval.
- Contributor 4 may compose supplied accessible dialog/field primitives, but must not reimplement focus management, authorization, clinical validation, persistence, or action confirmation. Contributor 5 may edit only the assigned example or UI-fix files, without changing shared types, routing, dependencies, or build setup.
- For supporting tasks, edit only the files listed in the issue. Presentation components consume supplied props and callbacks; do not add HTTP calls, persistence, authorization, medical calculations, or clinical actions. Do not change dependencies, shared types, schemas, routing, or build configuration to complete a small task.
- Agree on shared API/schema changes before dependent implementation. Never hand-edit generated clients. Keep contract changes and their consumers compatible or deliver them together.
- Do not overwrite another contributor's changes. Resolve conflicts in your task branch; re-run affected verification and request renewed review.
- Each contributor must inspect AI-produced changes and reproduce verification. Do not claim a mock, screenshot, or passing build proves a real clinical workflow.
- Verification is proportional: data examples use the supplied schema and existing checks; presentation and composition of supplied UI primitives use type/build checks and visual/keyboard examples without redundant new tests. New business behavior, mobile, access, clinical logic, events, and storage remain lead-owned and require meaningful automated and integration checks. Required PR checks are never skipped.

## Product baseline

- Accepted stack: React + TypeScript + Vite for web; React Native + Expo development builds for Android/iOS; ASP.NET Core 10 as a modular monolith; PostgreSQL; REST + OpenAPI.
- Initial delivery prioritizes the doctor web app, patient mobile app, and administrative web dashboard. Tauri desktop delivery follows; Windows, macOS, and Linux remain the target. See [decision 0002](docs/decisions/0002-product-stack-and-delivery.md).
- `site/` is an optional marketing demo, not the production application or an approved clinical specification. Do not carry its simulated rules into production.
- The official case in `docs/official/2026-10-15-case.md` is the requirement source. Keep the original preparatory document unchanged. Record new official clarifications separately.
- Clinical changes require explicit doctor approval. Preserve source/rule versions, input provenance, and an audit trail. Do not invent clinical thresholds or treat LLM output as an approved rule.
- Enforce clinic isolation and the care relationship on the server. A client-supplied clinic ID or hidden UI element is not authorization.
- Use synthetic patient fixtures only. Never commit patient data, secrets, medical logs, or restricted source material. Real-data processing requires the separately approved deployment and data procedures.

## Verification and documentation

- Current prerequisites: Node.js 24.x and npm. Use `npm ci --ignore-scripts` after cloning or lockfile changes; use exact dependency versions.
- Follow the [role-specific setup checklist](docs/team/local-development-setup.md) and [web component handoff](docs/team/web-components.md). Contributors 2–5 need Node/web tooling only. The doctor/admin shells and examples run independently of backend. Keep web and fixture checks runnable without .NET, a database, or mobile SDKs; backend/mobile checks remain separate as those applications arrive.
- Run `npm run check` before submitting changes: formatting, local Markdown links, landing JavaScript syntax, and the combined site/doctor/admin demo build. `site/demo/` contains entry points reusing the applications; publish the entire root `dist/`. Standalone app commands remain available. For web or shared UI changes also run `npm run check:web`; for presentation data run `npm run check:fixtures`. CI runs all three independently on Ubuntu and Windows. Source workspace exports need no preliminary UI package build; one root lockfile controls all packages.
- Add real application checks as their implementations arrive. Report commands, results, and checks that could not run. Do not describe planned commands or CI settings as already working.
- Keep team documents and product copy in Russian. Update documentation when behavior, contracts, setup, or responsibilities change.
