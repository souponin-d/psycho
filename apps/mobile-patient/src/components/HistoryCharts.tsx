import { View } from "react-native";
import Svg, { Line, Circle, Polyline, Text as SvgText } from "react-native-svg";
import { useApp } from "../state/AppProvider";
import { T, Panel } from "./UI";
import type { PatientHistoryProjection } from "../core/history";

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
              r={3.5}
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
    </View>
  );
}
export function HistoryCharts({ data }: { data: PatientHistoryProjection }) {
  const { theme } = useApp();
  const { summary } = data;
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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {data.days.map((day) => (
          <View
            key={day.day}
            accessibilityLabel={`${day.day}: сон ${day.sleep ?? "нет записи"}`}
            style={{ width: 26, alignItems: "center", gap: 3 }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor:
                  day.sleep === "Хорошо"
                    ? theme.accent
                    : day.sleep === "Обычно"
                      ? "#B9B28D"
                      : day.sleep === "Плохо"
                        ? "#B5A2C7"
                        : theme.soft,
                borderWidth: day.sleep ? 0 : 1,
                borderColor: theme.border,
              }}
            />
            <T size={9} muted>
              {day.day.slice(-2)}
            </T>
          </View>
        ))}
      </View>
      <T size={10} muted>
        Зелёный — хорошо · песочный — обычно · лиловый — плохо · пустой — нет
        записи. Графики отражают записи, без оценки лечения.
      </T>
    </Panel>
  );
}
