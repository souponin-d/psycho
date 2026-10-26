import { useState } from "react";
import { View, ScrollView } from "react-native";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";
import { useApp } from "../state/AppProvider";
import { Touch } from "./Motion";
import { T, Panel } from "./UI";
import type { PatientHistoryProjection } from "../core/history";
import { sleepLabel } from "../core/patientPresentation";

function LineChart({
  days,
  field,
  label,
  color,
}: {
  days: PatientHistoryProjection["days"];
  field: "valence" | "energy";
  label: string;
  color: string;
}) {
  const { theme } = useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = days.find((d) => d.day === selected);
  const width = 320,
    height = 112;
  const x = (index: number) =>
    24 + (index * 280) / Math.max(1, days.length - 1);
  const y = (value: number) => 88 - (value / 6) * 72;
  const segments: string[][] = [[]];
  days.forEach((day, index) => {
    if (day[field] === null) {
      if (segments.at(-1)!.length) segments.push([]);
    } else segments.at(-1)!.push(`${x(index)},${y(day[field]!)}`);
  });
  return (
    <View
      accessibilityLabel={
        label + ". Шкала от 0 до 6. Отсутствующие записи показаны пробелами."
      }
    >
      <T size={13} weight="600">
        {label}
      </T>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessible={false}
      >
        {[0, 3, 6].map((value) => (
          <Line
            key={"line-" + value}
            x1={24}
            y1={y(value)}
            x2={304}
            y2={y(value)}
            stroke={theme.border}
            strokeWidth={1}
            strokeDasharray="3 5"
          />
        ))}
        {[0, 6].map((value) => (
          <SvgText
            key={"text-" + value}
            x={4}
            y={y(value) + 4}
            fill={theme.muted}
            fontSize={10}
          >
            {value}
          </SvgText>
        ))}
        {segments
          .filter((s) => s.length > 1)
          .map((segment, i) => (
            <Polyline
              key={i}
              points={segment.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          ))}
        {days.map((day, i) =>
          day[field] !== null ? (
            <Circle
              key={day.day}
              cx={x(i)}
              cy={y(day[field]!)}
              onPress={() => setSelected(day.day)}
              r={selected === day.day ? 6 : 3.5}
              fill={color}
            />
          ) : null,
        )}
        <SvgText x={24} y={108} fill={theme.muted} fontSize={9}>
          {days[0]?.day.slice(5).split("-").reverse().join(".")}
        </SvgText>
        <SvgText
          x={304}
          y={108}
          fill={theme.muted}
          fontSize={9}
          textAnchor="end"
        >
          {days.at(-1)?.day.slice(5).split("-").reverse().join(".")}
        </SvgText>
      </Svg>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {days.map((day) => (
          <Touch
            key={day.day}
            accessibilityRole="button"
            accessibilityLabel={`${day.day}: ${day[field] === null ? "нет записи" : day[field] + " из 6"}`}
            accessibilityState={{ selected: day.day === selected }}
            onPress={() => setSelected(day.day)}
            style={{
              minWidth: 44,
              minHeight: 44,
              padding: 10,
              justifyContent: "center",
              borderRadius: 14,
              backgroundColor:
                day.day === selected ? theme.soft : theme.surface,
            }}
          >
            <T size={12}>
              {day.day.slice(8)}: {day[field] ?? "—"}
            </T>
          </Touch>
        ))}
      </ScrollView>
      {chosen && (
        <T size={13}>
          {chosen.day.split("-").reverse().join(".")} · {label}:{" "}
          {chosen[field] === null ? "нет записи" : `${chosen[field]} из 6`}
        </T>
      )}
    </View>
  );
}
export function HistoryCharts({ data }: { data: PatientHistoryProjection }) {
  const { theme } = useApp();
  const { summary } = data;
  const [sleepDay, setSleepDay] = useState<string | null>(null);
  const selectedSleep = data.days.find((d) => d.day === sleepDay);
  const categories = [
    ["Принято", summary.taken, theme.accent],
    ["Пропущено", summary.missed, theme.dark ? "#D6B99A" : "#9B7352"],
    ["Нет отметки", summary.unknown, theme.muted],
  ] as const;
  return (
    <Panel style={{ gap: 16 }}>
      <T size={18} weight="600">
        Ритм за период
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <View>
          <T size={26} weight="600">
            {summary.reportDays}
          </T>
          <T muted size={11}>
            дней с записями
          </T>
        </View>
        <View>
          <T size={26} weight="600">
            {summary.taken} / {summary.assigned}
          </T>
          <T muted size={11}>
            доз отмечено принятыми
          </T>
        </View>
        <View>
          <T size={26} weight="600">
            {summary.difficultyDays}
          </T>
          <T muted size={11}>
            дней с трудностями
          </T>
        </View>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: 5,
          backgroundColor: theme.soft,
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {categories.map(
          ([label, count, color]) =>
            count > 0 && (
              <View
                key={label}
                style={{
                  width: `${(count / Math.max(1, summary.assigned)) * 100}%`,
                  backgroundColor: color,
                }}
              />
            ),
        )}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {categories.map(([label, count, color]) => (
          <T key={label} size={11} style={{ color }}>
            {label}: {count}
          </T>
        ))}
      </View>
      <LineChart
        days={data.days}
        field="valence"
        label="Насколько приятно вы себя чувствовали"
        color={theme.accent}
      />
      <LineChart
        days={data.days}
        field="energy"
        label="Сколько было энергии"
        color={theme.dark ? "#D7BAF0" : "#84639D"}
      />
      <T size={12} weight="600">
        Сон
      </T>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ gap: 4 }}
      >
        {data.days.map((day) => (
          <Touch
            key={day.day}
            accessibilityRole="button"
            accessibilityLabel={`${day.day}: сон ${sleepLabel(day.sleep)}`}
            accessibilityState={{ selected: day.day === sleepDay }}
            onPress={() => setSleepDay(day.day)}
            style={{
              minWidth: 44,
              minHeight: 62,
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderRadius: 12,
              backgroundColor:
                day.day === sleepDay ? theme.soft : "transparent",
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor:
                  day.sleep === "Хорошо"
                    ? theme.accent
                    : day.sleep === "Обычно"
                      ? "#B9B28D"
                      : day.sleep === "Плохо"
                        ? "#B5A2C7"
                        : theme.soft,
              }}
            >
              <T
                size={11}
                weight="600"
                style={{
                  color: day.sleep === "Хорошо" ? theme.onAccent : theme.text,
                }}
              >
                {day.sleep === "Хорошо"
                  ? "Х"
                  : day.sleep === "Обычно"
                    ? "О"
                    : day.sleep === "Плохо"
                      ? "П"
                      : "—"}
              </T>
            </View>
            <T size={11} muted>
              {day.day.slice(-2)}
            </T>
          </Touch>
        ))}
      </ScrollView>
      <T size={12} accessibilityLiveRegion="polite">
        {selectedSleep
          ? selectedSleep.day.split("-").reverse().join(".") +
            " · Сон: " +
            sleepLabel(selectedSleep.sleep)
          : "Выберите дату на графике сна."}
      </T>
      <T size={10} muted>
        Х — хорошо · О — обычно · П — плохо · — нет записи. Графики отражают
        записи, без оценки лечения.
      </T>
    </Panel>
  );
}
