import { z } from "zod";
import { scenarioSchema } from "../contracts/presentation";

export const demoId = z.string().regex(/^demo-[a-zA-Z0-9-]+$/);
export const demoText = z
  .string()
  .refine((value) => value.trim().length > 0, "Нужен непустой текст");
export const demoMetadata = {
  schemaVersion: z.literal(1),
  synthetic: z.literal(true),
  snapshot: demoText,
  scenario: scenarioSchema,
};
export const demoEventSchema = z.strictObject({
  id: demoId,
  date: demoText,
  title: demoText,
  body: demoText,
});
export function uniqueDemoIds(
  rows: { id: string }[],
  context: z.RefinementCtx,
) {
  const ids = new Set<string>();
  rows.forEach((row, index) => {
    if (ids.has(row.id))
      context.addIssue({
        code: "custom",
        path: [index, "id"],
        message: "Повторяющийся id",
      });
    ids.add(row.id);
  });
}
