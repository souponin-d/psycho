import { sceneSource } from "../config/sceneAssets";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  FlatList,
  Image,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { useApp } from "../state/AppProvider";
import type { JourneyState, WorldState, Placement } from "../core/journeyModel";
import type { MascotId } from "../core/model";
import { journeyMap } from "../core/journeyMap";
import { dayNode } from "../core/dayNode";
import { daysBetween, shiftDay } from "../core/calendar";
import { calendarStones, CALENDAR_SLOTS } from "../core/pathLayout";
import { sectionBaseDay, allWorldSections } from "../core/worldSections";
import { scenes } from "../config/worldCatalog";
import { WorldScene } from "./WorldScene";
import { WorldCompanion } from "./WorldCompanion";
import { JourneyDayMarker } from "./JourneyDayMarker";
export type JourneyCanvasHandle = {
  today: () => void;
  world: () => void;
  focus: (p: Placement) => void;
};
type Props = {
  journey: JourneyState;
  today: string;
  world: WorldState;
  mascot: MascotId;
  editing: boolean;
  selected: string | null;
  onDay: (day: string) => void;
  onObject: (id: string) => void;
  onMove: (p: Placement) => void;
  onDrag: (active: boolean) => void;
  dragging: boolean;
  request: { id: string; at: number } | null;
  celebrate?: "reward" | "dayComplete" | "sad";
  celebrationKey: string;
};
export const JourneyCanvas = forwardRef<JourneyCanvasHandle, Props>(
  function JourneyCanvas(props, ref) {
    const {
      journey,
      today,
      world,
      mascot,
      editing,
      selected,
      onDay,
      onObject,
      onMove,
      onDrag,
      dragging,
      request,
      celebrate,
      celebrationKey,
    } = props;
    const { width } = useWindowDimensions(),
      { state, reducedMotion, theme } = useApp();
    const [viewport, setViewport] = useState(360),
      [visible, setVisible] = useState<number[]>([]);
    const list = useRef<FlatList<number>>(null),
      tileHeight = width * 3;
    const map = useMemo(() => journeyMap(journey, today), [journey, today]);
    const count = Math.ceil(map.days.length / CALENDAR_SLOTS);
    const rows = useMemo(
      () => Array.from({ length: count }, (_, i) => count - 1 - i),
      [count],
    );
    const sections = useMemo(
      () =>
        new Map(
          allWorldSections({ ...journey, world }).map((s) => [s.anchorDay, s]),
        ),
      [journey, world],
    );
    const activeBlock = Math.floor(
      daysBetween(journey.plan.startedAt, world.anchorDay ?? today) /
        CALENDAR_SLOTS,
    );
    const offset = (block: number, y: number) =>
      (count - 1 - block) * tileHeight + y * tileHeight - viewport * 0.52;
    const to = (block: number, y: number, animated = !reducedMotion) =>
      list.current?.scrollToOffset({
        offset: Math.max(0, offset(block, y)),
        animated,
      });
    const todayBlock = Math.floor(map.todayIndex / CALENDAR_SLOTS);
    const todayTerrain =
      sections.get(sectionBaseDay(journey.plan.startedAt, today))?.territory ??
      world.territory;
    const goToday = () =>
      to(
        todayBlock,
        calendarStones(scenes[todayTerrain])[
          map.todayIndex % CALENDAR_SLOTS
        ][1],
      );
    useImperativeHandle(ref, () => ({
      today: goToday,
      world: () => to(activeBlock, 0.58),
      focus: (p) => to(activeBlock, p.y),
    }));
    useEffect(() => {
      const frame = requestAnimationFrame(() => {
        const y = calendarStones(scenes[todayTerrain])[
          map.todayIndex % CALENDAR_SLOTS
        ][1];
        list.current?.scrollToOffset({
          offset: Math.max(0, offset(todayBlock, y)),
          animated: false,
        });
      });
      return () => cancelAnimationFrame(frame);
      // Camera resets only for a date/size change, not after every saved task.
    }, [today, width, viewport, count]);
    const onView = useRef(
      ({ viewableItems }: { viewableItems: ViewToken<number>[] }) =>
        setVisible(viewableItems.map((v) => v.item)),
    ).current;
    return (
      <View
        style={{ flex: 1, overflow: "hidden", backgroundColor: theme.page }}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
      >
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(block) => String(block)}
          getItemLayout={(_, index) => ({
            length: tileHeight,
            offset: index * tileHeight,
            index,
          })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={false}
          scrollEnabled={!dragging}
          onViewableItemsChanged={onView}
          viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
          accessibilityLabel="Мой путь: вертикальная карта дней"
          showsVerticalScrollIndicator
          renderItem={({ item: block }) => {
            const baseDay = shiftDay(
                journey.plan.startedAt,
                block * CALENDAR_SLOTS,
              ),
              section = sections.get(baseDay);
            const terrain = section?.territory ?? world.territory,
              stonePositions = calendarStones(scenes[terrain]),
              isActive = activeBlock === block;
            const placed = section
              ? { ...world, ...section, outfits: world.outfits }
              : null;
            const homeIndex = Math.max(
              0,
              Math.min(
                CALENDAR_SLOTS - 1,
                map.todayIndex - block * CALENDAR_SLOTS,
              ),
            );
            return (
              <View style={{ width, height: tileHeight }}>
                <Image
                  source={sceneSource(terrain, state.theme)}
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width,
                    height: tileHeight,
                  }}
                />
                {state.theme === "lavender" && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundColor: "rgba(151,120,179,.08)",
                    }}
                  />
                )}
                {placed && (
                  <View
                    pointerEvents={isActive ? "box-none" : "none"}
                    importantForAccessibility={
                      isActive ? "auto" : "no-hide-descendants"
                    }
                    style={{ position: "absolute", inset: 0 }}
                  >
                    <WorldScene
                      world={placed}
                      width={width}
                      height={tileHeight}
                      editing={editing && isActive}
                      selected={selected}
                      onSelect={onObject}
                      onMove={onMove}
                      onDrag={onDrag}
                    />
                  </View>
                )}
                {map.days
                  .filter(
                    (day) => Math.floor(day.index / CALENDAR_SLOTS) === block,
                  )
                  .map((day) => {
                    const [x, y] = stonePositions[day.index % CALENDAR_SLOTS],
                      node = dayNode(journey, day.day, today),
                      w = day.status === "today" ? 154 : 132;
                    return (
                      <View
                        key={day.day}
                        style={{
                          position: "absolute",
                          left: Math.max(
                            4,
                            Math.min(width - w - 4, x * width - w / 2),
                          ),
                          top: y * tileHeight - 58,
                        }}
                      >
                        <JourneyDayMarker
                          node={node}
                          chapter={Math.floor(day.index / 7) + 1}
                          onPress={() => onDay(day.day)}
                        />
                      </View>
                    );
                  })}
                <LinearGradient
                  pointerEvents="none"
                  colors={[theme.page, theme.page + "00"]}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 46,
                  }}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={[theme.page + "00", theme.page]}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 46,
                  }}
                />
                {placed && isActive && (
                  <WorldCompanion
                    key={world.anchorDay}
                    world={world}
                    width={width}
                    height={tileHeight}
                    home={{
                      x: stonePositions[homeIndex][0],
                      y: stonePositions[homeIndex][1],
                    }}
                    request={request}
                    editing={editing}
                    id={mascot}
                    visible={
                      visible.includes(block) ||
                      (!visible.length && block === todayBlock)
                    }
                    celebrate={celebrate}
                    celebrationKey={celebrationKey}
                  />
                )}
              </View>
            );
          }}
        />
      </View>
    );
  },
);
