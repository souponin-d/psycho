import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { questionnaires } from "../../../mobile-patient/src/config/questionnaires.ts";
import {
  clinicalProtocols,
  describeClinicalScore,
  getClinicalProtocol,
} from "./clinical-protocols";

describe("проверенные источники двух взрослых русских форм", () => {
  it("сохраняет точный мобильный текст, версии, порядок и семантические хеши", () => {
    expect(clinicalProtocols).toHaveLength(2);
    for (const mobile of Object.values(questionnaires)) {
      const protocol = getClinicalProtocol(mobile.version)!;
      expect(protocol).toMatchObject({
        id: mobile.id,
        version: mobile.version,
        title: mobile.title,
        instruction: mobile.instruction,
        questions: mobile.questions,
        options: mobile.options,
        attribution: mobile.attribution,
        sourceUrl: mobile.source,
        items: mobile.questions.length,
        minimum: 0,
        maximum: mobile.questions.length * 3,
        status: "evidence-reviewed",
        clinicalApproval: null,
      });
      expect(protocol.impactQuestion).toBe(mobile.impactQuestion);
      expect(protocol.impactOptions).toEqual(mobile.impactOptions);
      const canonical = JSON.stringify({
        id: mobile.id,
        language: mobile.language,
        version: mobile.version,
        instruction: mobile.instruction,
        questions: mobile.questions,
        options: mobile.options,
        impactQuestion: mobile.impactQuestion ?? null,
        impactOptions: mobile.impactOptions ?? null,
      });
      expect(protocol.contentHash).toBe(
        createHash("sha256").update(canonical, "utf8").digest("hex"),
      );
      expect(protocol.evidenceUrls).toContain(
        "https://archive.thepcc.org/sites/default/files/resources/instructions.pdf",
      );
      expect(protocol.attribution).toContain("Воспроизведение");
      expect(protocol.limitations).toContain("не");
    }
    expect(clinicalProtocols.map((protocol) => protocol.scale)).toEqual([
      "GAD-7",
      "PHQ-9",
    ]);
    expect(clinicalProtocols[0]!.contentHash).toBe(
      "e68ad4428c38cc6bb2c34a75ad9533260aca1f52dd906137a7fbba168fc44784",
    );
    expect(clinicalProtocols[1]!.contentHash).toBe(
      "7736a230f0d9d9470b65501921f685fadcf09c7d6d0918f1bcf215192f8da94c",
    );
  });

  it("не подбирает неизвестную или прежнюю синтетическую версию", () => {
    expect(getClinicalProtocol("unknown")).toBeUndefined();
    expect(getClinicalProtocol("gad7")).toBeUndefined();
    expect(getClinicalProtocol("")).toBeUndefined();
  });

  it.each([
    [0, "Минимальная"],
    [4, "Минимальная"],
    [5, "Лёгкая"],
    [9, "Лёгкая"],
    [10, "Умеренная"],
    [14, "Умеренная"],
    [15, "Тяжёлая"],
    [21, "Тяжёлая"],
  ])("описывает GAD-7 %i как выраженность симптомов", (score, prefix) => {
    const result = describeClinicalScore(clinicalProtocols[0]!, score);
    expect(result).toEqual({
      label: `${prefix} выраженность тревожных симптомов`,
      sourceUrl:
        "https://archive.thepcc.org/sites/default/files/resources/instructions.pdf",
      diagnostic: false,
    });
  });

  it.each([
    [0, "Минимальная"],
    [4, "Минимальная"],
    [5, "Лёгкая"],
    [9, "Лёгкая"],
    [10, "Умеренная"],
    [14, "Умеренная"],
    [15, "Умеренно тяжёлая"],
    [19, "Умеренно тяжёлая"],
    [20, "Тяжёлая"],
    [27, "Тяжёлая"],
  ])("описывает PHQ-9 %i как выраженность симптомов", (score, prefix) => {
    const result = describeClinicalScore(clinicalProtocols[1]!, score);
    expect(result).toEqual({
      label: `${prefix} выраженность депрессивных симптомов`,
      sourceUrl:
        "https://archive.thepcc.org/sites/default/files/resources/instructions.pdf",
      diagnostic: false,
    });
  });

  it("не описывает неполные, нечисловые, дробные и невозможные суммы", () => {
    for (const protocol of clinicalProtocols) {
      for (const score of [
        null,
        undefined,
        true,
        false,
        "10",
        NaN,
        Infinity,
        -Infinity,
        -1,
        1.5,
        protocol.maximum + 1,
      ]) {
        expect(
          describeClinicalScore(protocol, score as number | null),
        ).toBeNull();
      }
    }
    expect(
      describeClinicalScore(
        { ...clinicalProtocols[0]!, version: "unknown" },
        10,
      ),
    ).toBeNull();
    expect(
      describeClinicalScore(
        { ...clinicalProtocols[0]!, status: "synthetic-only" },
        10,
      ),
    ).toBeNull();
  });
});
