import { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { Screen, T } from "../components/UI";
import { Touch } from "../components/Motion";
import { Companion } from "../components/Companion";
import { companionModes, type CompanionMode } from "../core/companion";
import { wardrobe } from "../config/worldCatalog";
import { useApp } from "../state/AppProvider";

const labels: Record<CompanionMode, string> = {
  idle: "Спокойствие",
  blink: "Моргание",
  walk: "Прогулка",
  curious: "Любопытство",
  touch: "Касание",
  support: "Поддержка",
  sleepy: "Сонливость",
  surprised: "Удивление",
  dayComplete: "День выполнен",
  reward: "Награда",
  dress: "Примерка",
  sad: "Лёгкая грусть",
};
/** Isolated native motion review, not a patient task or a hidden clinical mode. */
export default function CompanionPreview() {
  const { theme } = useApp();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<CompanionMode>("idle"),
    [color, setColor] = useState("sage"),
    [clothing, setClothing] = useState("scarf"),
    [accessory, setAccessory] = useState("leaf");
  const size = Math.min(220, (width - 56) / 2);
  return (
    <Screen back title="Спутники Синкли">
      <T size={13} muted>
        Два спутника, живые реакции и свой гардероб.
      </T>
      <View style={{ flexDirection: "row", gap: 8, marginVertical: 24 }}>
        {(["fluffy", "cloud"] as const).map((id) => (
          <View
            key={id}
            style={{
              width: size,
              alignItems: "center",
              borderWidth: 1,
              borderStyle: "dashed",
              borderRadius: 24,
              borderColor: theme.border,
              backgroundColor: theme.surface,
            }}
          >
            <Companion
              size={size}
              id={id}
              mode={mode}
              outfit={{ color, clothing, accessory }}
            />
            <T size={13} weight="600" style={{ marginBottom: 12 }}>
              {id === "fluffy" ? "Пушистик" : "Облачко"}
            </T>
          </View>
        ))}
      </View>
      <T size={22} weight="600">
        {labels[mode]}
      </T>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginVertical: 16,
        }}
      >
        {companionModes.map((m) => (
          <Touch
            key={m}
            accessibilityRole="button"
            accessibilityLabel={`Состояние: ${labels[m]}`}
            onPress={() => setMode(m)}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: mode === m ? theme.soft : theme.surface,
            }}
          >
            <T size={12}>{labels[m]}</T>
          </Touch>
        ))}
      </View>
      {[
        {
          title: "Окраска",
          options: wardrobe.colors,
          value: color,
          set: setColor,
        },
        {
          title: "Одежда",
          options: wardrobe.clothing,
          value: clothing,
          set: setClothing,
        },
        {
          title: "Аксессуар",
          options: wardrobe.accessories,
          value: accessory,
          set: setAccessory,
        },
      ].map((section) => (
        <View key={section.title} style={{ gap: 8, marginBottom: 16 }}>
          <T size={16} weight="600">
            {section.title}
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {section.options.map((o) => (
              <Touch
                key={o.id}
                accessibilityRole="button"
                onPress={() => section.set(o.id)}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor:
                    section.value === o.id ? theme.soft : theme.surface,
                }}
              >
                <T size={12}>{o.name}</T>
              </Touch>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
