import type { ClinicalDocument } from "./model";
export function extractCandidates(text: string): ClinicalDocument["facts"] {
  const fields: Record<string, string> = {
    жалобы: "Жалобы",
    анамнез: "Анамнез",
    диагноз: "Диагноз в исходном документе",
    назначения: "Назначения в исходном документе",
    рекомендации: "Рекомендации в исходном документе",
    аллергии: "Аллергии",
    состояние: "Описание состояния",
  };
  const result: ClinicalDocument["facts"] = [];
  for (const line of text.split(/\r?\n/)) {
    const match =
      /^\s*(Жалобы|Анамнез|Диагноз|Назначения|Рекомендации|Аллергии|Состояние)\s*[:—–-]\s*(.+)$/iu.exec(
        line,
      );
    if (match)
      result.push({
        id: crypto.randomUUID(),
        field: fields[match[1]!.toLocaleLowerCase("ru")]!,
        quote: line,
        value: match[2]!.trim(),
        confirmed: false,
      });
  }
  return result;
}
