import { z } from "zod";
import { summaryItemSchema, type Scenario } from "@psycho/ui-web/contracts";
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

const patientSchema = z.strictObject({
  id: demoId,
  doctorId: demoId,
  name: demoText,
  code: demoText,
  status: z.enum(["updated", "scheduled", "quiet"]),
  secondaryText: z.string(),
  nextVisit: demoText.nullable(),
  lastUpdate: demoText.nullable(),
  summary: demoText,
  events: z.array(demoEventSchema).superRefine(uniqueDemoIds),
});
export const doctorDemoSchema = z
  .strictObject({
    ...demoMetadata,
    doctor: z.strictObject({ id: demoId, name: demoText, unit: demoText }),
    highlights: z.array(summaryItemSchema).superRefine(uniqueDemoIds),
    patients: z.array(patientSchema).superRefine(uniqueDemoIds),
  })
  .superRefine((data, context) => {
    data.patients.forEach((patient, index) => {
      if (patient.doctorId !== data.doctor.id)
        context.addIssue({
          code: "custom",
          path: ["patients", index, "doctorId"],
          message: "Запись должна относиться к демонстрационному кабинету",
        });
    });
  });
export type DoctorDemoData = z.infer<typeof doctorDemoSchema>;
export const doctorDemoSources: Record<Scenario, unknown> = {
  normal,
  empty,
  long,
};
