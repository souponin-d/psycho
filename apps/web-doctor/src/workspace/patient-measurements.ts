import type { Measurement, PatientRecord } from "./model";

/** Read-only presentation of saved results; never writes or recalculates scores. */
export function patientMeasurements(patient: PatientRecord): Measurement[] {
  const questionnaireResults = (patient.workflow?.assessments ?? []).flatMap(
    (assessment): Measurement[] => {
      const source = assessment.source;
      if (source.scale !== "GAD-7" && source.scale !== "PHQ-9") return [];
      return [
        {
          id: `workflow:${assessment.id}`,
          createdAt: assessment.receivedAt,
          author: assessment.receivedBy.name,
          visitId: assessment.visitId ?? "",
          scale: source.scale,
          title: source.title,
          version: source.version,
          measuredAt: assessment.measuredAt,
          score: assessment.score,
          maximum: source.maximum,
          answers: [...assessment.answers],
          completeness:
            assessment.completeness === "complete"
              ? "complete"
              : assessment.completeness === "partial"
                ? "partial"
                : "not-assessed",
          assessor: "patient",
          window: source.window,
          sourceId: "",
          interpretation: assessment.interpretation?.label ?? "",
          provenance: "patient",
          externalForm: source.source,
        },
      ];
    },
  );
  return [...patient.measurements, ...questionnaireResults].sort(
    (a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt),
  );
}
