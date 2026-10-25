import { useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { Touch } from "./Motion";
import { WorldItemArt } from "./WorldItemArt";
import { worldItems } from "../config/worldCatalog";
import type { Placement, WorldState } from "../core/journeyModel";

function PlacedItem({
  placement: p,
  width,
  height,
  editing,
  selected,
  onSelect,
  onMove,
  onDrag,
}: {
  placement: Placement;
  width: number;
  height: number;
  editing: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (p: Placement) => void;
  onDrag: (active: boolean) => void;
}) {
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const latest = useRef({
    p,
    width,
    height,
    onMove,
    onDrag,
    selected,
    editing,
  });
  latest.current = { p, width, height, onMove, onDrag, selected, editing };
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        latest.current.editing &&
        latest.current.selected &&
        Math.hypot(g.dx, g.dy) > 5,
      onPanResponderGrant: () => latest.current.onDrag(true),
      onPanResponderMove: (_, g) => setDelta({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        const v = latest.current;
        setDelta({ x: 0, y: 0 });
        v.onDrag(false);
        v.onMove({
          ...v.p,
          x: v.p.x + g.dx / v.width,
          y: v.p.y + g.dy / v.height,
        });
      },
      onPanResponderTerminate: () => {
        setDelta({ x: 0, y: 0 });
        latest.current.onDrag(false);
      },
    }),
  ).current;
  const item = worldItems.find((i) => i.id === p.itemId);
  if (!item) return null;
  const size = item.size * p.scale;
  const hitSize = Math.max(48, size + 16);
  return (
    <View
      {...responder.panHandlers}
      style={{
        position: "absolute",
        left: p.x * width - hitSize / 2 + delta.x,
        top: p.y * height - hitSize / 2 + delta.y,
        width: hitSize,
        height: hitSize,
        transform: [{ rotate: `${p.rotation}deg` }],
        borderWidth: selected ? 2 : 0,
        borderColor: "#FFF5C8",
        borderStyle: "dashed",
        borderRadius: 20,
      }}
    >
      <Touch
        accessibilityRole="button"
        accessibilityActions={
          editing
            ? [
                { name: "left", label: "Сдвинуть влево" },
                { name: "right", label: "Сдвинуть вправо" },
                { name: "up", label: "Сдвинуть вверх" },
                { name: "down", label: "Сдвинуть вниз" },
              ]
            : undefined
        }
        onAccessibilityAction={(event) => {
          const direction = event.nativeEvent.actionName;
          if (editing)
            onMove({
              ...p,
              x:
                p.x +
                (direction === "left"
                  ? -0.03
                  : direction === "right"
                    ? 0.03
                    : 0),
              y:
                p.y +
                (direction === "up" ? -0.01 : direction === "down" ? 0.01 : 0),
            });
        }}
        accessibilityLabel={`${item.name}${editing ? (selected ? ". Выбрано, перетащите для перемещения" : ". Выбрать предмет") : ". Позвать спутника"}`}
        onPress={() => onSelect(p.instanceId)}
        style={{
          width: hitSize,
          height: hitSize,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <WorldItemArt id={p.itemId} size={size} />
      </Touch>
    </View>
  );
}
export function WorldScene({
  world,
  width,
  height,
  editing,
  selected,
  onSelect,
  onMove,
  onDrag,
}: {
  world: WorldState;
  width: number;
  height: number;
  editing: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (p: Placement) => void;
  onDrag: (active: boolean) => void;
}) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", inset: 0 }}>
      {world.flora &&
        [0.06, 0.94].flatMap((x) =>
          [0.25, 0.55, 0.8].map((y) => (
            <View
              key={`${x}-${y}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: x * width - 17,
                top: y * height - 34,
              }}
            >
              <WorldItemArt
                id={world.flora === "ferns" ? "fern" : "flowers"}
                size={34}
              />
            </View>
          )),
        )}
      {[...world.placements]
        .sort((a, b) => a.y - b.y)
        .map((p) => (
          <PlacedItem
            key={p.instanceId}
            placement={p}
            width={width}
            height={height}
            editing={editing}
            selected={selected === p.instanceId}
            onSelect={onSelect}
            onMove={onMove}
            onDrag={onDrag}
          />
        ))}
    </View>
  );
}
