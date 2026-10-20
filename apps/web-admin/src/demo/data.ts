import { z } from "zod";
import {
  chartSeriesSchema,
  summaryItemSchema,
  type Scenario,
} from "@psycho/ui-web/contracts";
import {
  demoMetadata,
  demoId,
  demoText,
  demoEventSchema,
  uniqueDemoIds,
} from "@psycho/ui-web/demo-data";
import normal from "./fixtures/normal.json";
import empty from "./fixtures/empty.json";
import long from "./fixtures/long.json";

export const adminDemoSchema = z.strictObject({
  ...demoMetadata,
  unit: demoText,
  period: demoText,
  metrics: z.array(summaryItemSchema).superRefine(uniqueDemoIds),
  series: chartSeriesSchema.superRefine((series, context) => {
    series.points.forEach((point, index) => {
      if (
        point.value !== null &&
        (!Number.isInteger(point.value) || point.value < 0)
      )
        context.addIssue({
          code: "custom",
          path: ["points", index, "value"],
          message: "Количество записей должно быть целым и неотрицательным",
        });
    });
  }),
  team: z
    .array(
      z.strictObject({
        id: demoId,
        name: demoText,
        unit: demoText,
        patients: z.number().int().nonnegative(),
        reports: z.number().int().nonnegative(),
        nextVisit: demoText.nullable(),
      }),
    )
    .superRefine(uniqueDemoIds),
  events: z.array(demoEventSchema).superRefine(uniqueDemoIds),
});
export type AdminDemoData = z.infer<typeof adminDemoSchema>;
export const adminDemoSources: Record<Scenario, unknown> = {
  normal,
  empty,
  long,
};
