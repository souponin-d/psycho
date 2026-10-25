import { View } from "react-native";
import { Chip, T } from "./UI";
import type { ReportField, ReportFields } from "../core/journeyModel";

export function ReportFieldsEditor({
  fields,
  required,
  onChange,
}: {
  fields: ReportFields;
  required: ReportField[];
  onChange: (fields: ReportFields) => void;
}) {
  return (
    <View style={{ gap: 18 }}>
      {required.includes("sleep") && (
        <View style={{ gap: 9 }}>
          <T size={16} weight="500">
            Как прошла ночь? · обязательно
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Плохо", "Обычно", "Хорошо"].map((value) => (
              <Chip
                key={value}
                label={value}
                active={fields.sleep === value}
                onPress={() => onChange({ ...fields, sleep: value })}
              />
            ))}
          </View>
        </View>
      )}
      {(["anxiety", "functioning"] as const)
        .filter((key) => required.includes(key))
        .map((key) => (
          <View key={key} style={{ gap: 9 }}>
            <T size={16} weight="500">
              {key === "anxiety"
                ? "Насколько беспокоила тревога?"
                : "Хватало ли сил на привычные дела?"}
            </T>
            <T muted size={11}>
              {key === "anxiety"
                ? "0 — совсем нет, 10 — очень сильно"
                : "0 — совсем не хватало, 10 — полностью хватало"}{" "}
              · обязательно
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {Array.from({ length: 11 }, (_, i) => (
                <Chip
                  key={i}
                  label={String(i)}
                  accessibilityLabel={`${key === "anxiety" ? "Тревога" : "Силы на привычные дела"}: ${i}`}
                  active={fields[key] === i}
                  onPress={() => onChange({ ...fields, [key]: i })}
                />
              ))}
            </View>
          </View>
        ))}
      {required.includes("tolerability") && (
        <View style={{ gap: 9 }}>
          <T size={16} weight="500">
            Как переносится терапия? · обязательно
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Без трудностей", "Есть трудности"].map((value) => (
              <Chip
                key={value}
                label={value}
                active={fields.tolerability === value}
                onPress={() => onChange({ ...fields, tolerability: value })}
              />
            ))}
          </View>
          <T muted size={11}>
            При трудностях можно отдельно сохранить обращение к врачу.
          </T>
        </View>
      )}
    </View>
  );
}
