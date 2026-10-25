import { useMemo } from "react";
import { View, PanResponder } from "react-native";
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Line,
} from "react-native-svg";
import { T } from "./UI";
import {
  feelingAt,
  feelingHint,
  pointFromPosition,
  type FeelingPoint,
} from "../core/feelings";
import { useFeedback } from "../hooks/useFeedback";
import { useApp } from "../state/AppProvider";
export function FeelingGrid({
  size,
  point,
  onChange,
}: {
  size: number;
  point: FeelingPoint | null;
  onChange: (point: FeelingPoint) => void;
}) {
  const { theme } = useApp();
  const { step, reset } = useFeedback();
  const padding = 36 + (size - 72) / 14,
    span = size - padding * 2;
  const feeling = feelingAt(point ?? { valence: 3, energy: 3 });
  const ink = theme.dark ? "#FFF8E7" : theme.text,
    muted = theme.dark ? "#BEB7BC" : theme.muted;
  const pan = useMemo(() => {
    function change(x: number, y: number) {
      const next = pointFromPosition(x, y, size, padding);
      step(`${next.valence}:${next.energy}`);
      onChange(next);
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        reset();
        change(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e) =>
        change(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderTerminationRequest: () => false,
    });
  }, [size, padding, onChange, step, reset]);
  const px = padding + ((point?.valence ?? 3) / 6) * span,
    py = padding + ((6 - (point?.energy ?? 3)) / 6) * span;
  return (
    <View
      {...pan.panHandlers}
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Карта ощущений"
      accessibilityHint="Вправо — приятнее, вверх — больше энергии. Доступны отдельные кнопки выбора."
      accessibilityValue={{
        text: point ? feeling.label + " · " + feelingHint(point) : "Не выбрано",
      }}
      accessibilityActions={[
        { name: "increment", label: "Приятнее" },
        { name: "decrement", label: "Менее приятно" },
        { name: "increaseEnergy", label: "Больше энергии" },
        { name: "decreaseEnergy", label: "Меньше энергии" },
      ]}
      onAccessibilityAction={(e) => {
        const current = point ?? { valence: 3, energy: 3 },
          name = e.nativeEvent.actionName;
        const next = {
          valence: Math.max(
            0,
            Math.min(
              6,
              current.valence +
                (name === "increment" ? 1 : name === "decrement" ? -1 : 0),
            ),
          ),
          energy: Math.max(
            0,
            Math.min(
              6,
              current.energy +
                (name === "increaseEnergy"
                  ? 1
                  : name === "decreaseEnergy"
                    ? -1
                    : 0),
            ),
          ),
        };
        step(`${next.valence}:${next.energy}`);
        onChange(next);
      }}
    >
      <View pointerEvents="none" style={{ flex: 1 }}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="panel" cx="30%" cy="0%" rx="100%" ry="100%">
              <Stop
                stopColor={feeling.hue}
                stopOpacity={theme.dark ? 0.15 : 0.3}
              />
              <Stop
                offset="1"
                stopColor={feeling.hue}
                stopOpacity={theme.dark ? 0.02 : 0.04}
              />
            </RadialGradient>
            <RadialGradient id="handleLight">
              <Stop stopColor={feeling.hue} stopOpacity={0.5} />
              <Stop offset="1" stopColor={feeling.hue} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            x={0.5}
            y={0.5}
            width={size - 1}
            height={size - 1}
            rx={32}
            fill="url(#panel)"
            stroke={ink}
            strokeOpacity={0.18}
          />
          {Array.from({ length: 49 }, (_, i) => {
            const col = i % 7,
              row = Math.floor(i / 7),
              lit =
                point && (col === point.valence || row === 6 - point.energy);
            return (
              <Circle
                key={i}
                cx={padding + (col / 6) * span}
                cy={padding + (row / 6) * span}
                r={2.3}
                fill={ink}
                opacity={lit ? 0.7 : 0.22}
              />
            );
          })}
          {point && (
            <>
              <Line
                x1={px}
                x2={px}
                y1={32}
                y2={size - 32}
                stroke={ink}
                strokeDasharray="2 5"
                opacity={0.25}
              />
              <Line
                y1={py}
                y2={py}
                x1={32}
                x2={size - 32}
                stroke={ink}
                strokeDasharray="2 5"
                opacity={0.25}
              />
              <Circle cx={px} cy={py} r={32} fill="url(#handleLight)" />
              <Circle
                cx={px}
                cy={py}
                r={12}
                fill={theme.dark ? "#FFFCEF" : theme.accent}
                stroke="#FFFCEF"
                strokeWidth={3}
              />
            </>
          )}
        </Svg>
        <T
          size={9}
          style={{
            position: "absolute",
            top: 12,
            left: 25,
            right: 25,
            textAlign: "center",
            letterSpacing: 1,
            color: muted,
          }}
        >
          МНОГО ЭНЕРГИИ
        </T>
        <T
          size={9}
          style={{
            position: "absolute",
            bottom: 12,
            left: 25,
            right: 25,
            textAlign: "center",
            letterSpacing: 1,
            color: muted,
          }}
        >
          МАЛО ЭНЕРГИИ
        </T>
        <T
          size={9}
          style={{
            position: "absolute",
            left: -25,
            top: size / 2 - 6,
            width: 90,
            textAlign: "center",
            letterSpacing: 1,
            color: muted,
            transform: [{ rotate: "-90deg" }],
          }}
        >
          НЕПРИЯТНО
        </T>
        <T
          size={9}
          style={{
            position: "absolute",
            right: -25,
            top: size / 2 - 6,
            width: 90,
            textAlign: "center",
            letterSpacing: 1,
            color: muted,
            transform: [{ rotate: "90deg" }],
          }}
        >
          ПРИЯТНО
        </T>
      </View>
    </View>
  );
}
