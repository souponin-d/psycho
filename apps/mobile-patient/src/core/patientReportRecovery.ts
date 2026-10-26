import type { ReportEvent } from "./journeyModel.ts";
import { isPatientReport } from "./patientReportSync.ts";

/** Only patient-origin mobile forms are restored; clinician records stay in the server chart. */
export function decodePatientReports(
  raw: unknown,
):
  | { kind: "ready" | "partial"; reports: ReportEvent[] }
  | { kind: "unavailable" } {
  if (!Array.isArray(raw)) return { kind: "unavailable" };
  const reports: ReportEvent[] = [];
  const seen = new Set<string>();
  let partial = false;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      partial = true;
      continue;
    }
    const row = item as Record<string, unknown>;
    if (row.mobile === undefined || row.mobile === null) continue;
    if (typeof row.id === "string" && seen.has(row.id)) {
      const index = reports.findIndex((r) => r.id === row.id);
      if (index >= 0) reports.splice(index, 1);
      partial = true;
      continue;
    }
    if (typeof row.id === "string") seen.add(row.id);
    if (
      row.provenance !== "patient" ||
      !isPatientReport(row.mobile) ||
      row.id !== row.mobile.id
    ) {
      partial = true;
      continue;
    }
    const report = row.mobile;
    reports.push({
      id: report.id,
      entityId: report.entityId,
      kind: "report",
      day: report.day,
      at: Date.parse(report.reportedAt),
      recordedDay: report.day,
      gameEligible: false,
      source: "server",
      fields: report.fields,
      note: report.note,
      label: report.label,
      required: true,
    });
  }
  return { kind: partial ? "partial" : "ready", reports };
}
