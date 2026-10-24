import { useState } from "react";
import { Alert, View, Switch, TextInput } from "react-native";
import { router } from "expo-router";
import { Screen, T, Heading, Panel, Button } from "../components/UI";
import { Touch } from "../components/Motion";
import { ThemePicker } from "../components/ThemePicker";
import { Icon } from "../components/Icon";
import { Mascot } from "../components/Mascot";
import { useApp } from "../state/AppProvider";
import { mascotOptions } from "../config/content";
import { ReminderSettings } from "../components/ReminderSettings";
import { useJourney } from "../state/JourneyProvider";
import { clearReminderNotifications } from "../services/localNotifications";
import { clearSavedHistoryExports } from "../services/historyExport";
export default function SettingsScreen() {
  const { state, dispatch, theme } = useApp();
  const { act, saving } = useJourney();
  const [name, setName] = useState(state.name);
  return (
    <Screen title="Ваше пространство" back>
      <Heading
        title={"Пусть будет\nпо-вашему"}
        body="Все изменения сохраняются на этом телефоне"
      />
      <T size={18} weight="500" style={{ marginBottom: 16 }}>
        Оформление
      </T>
      <ThemePicker />
      <ReminderSettings />
      <T size={18} weight="500" style={{ marginTop: 30, marginBottom: 16 }}>
        Ваш спутник
      </T>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {mascotOptions.map((item) => (
          <View key={item.id} style={{ flex: 1 }}>
            <Touch
              accessibilityRole="button"
              accessibilityLabel={`Спутник ${item.name}`}
              accessibilityState={{ selected: state.mascot === item.id }}
              onPress={() =>
                dispatch({ type: "preferences", patch: { mascot: item.id } })
              }
              style={{
                alignItems: "center",
                gap: 10,
                backgroundColor:
                  state.mascot === item.id ? theme.soft : theme.surface,
                borderRadius: 26,
                padding: 16,
                borderWidth: 1,
                borderColor:
                  state.mascot === item.id ? theme.accent : theme.border,
              }}
            >
              <View
                pointerEvents="none"
                importantForAccessibility="no-hide-descendants"
              >
                <Mascot id={item.id} size={95} />
              </View>
              <T size={14}>{item.name}</T>
              {state.mascot === item.id && (
                <Icon name="check" color={theme.accent} size={20} />
              )}
            </Touch>
          </View>
        ))}
      </View>
      <Panel style={{ marginTop: 25, gap: 14 }}>
        <T size={16} weight="500">
          Как к вам обращаться
        </T>
        <TextInput
          accessibilityLabel="Изменить имя"
          value={name}
          onChangeText={setName}
          onEndEditing={() =>
            dispatch({ type: "preferences", patch: { name } })
          }
          maxLength={30}
          style={{
            fontFamily: "Onest",
            fontSize: 18,
            padding: 14,
            borderRadius: 15,
            backgroundColor: theme.soft,
            color: theme.text,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            gap: 15,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <T size={15}>Живые движения</T>
            <T size={11} muted>
              Дыхание спутника и плавные переходы
            </T>
          </View>
          <Switch
            accessibilityLabel="Живые движения"
            value={state.motion}
            onValueChange={(motion) =>
              dispatch({ type: "preferences", patch: { motion } })
            }
            trackColor={{ true: theme.accent, false: theme.border }}
            thumbColor={theme.surface}
          />
        </View>
      </Panel>
      <Panel style={{ marginTop: 16, gap: 18 }}>
        {(
          [
            [
              "haptics",
              "Виброотклик",
              "Лёгкие касания при выборе и сохранении",
            ],
            [
              "gameplay",
              "Живой берег",
              "Предметы, воспоминания и личная цель недели",
            ],
          ] as const
        ).map(([key, title, description]) => (
          <View
            key={key}
            style={{ flexDirection: "row", alignItems: "center", gap: 15 }}
          >
            <View style={{ flex: 1 }}>
              <T size={15}>{title}</T>
              <T size={11} muted>
                {description}
              </T>
            </View>
            <Switch
              accessibilityLabel={title}
              value={state[key]}
              onValueChange={(value) =>
                dispatch({ type: "preferences", patch: { [key]: value } })
              }
              trackColor={{ true: theme.accent, false: theme.border }}
              thumbColor={theme.surface}
            />
          </View>
        ))}
      </Panel>
      <View style={{ gap: 12, marginTop: 24 }}>
        <Button
          secondary
          title="Украшения берега"
          icon="home"
          onPress={() => router.push("/shore-settings")}
        />
        <Button
          secondary
          title="Пройти знакомство ещё раз"
          icon="spark"
          onPress={() => {
            dispatch({ type: "preferences", patch: { name } });
            dispatch({ type: "onboard", value: false });
            router.replace("/onboarding");
          }}
        />
        <Button
          secondary
          title="Сбросить данные на телефоне"
          disabled={saving}
          icon="history"
          onPress={() =>
            Alert.alert(
              "Начать заново?",
              "Удалятся ваши локальные записи, файлы истории внутри Синкли, вопросы, настройки и расстановка. Внешние копии файлов останутся. Снова откроется учебный сценарий с восемью прошлыми днями.",
              [
                { text: "Отмена", style: "cancel" },
                {
                  text: "Сбросить",
                  style: "destructive",
                  onPress: async () => {
                    if (!(await act({ type: "reset" }))) return;
                    const cleanup = await Promise.allSettled([
                      clearReminderNotifications(),
                      Promise.resolve().then(clearSavedHistoryExports),
                    ]);
                    if (
                      cleanup.some((result) => result.status === "rejected")
                    ) {
                      Alert.alert(
                        "Очистка завершена частично",
                        "Профиль сброшен, но часть файлов или прежних сигналов удалить не удалось. Повторите сброс после знакомства.",
                      );
                    }
                    dispatch({ type: "reset" });
                    router.replace("/onboarding");
                  },
                },
              ],
            )
          }
        />
      </View>
      <T muted size={11} style={{ marginTop: 24, lineHeight: 17 }}>
        Синкли · 0.2.0
      </T>
    </Screen>
  );
}
