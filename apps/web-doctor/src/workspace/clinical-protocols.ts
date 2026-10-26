import protocolData from "./clinical-protocols.json" with { type: "json" };

/** Evidence review is source verification, never recorded clinical approval. */
export interface ClinicalProtocol {
  id: string;
  version: string;
  title: string;
  window: string;
  items: number;
  minimum: number;
  maximum: number;
  status: "synthetic-only" | "evidence-reviewed";
  source: string;
  clinicalApproval: null;
  questions?: string[];
  options?: string[];
  instruction?: string;
  impactQuestion?: string;
  impactOptions?: string[];
  sourceUrl?: string;
  contentHash?: string;
  evidenceUrls?: string[];
  attribution?: string;
  limitations?: string;
  scale?: "GAD-7" | "PHQ-9";
}

export const clinicalProtocols: ClinicalProtocol[] =
  protocolData as ClinicalProtocol[];

export function getClinicalProtocol(
  version: string,
): ClinicalProtocol | undefined {
  return clinicalProtocols.find((protocol) => protocol.version === version);
}

/** Descriptive symptom bands only; no diagnostic or treatment decision. */
export function describeClinicalScore(
  protocol: ClinicalProtocol,
  score: number | null,
): { label: string; sourceUrl: string; diagnostic: false } | null {
  const known = getClinicalProtocol(protocol.version);
  if (
    !known ||
    protocol.status !== "evidence-reviewed" ||
    known.scale !== protocol.scale ||
    typeof score !== "number" ||
    !Number.isInteger(score) ||
    score < known.minimum ||
    score > known.maximum
  )
    return null;

  const severity =
    score < 5
      ? "Минимальная"
      : score < 10
        ? "Лёгкая"
        : score < 15
          ? "Умеренная"
          : known.scale === "PHQ-9" && score < 20
            ? "Умеренно тяжёлая"
            : "Тяжёлая";
  const symptom = known.scale === "GAD-7" ? "тревожных" : "депрессивных";
  return {
    label: `${severity} выраженность ${symptom} симптомов`,
    sourceUrl:
      "https://archive.thepcc.org/sites/default/files/resources/instructions.pdf",
    diagnostic: false,
  };
}
