import { View } from "react-native";
import { router } from "expo-router";
import { Screen, T, Button, Panel } from "../components/UI";
import { Touch } from "../components/Motion";
import { Companion } from "../components/Companion";
import { WorldItemArt } from "../components/WorldItemArt";
import { Icon } from "../components/Icon";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { achievementProgress } from "../core/achievements";
import { journeyProgress, shiftDay } from "../core/calendar";
import {
  allWorldSections,
  sectionBaseDay,
  SECTION_DAYS,
} from "../core/worldSections";
import { chapterRewardItem } from "../core/weeklyReward";
import { worldItems, scenes } from "../config/worldCatalog";
export default function WorldHub() {
  const { state, theme, today } = useApp(),
    { journey, act, saving } = useJourney();
  if (!journey) return null;
  const progress = journeyProgress(journey, today),
    reward = chapterRewardItem(progress.chapterIndex);
  const rewardName =
    reward === "garden"
      ? "Тихий сад"
      : (worldItems.find((i) => i.id === reward)?.name ?? "Украшение");
  const sections = allWorldSections(journey),
    todayBase = sectionBaseDay(journey.plan.startedAt, today);
  const showSection = async (day: string, edit = false) => {
    if (await act({ type: "world:section", day }))
      router.dismissTo({
        pathname: "/",
        params: edit ? { editWorld: "1" } : { showWorld: "1" },
      });
  };
  return (
    <Screen title="Мой мир" back>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <View style={{ flex: 1 }}>
          <T size={24} weight="700">
            Место, которое растёт с вами
          </T>
          <T size={13} muted style={{ marginTop: 10 }}>
            Все открытые украшения и территории остаются после пауз.
          </T>
        </View>
        <Companion size={128} id={state.mascot} />
      </View>
      <Button
        title="Изменить мир"
        onPress={() =>
          router.dismissTo({ pathname: "/", params: { editWorld: "1" } })
        }
      />
      <Panel style={{ marginTop: 20, gap: 10 }}>
        <T size={16} weight="600">
          Награда этой главы
        </T>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <WorldItemArt
            id={reward === "garden" ? "gazebo" : reward}
            size={72}
          />
          <View style={{ flex: 1 }}>
            <T size={17} weight="600">
              {rewardName}
            </T>
            <T size={12} muted>
              {progress.successes} из 5 выполненных дней
            </T>
          </View>
        </View>
        <T size={12} muted>
          {progress.chapterStart} — {shiftDay(progress.chapterStart, 6)}. Нужны
          любые 5 из 7 дней. Самочувствие не влияет на награду.
        </T>
      </Panel>
      <T size={20} weight="600" style={{ marginTop: 28, marginBottom: 12 }}>
        Участки вашего пути
      </T>
      {sections.map((s) => (
        <Touch
          key={s.anchorDay}
          accessibilityRole="button"
          accessibilityLabel={"Посмотреть участок " + s.anchorDay}
          disabled={saving}
          onPress={() => showSection(s.anchorDay)}
          style={{
            padding: 16,
            borderRadius: 20,
            backgroundColor:
              s.anchorDay === journey.world.anchorDay
                ? theme.soft
                : theme.surface,
            marginBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Icon name="leaf" size={24} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <T size={14} weight="600">
              {scenes[s.territory].name}
            </T>
            <T size={11} muted>
              {s.anchorDay} — {shiftDay(s.anchorDay, SECTION_DAYS - 1)} ·
              предметов {s.placements.length}
            </T>
          </View>
          <Icon name="arrow" size={18} color={theme.text} />
        </Touch>
      ))}
      {!sections.some((s) => s.anchorDay === todayBase) && (
        <Button
          title="Обустроить сегодняшний участок"
          secondary
          onPress={() => showSection(today, true)}
        />
      )}
      <T size={20} weight="600" style={{ marginTop: 28, marginBottom: 8 }}>
        Достижения
      </T>
      <T size={12} muted>
        Открываются за действия. Просмотр не включает редактор мира.
      </T>
      {achievementProgress(journey).map((a) => (
        <View
          key={a.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderColor: theme.border,
          }}
        >
          <WorldItemArt id={a.itemId} size={60} />
          <View style={{ flex: 1 }}>
            <T size={14} weight="600">
              {a.name}
            </T>
            <T size={12} muted>
              {worldItems.find((i) => i.id === a.itemId)?.name}
            </T>
            <T size={11} muted>
              {a.unlocked
                ? "Открыто"
                : Math.min(a.value, a.target) + " / " + a.target}
            </T>
          </View>
          {a.unlocked && <Icon name="check" size={22} color={theme.accent} />}
        </View>
      ))}
    </Screen>
  );
}
