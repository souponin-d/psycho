import { useEffect, useRef, useState } from "react";
import {
  Image,
  Alert,
  Modal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { journeyMap } from "../core/journeyMap";
import { journeyProgress, shiftDay } from "../core/calendar";
import { assignedTasks } from "../core/questionnaires";
import { T, Button, RoundButton } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import { WorldCompanion } from "./WorldCompanion";
import type { MascotId } from "../core/model";
import { scenes, worldItems } from "../config/worldCatalog";
import { cloneWorld, validatePlacement } from "../core/world";
import type { Placement, WorldState } from "../core/journeyModel";
import { WorldScene } from "./WorldScene";
import { WorldEditor } from "./WorldEditor";
import { JourneyDayMarker } from "./JourneyDayMarker";
import { journeyHud } from "../core/journeyPresentation";

const statusLabels = {
  complete: "День выполнен",
  missed: "День пропущен",
  today: "Сегодня",
  future: "Впереди",
};
function dateLabel(day: string) {
  return new Date(`${day}T12:00:00`)
    .toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
    })
    .replace(/\.$/, "");
}

export function JourneyMap() {
  const { state, dispatch, theme, today, reducedMotion } = useApp();
  const { journey, act, saving } = useJourney();
  const params = useLocalSearchParams<{ editWorld?: string }>();
  const [draftWorld, setDraftWorld] = useState<WorldState | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [tools, setTools] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftMascot, setDraftMascot] = useState<MascotId | null>(null);
  const [interaction, setInteraction] = useState<{
    id: string;
    at: number;
  } | null>(null);
  const rewardCount = useRef<number | null>(null);
  const [newReward, setNewReward] = useState("");
  useEffect(() => {
    if (!journey) return;
    if (
      rewardCount.current !== null &&
      journey.rewards.length > rewardCount.current
    )
      setNewReward(journey.rewards.at(-1)?.id ?? "");
    rewardCount.current = journey.rewards.length;
  }, [journey]);
  const lastFocusedItem = useRef<string | null>(null);
  const safe = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(600);
  const [contentHeight, setContentHeight] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const map = journey ? journeyMap(journey, today) : null;
  const world = draftWorld ?? journey?.world;
  const stones = scenes[world?.territory ?? "shore"].stones;
  const tileHeight = width * 3;
  const tileCount = Math.ceil((map?.days.length ?? 0) / stones.length);
  const height = tileCount * tileHeight;
  const todayIndex = map?.todayIndex ?? 0;
  const worldTileTop =
    (tileCount - 1 - Math.floor(todayIndex / stones.length)) * tileHeight;
  const todayY =
    (tileCount -
      1 -
      Math.floor(todayIndex / stones.length) +
      stones[todayIndex % stones.length][1]) *
    tileHeight;
  const todayOffset = Math.max(
    0,
    220 + todayY - Math.max(330, viewport * 0.54),
  );
  useEffect(() => {
    if (params.editWorld && journey) {
      setDraftWorld(cloneWorld(journey.world));
      setTools(true);
      router.setParams({ editWorld: undefined });
    }
  }, [params.editWorld, journey]);
  useEffect(() => {
    if (!selectedItem) {
      lastFocusedItem.current = null;
      return;
    }
    if (!draftWorld || lastFocusedItem.current === selectedItem) return;
    const p = draftWorld.placements.find((p) => p.instanceId === selectedItem);
    if (!p) return;
    lastFocusedItem.current = selectedItem;
    scroll.current?.scrollTo({
      y: Math.max(0, 220 + worldTileTop + p.y * tileHeight - viewport * 0.48),
      animated: !reducedMotion,
    });
  }, [
    draftWorld,
    selectedItem,
    worldTileTop,
    tileHeight,
    viewport,
    reducedMotion,
  ]);
  useEffect(() => {
    if (!contentHeight) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: todayOffset, animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [contentHeight, todayOffset]);
  if (!journey || !map || !world) return null;
  const progress = journeyProgress(journey, today);
  const position = (index: number) => {
    const [x, y] = stones[index % stones.length];
    return {
      x: x * width,
      y: (tileCount - 1 - Math.floor(index / stones.length) + y) * tileHeight,
    };
  };
  const goToday = (animated = !reducedMotion) => {
    scroll.current?.scrollTo({
      y: todayOffset,
      animated,
    });
  };
  const selectedDay = map.days.find((d) => d.day === selected);
  const tasks = selected ? assignedTasks(journey, selected) : [];
  const todayTasks = assignedTasks(journey, today);
  const hud = journeyHud(
    todayTasks.filter((t) => t.completed).length,
    todayTasks.length,
    progress.successes,
    progress.chapterStart,
  );
  const nextTask = todayTasks.find((t) => !t.completed);
  const openNextTask = () => {
    if (nextTask?.kind === "report") router.push("/check-in");
    else if (nextTask?.kind === "questionnaire")
      router.push({ pathname: "/questionnaire", params: { id: nextTask.id } });
    else router.push("/(tabs)/plan");
  };
  const dark = state.theme === "dark";
  const selectedPlacement = world.placements.find(
    (p) => p.instanceId === selectedItem,
  );
  const selectItem = (id: string) => {
    setSelectedItem(id);
    if (!draftWorld) {
      const target = world.placements.find((p) => p.instanceId === id);
      if (target)
        scroll.current?.scrollTo({
          y: Math.max(
            0,
            220 + worldTileTop + target.y * tileHeight - viewport * 0.66,
          ),
          animated: !reducedMotion,
        });
      setInteraction({ id, at: Date.now() });
    }
    if (!draftWorld) {
      setTools(false);
    }
  };
  const moveItem = (p: Placement) => {
    if (!draftWorld) return;
    const item = worldItems.find((i) => i.id === p.itemId)!;
    const result = validatePlacement(item, p, scenes[world.territory]);
    if (!result.valid) {
      Alert.alert("Выберите свободное место", result.reason);
      return;
    }
    setDraftWorld({
      ...draftWorld,
      placements: draftWorld.placements.map((i) =>
        i.instanceId === p.instanceId ? p : i,
      ),
    });
  };
  const stopEditing = () => {
    setDraftWorld(null);
    setDraftMascot(null);
    setSelectedItem(null);
    setDragging(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView
        ref={scroll}
        accessibilityLabel="Мой путь: вертикальная карта дней"
        showsVerticalScrollIndicator
        scrollEnabled={!dragging}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, measuredHeight) =>
          setContentHeight(measuredHeight)
        }
        contentContainerStyle={{ paddingTop: 220, paddingBottom: 180 }}
      >
        <View style={{ height, width }}>
          {Array.from({ length: tileCount }, (_, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                top: i * tileHeight,
                width,
                height: tileHeight,
              }}
            >
              <Image
                source={
                  world.territory === "shore"
                    ? require("../../assets/images/journey-shore.png")
                    : require("../../assets/images/journey-environment.png")
                }
                accessible={false}
                style={{ width, height: tileHeight }}
                resizeMode="stretch"
              />
              {world.ambience && world.ambience !== "morning" && (
                <LinearGradient
                  pointerEvents="none"
                  colors={
                    world.ambience === "dusk"
                      ? [
                          "rgba(195,113,124,.20)",
                          "rgba(245,190,125,.13)",
                          "rgba(106,124,161,.18)",
                        ]
                      : [
                          "rgba(210,228,221,.32)",
                          "rgba(225,235,225,.08)",
                          "rgba(170,199,181,.30)",
                        ]
                  }
                  style={{ position: "absolute", inset: 0 }}
                />
              )}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: dark
                    ? "rgba(9,20,36,0.58)"
                    : "rgba(255,247,224,0.04)",
                }}
              />
            </View>
          ))}
          {Array.from({ length: Math.max(0, tileCount - 1) }, (_, i) => (
            <LinearGradient
              key={`mist-${i}`}
              pointerEvents="none"
              colors={[
                `${theme.page}00`,
                theme.page,
                theme.page,
                `${theme.page}00`,
              ]}
              locations={[0, 0.42, 0.58, 1]}
              style={{
                position: "absolute",
                top: (i + 1) * tileHeight - 100,
                width,
                height: 200,
              }}
            />
          ))}
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: worldTileTop,
              width,
              height: tileHeight,
            }}
          >
            <WorldScene
              world={world}
              width={width}
              height={tileHeight}
              editing={!!draftWorld}
              selected={draftWorld ? selectedItem : null}
              onSelect={selectItem}
              onMove={moveItem}
              onDrag={setDragging}
            />
          </View>
          {map.days.map((day) => {
            const p = position(day.index);
            return (
              <View
                key={day.day}
                style={{ position: "absolute", left: p.x - 63, top: p.y - 41 }}
              >
                <JourneyDayMarker
                  day={day.day}
                  status={day.status}
                  completeToday={progress.today.complete}
                  label={`${dateLabel(day.day)}. ${statusLabels[day.status]}. День пути ${day.index + 1}`}
                  onPress={() => {
                    if (!draftWorld) setSelected(day.day);
                  }}
                />
              </View>
            );
          })}
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: worldTileTop,
              width,
              height: tileHeight,
            }}
          >
            <WorldCompanion
              world={world}
              width={width}
              height={tileHeight}
              home={{
                x: stones[todayIndex % stones.length][0],
                y: stones[todayIndex % stones.length][1],
              }}
              request={interaction}
              editing={!!draftWorld}
              id={draftMascot ?? state.mascot}
              celebrate={
                newReward
                  ? "reward"
                  : progress.today.complete
                    ? "dayComplete"
                    : journey.closedDays[shiftDay(today, -1)]?.complete ===
                        false
                      ? "sad"
                      : undefined
              }
              celebrationKey={`${today}:${newReward}`}
            />
          </View>
        </View>
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.page, `${theme.page}00`]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: safe.top + 180,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: safe.top + 12,
          left: 20,
          right: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <T size={23} weight="700">
              Мой путь
            </T>
            <T size={11} muted>
              {scenes[world.territory].name} · серия {progress.streak}
            </T>
          </View>
          <RoundButton
            icon="settings"
            label="Настройки"
            onPress={() => router.push("/settings")}
          />
        </View>
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 20,
            backgroundColor: theme.glass,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <T size={12} weight="600" numberOfLines={1}>
            {draftWorld ? "Обустройте свой мир" : journey.goal}
          </T>
          <T size={11} muted>
            {draftWorld
              ? "Выберите предмет и перетащите. Путь прокручивается свободным свайпом."
              : hud.taskLabel}
          </T>
          {!draftWorld && (
            <T size={10} muted>
              {hud.weekLabel}
            </T>
          )}
          <View
            style={{
              height: 4,
              backgroundColor: theme.soft,
              borderRadius: 4,
              marginTop: 8,
            }}
          >
            <View
              style={{
                height: 4,
                width: `${Math.min(100, (progress.successes / progress.goal) * 100)}%`,
                backgroundColor: theme.accent,
                borderRadius: 4,
              }}
            />
          </View>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: Math.max(safe.bottom, 12) + 88,
          left: 20,
          right: 20,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {draftWorld ? (
          <>
            {selectedPlacement && (
              <View
                style={{
                  width: "100%",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: 8,
                  backgroundColor: theme.glass,
                  borderRadius: 20,
                }}
              >
                <T size={12} weight="600" style={{ width: "100%" }}>
                  {
                    worldItems.find((i) => i.id === selectedPlacement.itemId)
                      ?.name
                  }
                </T>
                {[
                  {
                    name: "↶ 15°",
                    label: "Повернуть влево",
                    patch: {
                      rotation: Math.max(-180, selectedPlacement.rotation - 15),
                    },
                  },
                  {
                    name: "↷ 15°",
                    label: "Повернуть вправо",
                    patch: {
                      rotation: Math.min(180, selectedPlacement.rotation + 15),
                    },
                  },
                  {
                    name: "−",
                    label: "Уменьшить предмет",
                    patch: {
                      scale: Math.max(0.7, selectedPlacement.scale - 0.1),
                    },
                  },
                  {
                    name: "+",
                    label: "Увеличить предмет",
                    patch: {
                      scale: Math.min(1.3, selectedPlacement.scale + 0.1),
                    },
                  },
                ].map((b) => (
                  <Touch
                    key={b.label}
                    accessibilityRole="button"
                    accessibilityLabel={b.label}
                    onPress={() =>
                      moveItem({ ...selectedPlacement, ...b.patch })
                    }
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 16,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <T size={13}>{b.name}</T>
                  </Touch>
                ))}
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="Убрать выбранный предмет"
                  onPress={() => {
                    setDraftWorld({
                      ...draftWorld,
                      placements: world.placements.filter(
                        (p) => p.instanceId !== selectedItem,
                      ),
                    });
                    setSelectedItem(null);
                  }}
                  style={{
                    minHeight: 44,
                    padding: 12,
                    backgroundColor: theme.surface,
                    borderRadius: 16,
                  }}
                >
                  <T size={12}>Убрать</T>
                </Touch>
              </View>
            )}
            <Touch
              accessibilityRole="button"
              onPress={() => setTools(true)}
              style={{
                padding: 14,
                borderRadius: 22,
                backgroundColor: theme.glass,
              }}
            >
              <T size={13} weight="600">
                Мастерская
              </T>
            </Touch>
            <Touch
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  "Отменить изменения?",
                  "Мир останется таким, каким был до обустройства.",
                  [
                    { text: "Продолжить", style: "cancel" },
                    {
                      text: "Отменить изменения",
                      style: "destructive",
                      onPress: stopEditing,
                    },
                  ],
                )
              }
              style={{
                padding: 14,
                borderRadius: 22,
                backgroundColor: theme.glass,
              }}
            >
              <T size={13}>Отмена</T>
            </Touch>
            <Touch
              accessibilityRole="button"
              disabled={saving}
              onPress={async () => {
                if (await act({ type: "world", world: draftWorld })) {
                  if (draftMascot)
                    dispatch({
                      type: "preferences",
                      patch: { mascot: draftMascot },
                    });
                  stopEditing();
                }
              }}
              style={{
                padding: 14,
                borderRadius: 22,
                backgroundColor: theme.accent,
              }}
            >
              <T size={13} weight="600" style={{ color: theme.onAccent }}>
                {saving ? "Сохраняю…" : "Готово"}
              </T>
            </Touch>
          </>
        ) : (
          <>
            <View style={{ width: "100%", gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="Обустроить мой мир"
                  onPress={() => {
                    setDraftWorld(cloneWorld(journey.world));
                    setTools(true);
                  }}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 13,
                    justifyContent: "center",
                    borderRadius: 16,
                    backgroundColor: theme.glass,
                  }}
                >
                  <T size={12} weight="600">
                    Мой мир
                  </T>
                </Touch>
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel="Вернуться к сегодняшнему дню"
                  onPress={() => goToday()}
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 13,
                    justifyContent: "center",
                    borderRadius: 16,
                    backgroundColor: theme.glass,
                  }}
                >
                  <T size={12} weight="600">
                    К сегодня
                  </T>
                </Touch>
              </View>
              <Button
                title={
                  nextTask?.kind === "report"
                    ? "Заполнить самоотчёт"
                    : nextTask?.kind === "questionnaire"
                      ? "Пройти опрос"
                      : nextTask
                        ? "Отметить приём"
                        : "На сегодня всё выполнено"
                }
                onPress={openNextTask}
              />
            </View>
          </>
        )}
      </View>
      <WorldEditor
        visible={tools}
        journey={journey}
        world={world}
        onChange={setDraftWorld}
        mascot={draftMascot ?? state.mascot}
        onMascotChange={setDraftMascot}
        onSelect={(id) => {
          setSelectedItem(id);
        }}
        onClose={() => {
          setTools(false);
        }}
      />
      <Modal
        visible={!!selectedDay}
        transparent
        animationType={reducedMotion ? "none" : "slide"}
        onRequestClose={() => setSelected(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(4,18,16,0.4)",
          }}
        >
          <View
            style={{
              padding: 24,
              paddingBottom: Math.max(24, safe.bottom),
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              backgroundColor: theme.page,
              maxHeight: "80%",
            }}
          >
            <ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <T size={24} weight="600">
                  {selected && dateLabel(selected)}
                </T>
                <RoundButton
                  icon="close"
                  label="Закрыть день"
                  onPress={() => setSelected(null)}
                />
              </View>
              <T size={16} weight="600" style={{ marginVertical: 16 }}>
                {selectedDay && statusLabels[selectedDay.status]}
              </T>
              {selectedDay?.status === "missed" && (
                <T size={13} muted>
                  Прогресс мира сохранён. Сегодня можно продолжить путь.
                </T>
              )}
              {tasks.map((task) => (
                <T key={task.id} size={14} style={{ marginTop: 12 }}>
                  {task.completed ? "✓ " : "○ "}
                  {task.title}
                </T>
              ))}
              <View style={{ marginTop: 24, gap: 12 }}>
                {selectedDay?.status === "today" && (
                  <Button
                    title="Открыть план"
                    onPress={() => {
                      setSelected(null);
                      router.push("/(tabs)/plan");
                    }}
                  />
                )}
                {selectedDay && selectedDay.day < today && (
                  <Button
                    title="История этого дня"
                    secondary
                    onPress={() => {
                      setSelected(null);
                      router.push({
                        pathname: "/(tabs)/history",
                        params: { day: selectedDay.day },
                      });
                    }}
                  />
                )}
                <Button
                  title="Вернуться на путь"
                  secondary
                  onPress={() => setSelected(null)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
