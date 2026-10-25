import { useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import type { JourneyState, WorldState } from "../core/journeyModel";
import { achievementProgress } from "../core/achievements";
import { findPlacement, ownsItem, validatePlacement } from "../core/world";
import { scenes, worldItems, wardrobe } from "../config/worldCatalog";
import type { MascotId } from "../core/model";
import { Companion } from "./Companion";
import { WorldItemArt } from "./WorldItemArt";
import { Button, Chip, RoundButton, T } from "./UI";
import { Touch } from "./Motion";

export function WorldEditor({
  visible,
  journey,
  world,
  onChange,
  onSelect,
  onClose,
  mascot,
  onMascotChange,
}: {
  visible: boolean;
  journey: JourneyState;
  world: WorldState;
  onChange: (world: WorldState) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  mascot: MascotId;
  onMascotChange: (mascot: MascotId) => void;
}) {
  const { theme, reducedMotion } = useApp();
  const safe = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState("Предметы");
  const profile = { ...journey, world };
  const changeTerritory = (territory: WorldState["territory"]) => {
    let next = {
      ...world,
      territory,
      placements: [] as WorldState["placements"],
    };
    for (const p of world.placements) {
      const item = worldItems.find((i) => i.id === p.itemId)!;
      const candidate = validatePlacement(item, p, scenes[territory]).valid
        ? p
        : findPlacement({ ...journey, world: next }, p.itemId);
      if (!candidate) {
        Alert.alert(
          "Не удалось перенести предметы",
          "Уберите несколько украшений и попробуйте снова.",
        );
        return;
      }
      next = {
        ...next,
        placements: [
          ...next.placements,
          { ...candidate, instanceId: p.instanceId },
        ],
      };
    }
    onChange(next);
    onClose();
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(8,24,20,.45)",
        }}
      >
        <View
          style={{
            backgroundColor: theme.page,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: "85%",
            paddingBottom: Math.max(safe.bottom, 16),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              padding: 20,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <T size={24} weight="600">
              Мой мир
            </T>
            <RoundButton
              icon="close"
              label="Закрыть мастерскую"
              onPress={onClose}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 16,
              gap: 8,
              flexWrap: "wrap",
              paddingBottom: 16,
            }}
          >
            {["Предметы", "Спутник", "Территории", "Достижения"].map((t) => (
              <Touch
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={{
                  padding: 12,
                  borderRadius: 18,
                  backgroundColor: tab === t ? theme.soft : theme.surface,
                }}
              >
                <T size={13} weight="600">
                  {t}
                </T>
              </Touch>
            ))}
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          >
            {tab === "Предметы" && (
              <>
                <T size={13} muted>
                  Выберите предмет, затем перетащите его на карте. Изменения
                  сохранятся после кнопки «Готово». {world.placements.length} /
                  20 предметов.
                </T>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    marginTop: 16,
                    gap: 12,
                  }}
                >
                  {worldItems.map((item) => {
                    const owned = ownsItem(profile, item.id);
                    const remaining =
                      item.max -
                      world.placements.filter((p) => p.itemId === item.id)
                        .length;
                    return (
                      <Touch
                        key={item.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name}. ${owned ? (remaining ? "Поставить" : "Все экземпляры расставлены") : item.hint}`}
                        onPress={() => {
                          if (!owned) {
                            Alert.alert(
                              item.name,
                              item.hint +
                                ". Предмет откроется напрямую за достижение.",
                            );
                            return;
                          }
                          const p = findPlacement(profile, item.id);
                          if (!p) {
                            Alert.alert(
                              "Пока нет места",
                              remaining
                                ? "В мире может быть до 20 предметов. Попробуйте убрать один."
                                : "Все экземпляры этого предмета уже расставлены.",
                            );
                            return;
                          }
                          onChange({
                            ...world,
                            placements: [...world.placements, p],
                          });
                          onSelect(p.instanceId);
                          onClose();
                        }}
                        style={{
                          width: (width - 52) / 2,
                          minHeight: 156,
                          padding: 12,
                          alignItems: "center",
                          borderRadius: 22,
                          backgroundColor: theme.surface,
                          opacity: owned ? 1 : 0.65,
                        }}
                      >
                        <WorldItemArt id={item.id} size={74} />
                        <T
                          size={13}
                          weight="600"
                          style={{ textAlign: "center" }}
                        >
                          {item.name}
                        </T>
                        <T
                          size={11}
                          muted
                          style={{ textAlign: "center", marginTop: 6 }}
                        >
                          {owned
                            ? remaining
                              ? "Поставить · " + remaining
                              : "На карте"
                            : item.hint}
                        </T>
                      </Touch>
                    );
                  })}
                </View>
              </>
            )}
            {tab === "Спутник" && (
              <View style={{ gap: 16 }}>
                <View style={{ alignItems: "center" }}>
                  <Companion
                    id={mascot}
                    size={240}
                    outfit={world.outfits[mascot]}
                    mode="dress"
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {(["fluffy", "cloud"] as const).map((id) => (
                    <Touch
                      key={id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: mascot === id }}
                      onPress={() => onMascotChange(id)}
                      style={{
                        padding: 16,
                        borderRadius: 20,
                        backgroundColor:
                          mascot === id ? theme.soft : theme.surface,
                      }}
                    >
                      <T size={14} weight="600">
                        {id === "fluffy" ? "Пушистик" : "Облачко"}
                      </T>
                    </Touch>
                  ))}
                </View>
                {(
                  [
                    {
                      title: "Окраска",
                      key: "color",
                      options: wardrobe.colors,
                    },
                    {
                      title: "Одежда",
                      key: "clothing",
                      options: wardrobe.clothing,
                    },
                    {
                      title: "Аксессуар",
                      key: "accessory",
                      options: wardrobe.accessories,
                    },
                  ] as const
                ).map((section) => (
                  <View key={section.key} style={{ gap: 8 }}>
                    <T size={16} weight="600">
                      {section.title}
                    </T>
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      {section.options.map((option) => (
                        <Touch
                          key={option.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${section.title}: ${option.name}`}
                          accessibilityState={{
                            selected:
                              world.outfits[mascot][section.key] === option.id,
                          }}
                          onPress={() =>
                            onChange({
                              ...world,
                              outfits: {
                                ...world.outfits,
                                [mascot]: {
                                  ...world.outfits[mascot],
                                  [section.key]: option.id,
                                },
                              },
                            })
                          }
                          style={{
                            padding: 14,
                            borderRadius: 18,
                            backgroundColor:
                              world.outfits[mascot][section.key] === option.id
                                ? theme.soft
                                : theme.surface,
                          }}
                        >
                          <T size={13}>{option.name}</T>
                        </Touch>
                      ))}
                    </View>
                  </View>
                ))}
                <T size={12} muted>
                  У каждого спутника свой гардероб. Вернитесь на карту и нажмите
                  «Готово», чтобы сохранить выбор.
                </T>
              </View>
            )}
            {tab === "Территории" && (
              <View style={{ gap: 16 }}>
                <T size={16} weight="600">
                  Свет
                </T>
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {(
                    [
                      { id: "morning", label: "Утро" },
                      { id: "dusk", label: "Тихий вечер" },
                      { id: "mist", label: "После дождя" },
                    ] as const
                  ).map((o) => (
                    <Chip
                      key={o.id}
                      label={o.label}
                      active={(world.ambience ?? "morning") === o.id}
                      onPress={() => onChange({ ...world, ambience: o.id })}
                    />
                  ))}
                </View>
                <T size={16} weight="600">
                  Растения
                </T>
                <View
                  style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                >
                  {(
                    [
                      { id: "flowers", label: "Полевые цветы" },
                      { id: "ferns", label: "Папоротники" },
                    ] as const
                  ).map((o) => (
                    <Chip
                      key={o.id}
                      label={o.label}
                      active={(world.flora ?? "flowers") === o.id}
                      onPress={() => onChange({ ...world, flora: o.id })}
                    />
                  ))}
                </View>
                <T size={13} muted>
                  Предметы и одежда сохраняются. Если украшение перекрывает
                  новую площадку дня, подберём ему свободное место: вы сможете
                  всё поправить перед сохранением.
                </T>
                {(["shore", "garden"] as const).map((id) => {
                  const owned =
                    id === "shore" ||
                    journey.rewards.some((r) => r.itemId === "garden");
                  return (
                    <Button
                      key={id}
                      title={`${scenes[id].name}${world.territory === id ? " · выбран" : owned ? "" : " · 5 выполненных дней за неделю"}`}
                      secondary
                      onPress={() =>
                        owned
                          ? changeTerritory(id)
                          : Alert.alert(
                              "Тихий сад",
                              "Откроется за пять выполненных дней в одной календарной неделе пути. Стрик может прерываться.",
                            )
                      }
                    />
                  );
                })}
              </View>
            )}
            {tab === "Достижения" && (
              <View style={{ gap: 16 }}>
                <T size={13} muted>
                  Любые ощущения одинаково важны. Награды зависят от действий, а
                  не от ответов. Открытые предметы остаются с вами после пауз.
                </T>
                {achievementProgress(journey).map((a) => (
                  <View
                    key={a.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <WorldItemArt id={a.itemId} size={56} />
                    <View style={{ flex: 1 }}>
                      <T size={16} weight="600">
                        {a.name}
                        {a.unlocked ? " · открыто" : ""}
                      </T>
                      <T size={12} muted>
                        {worldItems.find((i) => i.id === a.itemId)?.hint} ·{" "}
                        {Math.min(a.value, a.target)} / {a.target}
                      </T>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
