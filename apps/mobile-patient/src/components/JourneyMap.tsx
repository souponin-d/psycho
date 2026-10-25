import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { JourneyCanvas, type JourneyCanvasHandle } from "./JourneyCanvas";
import { WorldEditor } from "./WorldEditor";
import { T, Button, RoundButton } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import { dayNode } from "../core/dayNode";
import { journeyProgress, shiftDay } from "../core/calendar";
import { journeyHud } from "../core/journeyPresentation";
import { cloneWorld, validatePlacement } from "../core/world";
import { scenes, worldItems } from "../config/worldCatalog";
import type { AssignedTask } from "../core/questionnaires";
import type { WorldState, Placement } from "../core/journeyModel";
import type { MascotId } from "../core/model";
export function JourneyMap() {
  const { state, dispatch, theme, today, reducedMotion } = useApp(),
    { journey, act, saving } = useJourney();
  const safe = useSafeAreaInsets(),
    { width, fontScale } = useWindowDimensions(),
    compact = width < 360 || fontScale > 1.2;
  const params = useLocalSearchParams<{
    editWorld?: string;
    showWorld?: string;
  }>();
  const canvas = useRef<JourneyCanvasHandle>(null);
  const [draftWorld, setDraftWorld] = useState<WorldState | null>(null),
    [draftMascot, setDraftMascot] = useState<MascotId | null>(null);
  const [tools, setTools] = useState(false),
    [selectedItem, setSelectedItem] = useState<string | null>(null),
    [dragging, setDragging] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null),
    [interaction, setInteraction] = useState<{ id: string; at: number } | null>(
      null,
    );
  const [newReward, setNewReward] = useState(""),
    rewardCount = useRef<number | null>(null);
  useEffect(() => {
    if (!journey) return;
    if (
      rewardCount.current !== null &&
      journey.rewards.length > rewardCount.current
    )
      setNewReward(journey.rewards.at(-1)?.id ?? "");
    rewardCount.current = journey.rewards.length;
  }, [journey]);
  useEffect(() => {
    if (params.editWorld && journey) {
      setDraftWorld(cloneWorld(journey.world));
      setTools(true);
      router.setParams({ editWorld: undefined });
      requestAnimationFrame(() => canvas.current?.world());
    }
  }, [params.editWorld, journey]);
  useEffect(() => {
    if (params.showWorld) {
      requestAnimationFrame(() => canvas.current?.world());
      router.setParams({ showWorld: undefined });
    }
  }, [params.showWorld]);
  const selectedPlacement = draftWorld?.placements.find(
    (p) => p.instanceId === selectedItem,
  );
  const selectedId = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectedPlacement &&
      selectedId.current !== selectedPlacement.instanceId
    ) {
      selectedId.current = selectedPlacement.instanceId;
      canvas.current?.focus(selectedPlacement);
    }
    if (!selectedPlacement) selectedId.current = null;
  }, [selectedPlacement]);
  if (!journey) return null;
  const world = draftWorld ?? journey.world,
    progress = journeyProgress(journey, today),
    todayNode = dayNode(journey, today, today),
    selected = selectedDay ? dayNode(journey, selectedDay, today) : null;
  const hud = journeyHud(
    todayNode.done,
    todayNode.total,
    progress.successes,
    progress.chapterStart,
  );
  const closeEditor = () => {
    setDraftWorld(null);
    setDraftMascot(null);
    setSelectedItem(null);
    setDragging(false);
    setTools(false);
  };
  const openTask = (task: AssignedTask | null) => {
    setSelectedDay(null);
    if (task?.kind === "report") router.push("/check-in");
    else if (task?.kind === "questionnaire")
      router.push({ pathname: "/questionnaire", params: { id: task.id } });
    else router.push("/(tabs)/plan");
  };
  const chooseObject = (id: string) => {
    if (draftWorld) {
      setSelectedItem(id);
      return;
    }
    const p = world.placements.find((p) => p.instanceId === id);
    if (p) {
      canvas.current?.focus(p);
      setInteraction({ id, at: Date.now() });
    }
  };
  const moveItem = (p: Placement) => {
    if (!draftWorld) return;
    const item = worldItems.find((i) => i.id === p.itemId);
    if (!item) return;
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
  const nextTitle =
    todayNode.nextTask?.kind === "report"
      ? "Заполнить самоотчёт"
      : todayNode.nextTask?.kind === "questionnaire"
        ? "Пройти опрос"
        : todayNode.nextTask
          ? "Отметить приём"
          : "Посмотреть итог дня";
  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <View
        style={{
          paddingTop: safe.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 10,
          gap: 6,
          backgroundColor: theme.page,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <T size={compact ? 21 : 24} weight="700">
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
        <Touch
          accessibilityRole="button"
          accessibilityLabel={"Личная цель. " + journey.goal + ". Настроить"}
          onPress={() => router.push("/settings")}
          haptic={false}
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Icon name="leaf" size={14} color={theme.accent} />
          <T size={12} numberOfLines={1} style={{ flex: 1 }}>
            {journey.goal}
          </T>
          <Icon name="edit" size={13} color={theme.muted} />
        </Touch>
        <View
          style={{
            flexDirection: compact ? "column" : "row",
            justifyContent: "space-between",
            gap: 4,
            alignItems: compact ? "flex-start" : "center",
          }}
        >
          <T size={11} weight="600">
            {hud.taskLabel}
          </T>
          <T size={10} muted>
            {hud.weekLabel}
          </T>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Выполненные дни главы"
          accessibilityValue={{ min: 0, max: 5, now: progress.successes }}
          style={{
            height: 4,
            borderRadius: 4,
            backgroundColor: theme.soft,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 4,
              width: (String(Math.min(100, (progress.successes / 5) * 100)) +
                "%") as `${number}%`,
              backgroundColor: theme.accent,
            }}
          />
        </View>
      </View>
      <JourneyCanvas
        ref={canvas}
        journey={journey}
        today={today}
        world={world}
        mascot={draftMascot ?? state.mascot}
        editing={!!draftWorld}
        selected={selectedItem}
        onDay={(day) => {
          if (!draftWorld) setSelectedDay(day);
        }}
        onObject={chooseObject}
        onMove={moveItem}
        onDrag={setDragging}
        dragging={dragging}
        request={interaction}
        celebrate={
          newReward
            ? "reward"
            : progress.today.complete
              ? "dayComplete"
              : journey.closedDays[shiftDay(today, -1)]?.complete === false
                ? "sad"
                : undefined
        }
        celebrationKey={today + ":" + newReward}
      />
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 10,
          paddingBottom: Math.max(safe.bottom, 12) + 82,
          gap: 8,
          backgroundColor: theme.page,
        }}
      >
        {draftWorld ? (
          <>
            {selectedPlacement && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 5,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <T size={11} style={{ width: "100%" }}>
                  {
                    worldItems.find((i) => i.id === selectedPlacement.itemId)
                      ?.name
                  }
                </T>
                {[
                  {
                    label: "Повернуть влево",
                    text: "−15°",
                    patch: {
                      rotation: Math.max(-180, selectedPlacement.rotation - 15),
                    },
                  },
                  {
                    label: "Повернуть вправо",
                    text: "+15°",
                    patch: {
                      rotation: Math.min(180, selectedPlacement.rotation + 15),
                    },
                  },
                  {
                    label: "Уменьшить предмет",
                    text: "−",
                    patch: {
                      scale: Math.max(0.7, selectedPlacement.scale - 0.1),
                    },
                  },
                  {
                    label: "Увеличить предмет",
                    text: "+",
                    patch: {
                      scale: Math.min(1.3, selectedPlacement.scale + 0.1),
                    },
                  },
                ].map((c) => (
                  <Touch
                    key={c.label}
                    accessibilityRole="button"
                    accessibilityLabel={c.label}
                    onPress={() =>
                      moveItem({ ...selectedPlacement, ...c.patch })
                    }
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.soft,
                    }}
                  >
                    <T size={13}>{c.text}</T>
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
                    justifyContent: "center",
                    backgroundColor: theme.soft,
                    borderRadius: 14,
                  }}
                >
                  <T size={12}>Убрать</T>
                </Touch>
              </View>
            )}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Touch
                accessibilityRole="button"
                onPress={() => setTools(true)}
                style={{
                  minHeight: 44,
                  padding: 12,
                  backgroundColor: theme.soft,
                  borderRadius: 14,
                }}
              >
                <T size={13}>Мастерская</T>
              </Touch>
              <Touch
                accessibilityRole="button"
                onPress={closeEditor}
                style={{ minHeight: 44, padding: 12, justifyContent: "center" }}
              >
                <T size={13}>Отмена</T>
              </Touch>
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Готово"
                disabled={saving}
                onPress={async () => {
                  if (await act({ type: "world", world: draftWorld })) {
                    if (draftMascot)
                      dispatch({
                        type: "preferences",
                        patch: { mascot: draftMascot },
                      });
                    closeEditor();
                  }
                }}
                style={{
                  minHeight: 44,
                  padding: 12,
                  backgroundColor: theme.accent,
                  borderRadius: 14,
                }}
              >
                <T size={13} weight="600" style={{ color: theme.onAccent }}>
                  {saving ? "Сохраняю…" : "Готово"}
                </T>
              </Touch>
            </View>
          </>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Мой мир и достижения"
                onPress={() => router.push("/world")}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                }}
              >
                <T size={12} weight="600">
                  Мой мир
                </T>
              </Touch>
              <Touch
                accessibilityRole="button"
                accessibilityLabel="Вернуться к сегодняшнему дню"
                onPress={() => canvas.current?.today()}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                  borderRadius: 14,
                  backgroundColor: theme.soft,
                }}
              >
                <T size={12} weight="600">
                  К сегодня
                </T>
              </Touch>
            </View>
            <Button
              title={nextTitle}
              onPress={() =>
                todayNode.nextTask
                  ? openTask(todayNode.nextTask)
                  : setSelectedDay(today)
              }
            />
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
        onSelect={setSelectedItem}
        onClose={() => setTools(false)}
      />
      <Modal
        visible={!!selected}
        transparent
        animationType={reducedMotion ? "none" : "slide"}
        onRequestClose={() => setSelectedDay(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(8,24,20,.5)",
          }}
        >
          <View
            style={{
              maxHeight: "85%",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: theme.page,
              padding: 24,
              paddingBottom: Math.max(24, safe.bottom),
            }}
          >
            <ScrollView>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <T size={23} weight="700">
                  {selectedDay &&
                    new Date(selectedDay + "T12:00:00").toLocaleDateString(
                      "ru-RU",
                      { day: "numeric", month: "long" },
                    )}
                </T>
                <RoundButton
                  icon="close"
                  label="Закрыть день"
                  onPress={() => setSelectedDay(null)}
                />
              </View>
              <T size={14} style={{ marginVertical: 12 }}>
                {selected?.status === "future"
                  ? "План на этот день"
                  : selected?.status === "today"
                    ? selected.awarded
                      ? "Все дела на сегодня выполнены"
                      : "Сегодня растёт ваш маленький сад"
                    : selected?.awarded
                      ? "День выполнен · сад сохранён"
                      : "Пропуск · можно продолжить сегодня"}
              </T>
              {selected?.status === "today" && selected.awarded && (
                <T size={12} muted>
                  Предварительный итог до 00:00. Исправление сегодняшних отметок
                  может изменить выполнение; открытые украшения сохранятся.
                </T>
              )}
              {selected?.status === "missed" && (
                <T size={12} muted>
                  Исправления доступны в истории. Закрытый итог дня и прошлую
                  серию они не меняют.
                </T>
              )}
              {selected?.tasks.map((task) => (
                <Touch
                  key={task.id}
                  accessibilityRole="button"
                  disabled={selected.status !== "today"}
                  accessibilityLabel={
                    task.title +
                    ". " +
                    (task.completed ? "Выполнено" : "Без отметки")
                  }
                  onPress={() => openTask(task)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 15,
                    borderBottomWidth: 1,
                    borderColor: theme.border,
                    minHeight: 58,
                  }}
                >
                  <Icon
                    name={
                      task.completed
                        ? "check"
                        : task.kind === "dose"
                          ? "pill"
                          : task.kind === "report"
                            ? "heart"
                            : "leaf"
                    }
                    size={22}
                    color={task.completed ? theme.accent : theme.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="600">
                      {task.title}
                      {task.time ? " · " + task.time : ""}
                    </T>
                    <T size={11} muted>
                      {task.completed
                        ? "Выполнено"
                        : selected.status === "future"
                          ? "Запланировано"
                          : "Без отметки"}
                    </T>
                  </View>
                  {selected.status === "today" && (
                    <Icon name="arrow" size={17} color={theme.text} />
                  )}
                </Touch>
              ))}
              <View style={{ marginTop: 20, gap: 10 }}>
                {selectedDay && selectedDay < today && (
                  <Button
                    title="История этого дня"
                    onPress={() => {
                      setSelectedDay(null);
                      router.push({
                        pathname: "/(tabs)/history",
                        params: { day: selectedDay },
                      });
                    }}
                  />
                )}
                {selected?.status === "future" && (
                  <T size={12} muted>
                    Задания откроются в назначенную дату. Расписание определяет
                    учебный врач.
                  </T>
                )}
                <Button
                  title="Вернуться на путь"
                  secondary
                  onPress={() => setSelectedDay(null)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
