import { describe, expect, it } from "vitest";
import {
  createClinicDataset,
  DEMO_DAY,
  DATA_START,
} from "../apps/web-admin/src/demo/analytics/fixtures";
import {
  analyseClinic,
  clinicalSummary,
  defaultFilter,
  previousPeriod,
  csvReport,
} from "../apps/web-admin/src/demo/analytics/aggregate";

describe("событийная аналитика клиники", () => {
  it("воспроизводит 200 пациентов, 12 врачей, 3 отделения и 180 дней без случайных ID", () => {
    const data = createClinicDataset("normal");
    expect(data).toEqual(createClinicDataset("normal"));
    expect(data.patients).toHaveLength(200);
    expect(data.doctors).toHaveLength(12);
    expect(data.departments).toHaveLength(3);
    expect((Date.parse(DEMO_DAY) - Date.parse(DATA_START)) / 86400000 + 1).toBe(
      180,
    );
    expect(data.reports.length).toBeGreaterThan(3000);
    expect(data.observations.length).toBeGreaterThan(400);
    const ids = new Set(data.expectedForms.map((row) => row.id));
    expect(data.reports.every((row) => ids.has(row.expectedId))).toBe(true);
    expect(new Set(data.reports.map((row) => row.id)).size).toBe(
      data.reports.length,
    );
  });
  it("согласует дневные и кабинетные разрезы одной выборки, не смешивает периоды", () => {
    const data = createClinicDataset("normal");
    const filter = defaultFilter();
    const all = analyseClinic(data, filter);
    expect(all.daily.reduce((sum, row) => sum + row.reports, 0)).toBe(
      all.summary.reports,
    );
    expect(all.byDoctor.reduce((sum, row) => sum + row.reports, 0)).toBe(
      all.summary.reports,
    );
    const selected = analyseClinic(data, {
      ...filter,
      departmentId: data.departments[0]!.id,
    });
    expect(
      selected.selected.patients.every(
        (row) =>
          data.doctors.find((d) => d.id === row.doctorId)?.departmentId ===
          data.departments[0]!.id,
      ),
    ).toBe(true);
    expect(selected.summary.reports).toBeLessThan(all.summary.reports);
    const previous = previousPeriod(filter);
    expect(previous.to < filter.from).toBe(true);
    expect(Date.parse(previous.to) - Date.parse(previous.from)).toBe(
      Date.parse(filter.to) - Date.parse(filter.from),
    );
  });
  it("пустая выборка не получает 0% выполнения или среднее значение", () => {
    const result = analyseClinic(createClinicDataset("empty"), defaultFilter());
    expect(result.summary.reports).toBe(0);
    expect(result.summary.completion).toBeNull();
    expect(result.clinical.pairs).toBe(0);
    expect(result.clinical.change).toBeNull();
    expect(result.daily).toHaveLength(30);
  });
  it("сравнение дней использует пациентов предыдущего периода, включая завершивших наблюдение", () => {
    const data = createClinicDataset("normal");
    const result = analyseClinic(data, {
      ...defaultFilter(),
      from: "2026-10-14",
    });
    expect(
      result.daily.reduce((sum, row) => sum + (row.previous ?? 0), 0),
    ).toBe(result.previous!.reports);
  });
  it("парная статистика исключает чужую версию и показывает N вместо ложного нуля", () => {
    const result = clinicalSummary(
      [
        {
          id: "a",
          patientId: "p1",
          day: "2026-09-01",
          scale: "PHQ-9",
          version: "v1",
          value: 18,
        },
        {
          id: "b",
          patientId: "p1",
          day: "2026-10-10",
          scale: "PHQ-9",
          version: "v1",
          value: 12,
        },
        {
          id: "c",
          patientId: "p2",
          day: "2026-09-01",
          scale: "PHQ-9",
          version: "v1",
          value: 10,
        },
        {
          id: "d",
          patientId: "p2",
          day: "2026-10-10",
          scale: "PHQ-9",
          version: "v2",
          value: 4,
        },
      ],
      ["p1", "p2"],
      { ...defaultFilter(), from: "2026-10-01" },
      "PHQ-9",
    );
    expect(result.pairs).toBe(1);
    expect(result.change).toBe(-6);
    expect(result.excluded).toBe(1);
  });
  it("CSV содержит активные фильтры и корректно экранирует длинные подписи", () => {
    const data = createClinicDataset("long");
    const filter = {
      ...defaultFilter(),
      departmentId: data.departments[0]!.id,
    };
    const csv = csvReport(data, filter, analyseClinic(data, filter));
    expect(csv).toContain(filter.from);
    expect(csv).toContain(data.departments[0]!.name.replaceAll('"', '""'));
    expect(csv).toContain("Синтетические данные");
    expect(csv).toContain("Определение");
  });
});
