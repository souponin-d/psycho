import { View, Alert } from "react-native";
import { router } from "expo-router";
import { Screen, T, Button, Panel } from "../components/UI";
import { Touch } from "../components/Motion";
import { Mascot } from "../components/Mascot";
import { DecorationArt } from "../components/ShoreObjects";
import { decorations, shoreProgress, type Decoration } from "../core/shore";
import { useApp } from "../state/AppProvider";
const items: { id: Decoration; name: string; hint: string }[] = [
  { id: "leaf", name: "Листок", hint: "Уже ваш" },
  { id: "lantern", name: "Фонарь", hint: "После первой записи" },
  { id: "stone", name: "Камешек", hint: "После трёх дней внимания" },
];
export default function ShoreSettingsScreen() {
  const { state, theme, dispatch, today } = useApp(),
    unlocked = decorations(state.memoryDays),
    progress = shoreProgress(state.memoryDays, today);
  return (
    <Screen back title="Ваш уголок">
      <View style={{ alignItems: "center", marginTop: 20, gap: 12 }}>
        <Mascot size={165} />
        <T size={30} weight="500" style={{ letterSpacing: -1 }}>
          Маленький мир рядом
        </T>
        <T size={13} muted>
          Предметы остаются с вами после пауз.
        </T>
      </View>
      <Panel style={{ marginTop: 24, gap: 10 }}>
        <T size={17} weight="500">
          Неделя в вашем ритме
        </T>
        <T size={14}>{Math.min(progress.weekDays, 3)} из 3 дней внимания</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: 5,
                flex: 1,
                borderRadius: 3,
                backgroundColor:
                  i < progress.weekDays ? theme.accent : theme.border,
              }}
            />
          ))}
        </View>
        <T muted size={12}>
          Одна запись оставляет след дня. Любое ощущение одинаково важно.
        </T>
      </Panel>
      <T size={19} weight="500" style={{ marginTop: 26, marginBottom: 14 }}>
        Украшение берега
      </T>
      <View style={{ gap: 10 }}>
        {items.map((item) => {
          const owned = unlocked.includes(item.id),
            selected = state.decoration === item.id;
          return (
            <Touch
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. ${owned ? (selected ? "Выбрано" : "Доступно") : item.hint}`}
              accessibilityState={{ selected }}
              onPress={() =>
                owned
                  ? dispatch({
                      type: "preferences",
                      patch: { decoration: item.id },
                    })
                  : Alert.alert(
                      item.name,
                      item.hint + " на берегу. Пропуски не стирают прогресс.",
                    )
              }
              style={{
                flexDirection: "row",
                gap: 16,
                alignItems: "center",
                padding: 17,
                borderRadius: 24,
                backgroundColor: selected ? theme.soft : theme.surface,
                borderWidth: 1,
                borderColor: selected ? theme.accent : theme.border,
              }}
            >
              <DecorationArt id={item.id} size={45} />
              <View style={{ flex: 1, gap: 3 }}>
                <T size={16} weight="500">
                  {item.name}
                </T>
                <T size={12} muted>
                  {selected
                    ? "На вашем берегу"
                    : owned
                      ? "Можно поставить"
                      : item.hint}
                </T>
              </View>
              <T size={20}>{selected ? "✓" : owned ? "›" : "○"}</T>
            </Touch>
          );
        })}
      </View>
      <View style={{ marginTop: 25, gap: 10 }}>
        <Button
          title="Выбрать спутника и тему"
          secondary
          icon="settings"
          onPress={() => router.push("/settings")}
        />
        <Button
          title="На свой берег"
          icon="home"
          onPress={() => router.dismissTo("/")}
        />
      </View>
    </Screen>
  );
}
