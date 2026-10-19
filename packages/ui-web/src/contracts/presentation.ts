import { z } from "zod";
import type { ReactElement, ReactNode } from "react";

const label = z
  .string()
  .refine((value) => value.trim().length > 0, "Подпись не должна быть пустой");
const id = z
  .string()
  .regex(/^demo-[a-zA-Z0-9-]+$/, "Нужен синтетический id с префиксом demo-");
function uniqueIds(rows: { id: string }[], context: z.RefinementCtx) {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (seen.has(row.id))
      context.addIssue({
        code: "custom",
        path: [index, "id"],
        message: "Повторяющийся идентификатор",
      });
    seen.add(row.id);
  });
}

export const scenarioSchema = z.enum(["normal", "empty", "long"]);
export const patientRowSchema = z.strictObject({
  id,
  displayName: label,
  secondaryText: z.string(),
});
export const summaryItemSchema = z.strictObject({
  id,
  label,
  value: z.string().nullable(),
  caption: z.string().optional(),
});
export const seriesPointSchema = z.strictObject({
  id,
  label,
  value: z.number().nullable(),
});
export const chartSeriesSchema = z.strictObject({
  label,
  points: z.array(seriesPointSchema).superRefine(uniqueIds).readonly(),
});
export const presentationFixtureSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scenario: scenarioSchema,
  patients: z.array(patientRowSchema).superRefine(uniqueIds),
  department: z.strictObject({
    items: z.array(summaryItemSchema).superRefine(uniqueIds),
    series: chartSeriesSchema,
  }),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type PatientRow = z.infer<typeof patientRowSchema>;
export type SummaryItem = z.infer<typeof summaryItemSchema>;
export type SeriesPoint = z.infer<typeof seriesPointSchema>;
export type ChartSeries = z.infer<typeof chartSeriesSchema>;
export type PresentationFixture = z.infer<typeof presentationFixtureSchema>;
export type PatientListViewProps = {
  rows: readonly PatientRow[];
  onSelect: (id: string) => void;
};
export type DepartmentSummaryViewProps = {
  items: readonly SummaryItem[];
  series: ChartSeries;
};
export type InfoDialogViewProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  trigger: ReactElement;
  onOpenChange: (open: boolean) => void;
};
