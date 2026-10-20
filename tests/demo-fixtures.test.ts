import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  doctorDemoSchema,
  doctorDemoSources,
} from "../apps/web-doctor/src/demo/data";
import {
  adminDemoSchema,
  adminDemoSources,
} from "../apps/web-admin/src/demo/data";

describe("поставляемые наборы демо", () => {
  for (const app of ["web-doctor", "web-admin"])
    it.each(["normal", "empty", "long"])(
      `${app}: набор %s доступен и явно синтетический`,
      (scenario) => {
        const file = resolve(
          "apps",
          app,
          "src/demo/fixtures",
          `${scenario}.json`,
        );
        expect(existsSync(file)).toBe(true);
        const data = JSON.parse(readFileSync(file, "utf8"));
        expect(data.scenario).toBe(scenario);
        expect(data.synthetic).toBe(true);
        expect(data.snapshot).toBe("20 октября 2026");
      },
    );
});

describe("согласованность демо-данных", () => {
  it.each(["normal", "empty", "long"] as const)(
    "принимает обе строгие схемы набора %s",
    (scenario) => {
      expect(doctorDemoSchema.parse(doctorDemoSources[scenario]).scenario).toBe(
        scenario,
      );
      expect(adminDemoSchema.parse(adminDemoSources[scenario]).scenario).toBe(
        scenario,
      );
    },
  );
  it("согласует пациентов, кабинеты и известные значения активности", () => {
    const doctor = doctorDemoSchema.parse(doctorDemoSources.normal);
    const admin = adminDemoSchema.parse(adminDemoSources.normal);
    const office = admin.team.find((row) => row.id === doctor.doctor.id)!;
    expect(office.patients).toBe(doctor.patients.length);
    expect(doctor.highlights[0]?.value).toBe(String(doctor.patients.length));
    expect(doctor.highlights[1]?.value).toBe(
      String(doctor.patients.filter((p) => p.status === "updated").length),
    );
    expect(doctor.highlights[2]?.value).toBe(
      String(doctor.patients.filter((p) => p.nextVisit !== null).length),
    );
    expect(Number(admin.metrics[0]?.value)).toBe(
      admin.team.reduce((sum, row) => sum + row.patients, 0),
    );
    expect(Number(admin.metrics[1]?.value)).toBe(
      admin.team.reduce((sum, row) => sum + row.reports, 0),
    );
    expect(Number(admin.metrics[1]?.value)).toBe(
      admin.series.points.reduce((sum, point) => sum + (point.value ?? 0), 0),
    );
    expect(admin.series.points.some((p) => p.value === 0)).toBe(true);
    expect(admin.series.points.some((p) => p.value === null)).toBe(true);
    expect(admin.metrics.some((p) => p.value === "0")).toBe(true);
    expect(admin.metrics.some((p) => p.value === null)).toBe(true);
  });
  it.each(["empty", "long"] as const)(
    "согласует показатели с записями дополнительного набора %s",
    (scenario) => {
      const doctor = doctorDemoSchema.parse(doctorDemoSources[scenario]);
      const admin = adminDemoSchema.parse(adminDemoSources[scenario]);
      expect(doctor.highlights.map((item) => Number(item.value))).toEqual([
        doctor.patients.length,
        doctor.patients.filter((patient) => patient.status === "updated")
          .length,
        doctor.patients.filter((patient) => patient.nextVisit !== null).length,
      ]);
      expect(Number(admin.metrics[0]?.value)).toBe(
        admin.team.reduce((sum, row) => sum + row.patients, 0),
      );
      expect(Number(admin.metrics[1]?.value)).toBe(
        admin.team.reduce((sum, row) => sum + row.reports, 0),
      );
      expect(Number(admin.metrics[1]?.value)).toBe(
        admin.series.points.reduce((sum, point) => sum + (point.value ?? 0), 0),
      );
    },
  );
  it("отклоняет чужой кабинет, повтор пациента и неизвестные поля", () => {
    const doctor = doctorDemoSchema.parse(doctorDemoSources.normal);
    expect(
      doctorDemoSchema.safeParse({
        ...doctor,
        patients: [{ ...doctor.patients[0], doctorId: "demo-other-doctor" }],
      }).success,
    ).toBe(false);
    expect(
      doctorDemoSchema.safeParse({
        ...doctor,
        patients: [doctor.patients[0], doctor.patients[0]],
      }).success,
    ).toBe(false);
    expect(
      doctorDemoSchema.safeParse({ ...doctor, secret: "unknown" }).success,
    ).toBe(false);
  });
  it("отклоняет отрицательную активность, бесконечность и повтор врача", () => {
    const admin = adminDemoSchema.parse(adminDemoSources.normal);
    for (const value of [-1, Infinity])
      expect(
        adminDemoSchema.safeParse({
          ...admin,
          series: {
            ...admin.series,
            points: [{ id: "demo-invalid", label: "Дата", value }],
          },
        }).success,
      ).toBe(false);
    expect(
      adminDemoSchema.safeParse({
        ...admin,
        team: [admin.team[0], admin.team[0]],
      }).success,
    ).toBe(false);
  });
});
