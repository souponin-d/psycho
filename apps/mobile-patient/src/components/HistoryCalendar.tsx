import { View, useWindowDimensions } from "react-native";
import { useApp } from "../state/AppProvider";
import { Touch } from "./Motion";
import { T, RoundButton } from "./UI";
export function HistoryCalendar({
  month,
  onMonth,
  selected,
  first,
  today,
  recorded,
  onSelect,
}: {
  month: string;
  onMonth: (month: string) => void;
  selected: string;
  first: string;
  today: string;
  recorded: Set<string>;
  onSelect: (day: string) => void;
}) {
  const { theme } = useApp();
  const compact = useWindowDimensions().width < 360;
  const date = new Date(month + "-01T12:00:00");
  const offset = (date.getDay() + 6) % 7;
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const move = (delta: number) => {
    const next = new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
    const value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (value >= first.slice(0, 7) && value <= today.slice(0, 7))
      onMonth(value);
  };
  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <RoundButton
          icon="back"
          label="Предыдущий месяц"
          disabled={month <= first.slice(0, 7)}
          onPress={() => move(-1)}
        />
        <T size={18} weight="600" style={{ flex: 1, textAlign: "center" }}>
          {date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
        </T>
        <RoundButton
          icon="arrow"
          label="Следующий месяц"
          disabled={month >= today.slice(0, 7)}
          onPress={() => move(1)}
        />
      </View>
      {compact ? (
        <View style={{ gap: 4 }}>
          {Array.from({ length: count }, (_, i) => {
            const day = `${month}-${String(i + 1).padStart(2, "0")}`;
            if (day < first || day > today) return null;
            return (
              <Touch
                key={day}
                accessibilityRole="button"
                accessibilityLabel={`История за ${day}`}
                accessibilityState={{ selected: selected === day }}
                onPress={() => onSelect(day)}
                style={{
                  minHeight: 48,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor:
                    selected === day ? theme.soft : theme.surface,
                }}
              >
                <T size={14}>
                  {new Date(day + "T12:00").toLocaleDateString("ru-RU", {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                  })}
                  {recorded.has(day) ? " · есть записи" : " · нет записей"}
                </T>
              </Touch>
            );
          })}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
            <View
              key={day}
              style={{
                width: "14.2857%",
                alignItems: "center",
                paddingVertical: 8,
              }}
            >
              <T size={11} muted>
                {day}
              </T>
            </View>
          ))}
          {Array.from({ length: offset + count }, (_, i) => {
            const number = i - offset + 1;
            if (number < 1)
              return <View key={i} style={{ width: "14.2857%" }} />;
            const day = `${month}-${String(number).padStart(2, "0")}`,
              disabled = day < first || day > today;
            return (
              <View key={i} style={{ width: "14.2857%", padding: 1 }}>
                <Touch
                  accessibilityRole="button"
                  accessibilityLabel={`История за ${day}`}
                  accessibilityState={{ selected: selected === day, disabled }}
                  disabled={disabled}
                  onPress={() => onSelect(day)}
                  style={{
                    minHeight: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 18,
                    backgroundColor:
                      selected === day ? theme.accent : "transparent",
                    opacity: disabled ? 0.25 : 1,
                    gap: 3,
                  }}
                >
                  <T
                    size={15}
                    style={{
                      color: selected === day ? theme.onAccent : theme.text,
                    }}
                  >
                    {number}
                  </T>
                  <View
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: recorded.has(day)
                        ? selected === day
                          ? theme.onAccent
                          : theme.accent
                        : "transparent",
                    }}
                  />
                </Touch>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
