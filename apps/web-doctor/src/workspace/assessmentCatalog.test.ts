import { describe, expect, it } from "vitest";
import sourceData from "./source-data.json";
import { assessmentCatalog, calculateAssessment } from "./assessmentCatalog";

const form = (id: string) =>
  assessmentCatalog.find((entry) => entry.id === id)!;
const answers = (id: string, value: number | "minimum" | "maximum") =>
  Object.fromEntries(
    form(id).items.map((item) => [
      item.key,
      typeof value === "number" ? value : item[value],
    ]),
  );
const output = (
  id: string,
  responses: Record<string, number | string | null>,
  label: string,
) =>
  calculateAssessment(id, responses).outputs.find(
    (item) => item.label === label,
  )!.value;

describe("unapproved source-specific assessment arithmetic", () => {
  it("pins all 18 local forms to their exact source hash and keeps PHQ-9 unavailable", () => {
    expect(assessmentCatalog).toHaveLength(19);
    for (let n = 21; n <= 38; n++) {
      const entry = form(`S${n}`);
      const source = sourceData.find((item) => item.id === entry.id)!;
      expect(entry).toMatchObject({
        status: "unapproved",
        sourceStatus: "available",
        sourceId: source.id,
        sourceHash: source.sha256,
        title: source.title,
        version: `source-${source.sha256.slice(0, 12)}-draft-1`,
      });
      expect(entry.warnings.length).toBeGreaterThan(0);
      expect(new Set(entry.items.map((item) => item.key)).size).toBe(
        entry.items.length,
      );
    }
    expect(form("PHQ-9")).toMatchObject({
      sourceId: "",
      sourceHash: "",
      version: "missing-source",
      sourceStatus: "missing-source",
      items: [],
      calculation: "unsupported",
    });
    expect(calculateAssessment("PHQ-9", {})).toMatchObject({
      complete: false,
      outputs: [{ value: null }],
    });
  });

  it.each([
    ["S21", 0, 32],
    ["S23", 0, 21],
    ["S24", 0, 33],
    ["S26", 0, 52],
    ["S27", 0, 60],
    ["S30", 12, 60],
    ["S35", 0, 140],
    ["S37", 0, 63],
  ])(
    "calculates source range for %s without interpreting it",
    (id, minimum, maximum) => {
      const low = calculateAssessment(id, answers(id, "minimum"));
      const high = calculateAssessment(id, answers(id, "maximum"));
      expect(low.complete).toBe(true);
      expect(high.complete).toBe(true);
      expect(low.outputs[0]?.value).toBe(minimum);
      expect(high.outputs[0]?.value).toBe(maximum);
    },
  );

  it("distinguishes a zero response from every missing response representation", () => {
    const zero = answers("S23", 0);
    expect(calculateAssessment("S23", zero)).toMatchObject({
      complete: true,
      outputs: [{ value: 0 }],
    });
    for (const missing of [null, "", "  "]) {
      expect(
        calculateAssessment("S23", { ...zero, "4": missing }),
      ).toMatchObject({
        complete: false,
        outputs: [{ value: null }],
      });
    }
    delete zero["4"];
    expect(calculateAssessment("S23", zero).outputs[0]?.value).toBeNull();
    expect(
      calculateAssessment("S23", { ...zero, "4": "0" }).outputs[0]?.value,
    ).toBe(0);
  });

  it.each(["S21", "S24"])(
    "counts literal source Yes/No responses in %s without changing saved values",
    (id) => {
      const responses = Object.fromEntries(
        form(id).items.map((item) => [item.key, "Нет"]),
      );
      responses["1"] = "Да";
      responses["2"] = "Да";
      expect(calculateAssessment(id, responses)).toMatchObject({
        complete: true,
        outputs: [{ value: 2 }],
      });
      expect(responses["1"]).toBe("Да");
      expect(responses["3"]).toBe("Нет");
      expect(() =>
        calculateAssessment(id, { ...responses, "1": "Возможно" }),
      ).toThrow();
    },
  );

  it.each(assessmentCatalog.map((entry) => entry.id))(
    "does not complete an empty %s form",
    (id) => {
      const result = calculateAssessment(id, {});
      expect(result.complete).toBe(false);
      expect(result.outputs.every((item) => item.value === null)).toBe(true);
    },
  );

  it.each([NaN, Infinity, -1, 4, 1.5, "1e0", "да", true, undefined])(
    "rejects invalid GAD-7 response %s instead of coercing it",
    (value) => {
      expect(() =>
        calculateAssessment("S23", {
          ...answers("S23", 0),
          "1": value,
        } as never),
      ).toThrow(/пункт 1/i);
    },
  );
  it("rejects unknown forms and unknown response keys", () => {
    expect(() => calculateAssessment("unknown", {})).toThrow(
      /Неизвестная форма/,
    );
    expect(() =>
      calculateAssessment("S23", { ...answers("S23", 0), "8": 0 }),
    ).toThrow(/Неизвестный пункт/);
    expect(() => calculateAssessment("S23", [] as never)).toThrow(/объект/);
  });

  it("labels the YMRS conflicting item-7 sum as raw and does not fabricate a resolved score", () => {
    const result = calculateAssessment("S22", answers("S22", "maximum"));
    expect(result.outputs).toEqual([
      {
        label: "Сырая сумма по вариантам ответов локальной формы",
        value: 60,
        maximum: 60,
      },
      { label: "Согласованный итог YMRS", value: null },
    ]);
    expect(result.warnings.join(" ")).toMatch(/пункт.*7/i);
    expect(() =>
      calculateAssessment("S22", { ...answers("S22", 0), "7": 8 }),
    ).toThrow();
  });

  it("does not turn an incomplete C-SSRS interview into a negative risk result", () => {
    expect(calculateAssessment("S25", {})).toMatchObject({
      complete: false,
      outputs: [{ value: null }],
    });
  });

  it("uses the local HARS partition and never borrows a canonical one", () => {
    const result = calculateAssessment("S28", {
      ...answers("S28", 0),
      "7": 4,
      "14": 3,
    });
    expect(result.outputs.map((item) => item.value)).toEqual([7, 0, 7]);
  });

  it("keeps ITT trait and state sums independent and missing weighted keys unavailable", () => {
    const responses = answers("S29", 0);
    for (let n = 1; n <= 15; n++) responses[`trait.${n}`] = 3;
    expect(
      calculateAssessment("S29", responses).outputs.map((item) => item.value),
    ).toEqual([45, 0, null]);
    delete responses["state.15"];
    const partial = calculateAssessment("S29", responses);
    expect(partial.complete).toBe(false);
    expect(partial.outputs.map((item) => item.value)).toEqual([45, null, null]);
  });

  it("uses the literal STAI direct/reverse key, marks its contradictions, and does not repair them", () => {
    const direct = new Set([
      3, 4, 6, 7, 9, 12, 14, 15, 17, 18, 22, 23, 24, 25, 28, 29, 31, 32, 34, 35,
      37, 38, 40,
    ]);
    const low = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        String(index + 1),
        direct.has(index + 1) ? 1 : 4,
      ]),
    );
    const high = Object.fromEntries(
      Object.entries(low).map(([key, value]) => [key, 5 - value]),
    );
    expect(
      calculateAssessment("S31", low).outputs.map((item) => item.value),
    ).toEqual([20, 20]);
    expect(
      calculateAssessment("S31", high).outputs.map((item) => item.value),
    ).toEqual([80, 80]);
    expect(
      calculateAssessment("S31", answers("S31", 1)).outputs.map(
        (item) => item.value,
      ),
    ).toEqual([50, 41]);
    const changed = { ...answers("S31", 1), "13": 4, "15": 4, "33": 4 };
    expect(
      calculateAssessment("S31", changed).outputs.map((item) => item.value),
    ).toEqual([50, 38]);
    expect(calculateAssessment("S31", high).warnings.join(" ")).toMatch(
      /13.*15.*33/,
    );
  });

  it("SCL-90-R avoids zero denominator and refuses the contradictory DEP key", () => {
    const zero = answers("S32", 0);
    expect(output("S32", zero, "GSI")).toBe(0);
    expect(output("S32", zero, "PSI")).toBe(0);
    expect(output("S32", zero, "PDSI")).toBeNull();
    expect(calculateAssessment("S32", zero).warnings.join(" ")).toMatch(
      /нулев/,
    );
    const positive = { ...zero, "1": 4, "90": 2 };
    expect(output("S32", positive, "GSI")).toBeCloseTo(6 / 90);
    expect(output("S32", positive, "PSI")).toBe(2);
    expect(output("S32", positive, "PDSI")).toBe(3);
    expect(output("S32", positive, "DEP — ключ не согласован")).toBeNull();
    delete zero["90"];
    expect(output("S32", zero, "GSI")).toBeNull();
    expect(output("S32", zero, "SOM")).toBe(0);
  });

  it("calculates GELOPH means without rounding or classifying a boundary", () => {
    const responses = { ...answers("S33", 1), "2": 2 };
    expect(output("S33", responses, "Среднее по 15 пунктам")).toBe(16 / 15);
    expect(output("S33", responses, "Социальное реагирование — среднее")).toBe(
      1,
    );
    expect(output("S33", responses, "Самовосприятие — среднее")).toBe(7 / 6);
  });

  it("keeps CGI components separate and treats code zero as unassessable", () => {
    const zero = calculateAssessment("S34", { "1": 0, "2": 0, "3": 0 });
    expect(zero.complete).toBe(false);
    expect(zero.outputs.every((item) => item.value === null)).toBe(true);
    const full = calculateAssessment("S34", { "1": 3, "2": 2, "3": 6 });
    expect(full.outputs.map((item) => item.value)).toEqual([null, 3, 2, 6]);
    expect(full.warnings.join(" ")).toMatch(/CGI-S/);
  });

  it("preserves the source LSAS 1..4 encoding and separate fear/avoidance sums", () => {
    const low = calculateAssessment("S36", answers("S36", "minimum"));
    const high = calculateAssessment("S36", answers("S36", "maximum"));
    expect(low.outputs.map((item) => item.value)).toEqual([48, 24, 24, null]);
    expect(high.outputs.map((item) => item.value)).toEqual([192, 96, 96, null]);
    expect(() =>
      calculateAssessment("S36", { ...answers("S36", 1), "fear.1": 0 }),
    ).toThrow();
  });

  it("reproduces KOP-25 PDF formulas, overlapping readiness items and weighted integral", () => {
    const maximum = calculateAssessment("S38", answers("S38", 6));
    expect(maximum.outputs.slice(6).map((item) => item.value)).toEqual([
      100, 100, 100, 100,
    ]);
    expect(
      calculateAssessment("S38", answers("S38", 1)).outputs[9]?.value,
    ).toBeCloseTo(25 / 9);
    const responses: Record<string, number> = {
      ...answers("S38", 1),
      "2": 6,
      "16": 6,
      "19": 6,
    };
    const result = calculateAssessment("S38", responses);
    expect(result.outputs.slice(0, 6).map((item) => item.value)).toEqual([
      10, 5, 5, 10, 15, 10,
    ]);
    expect(result.outputs[6]?.value).toBeCloseTo(100 / 9);
    expect(result.outputs[7]?.value).toBeCloseTo(75 / 9);
    expect(result.outputs[8]?.value).toBeCloseTo(50 / 9);
    expect(result.outputs[9]?.value).toBeCloseTo(475 / 54);
    delete responses["2"];
    const partial = calculateAssessment("S38", responses);
    expect(partial.outputs[6]?.value).toBeNull();
    expect(partial.outputs[7]?.value).toBeCloseTo(75 / 9);
    expect(partial.outputs[9]?.value).toBeNull();
    expect(() =>
      calculateAssessment("S38", { ...answers("S38", 1), "2": 0 }),
    ).toThrow();
  });
});
