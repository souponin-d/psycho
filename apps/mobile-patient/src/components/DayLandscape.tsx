import { View, Image, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle } from "react-native-svg";
import { router } from "expo-router";
import { useApp } from "../state/AppProvider";
import { tasks } from "../config/content";
import { T } from "./UI";
import { Icon } from "./Icon";
import { Mascot } from "./Mascot";
import { Enter, Touch } from "./Motion";

export function DayLandscape() {
  const { state, theme, today } = useApp();
  const { width } = useWindowDimensions();
  const completed = state.completed[today] ?? [];
  const locations = [
    { top: 48, left: 22 },
    { top: 169, left: Math.max(120, width - 235) },
    { top: 300, left: 30 },
  ];
  return (
    <View
      style={{
        height: 440,
        borderRadius: 34,
        overflow: "hidden",
        marginHorizontal: -10,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Image
        source={theme.landscape}
        style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
        resizeMode="cover"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
      />
      <LinearGradient
        colors={[
          theme.dark ? "rgba(16,39,32,0.3)" : "rgba(246,245,237,0.1)",
          "transparent",
          theme.page,
        ]}
        locations={[0, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 440"
        style={StyleSheet.absoluteFill}
      >
        <Path
          d={
            theme.dark
              ? "M70 98C320-10 353 268 175 323S-30 214 70 98"
              : "M75 78C260 70 318 122 230 200S10 240 85 342"
          }
          fill="none"
          stroke={theme.dark ? "#B9A8D3" : "#FFFFFF"}
          strokeOpacity={0.75}
          strokeWidth={1.4}
          strokeDasharray="4 7"
        />
        <Circle
          cx="73"
          cy="80"
          r="5"
          fill={theme.dark ? "#D4EEA6" : "#355E4A"}
        />
        <Circle cx="233" cy="199" r="5" fill="#C9BBE1" />
        <Circle cx="85" cy="340" r="5" fill="#D4EEA6" />
      </Svg>
      {tasks.slice(0, 3).map((task, i) => (
        <View
          key={task.id}
          style={{
            position: "absolute",
            top: locations[i]!.top,
            left: locations[i]!.left,
            maxWidth: 210,
          }}
        >
          <Enter delay={150 + i * 90}>
            <Touch
              onPress={() =>
                router.push(task.id === "checkin" ? "/check-in" : "/plan")
              }
              accessibilityRole="button"
              accessibilityLabel={`${task.id === "morning" ? state.morning : task.time}, ${task.title}`}
              style={{
                flexDirection: "row",
                gap: 10,
                alignItems: "center",
                padding: 12,
                paddingRight: 18,
                borderRadius: 24,
                backgroundColor: theme.glass,
                borderWidth: 1,
                borderColor: theme.border,
                boxShadow: "0 6px 20px rgba(16,39,32,0.06)",
              }}
            >
              <View
                style={{
                  backgroundColor: completed.includes(task.id)
                    ? theme.accent
                    : theme.tint,
                  width: 40,
                  height: 40,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={completed.includes(task.id) ? "check" : task.icon}
                  color={
                    completed.includes(task.id) ? theme.onAccent : theme.text
                  }
                  size={20}
                />
              </View>
              <View style={{ flexShrink: 1 }}>
                <T size={17} weight="600">
                  {task.id === "morning" ? state.morning : task.time}
                </T>
                <T size={11}>
                  {task.id === "morning" ? "Препарат из плана" : task.title}
                </T>
              </View>
            </Touch>
          </Enter>
        </View>
      ))}
      <View style={{ position: "absolute", top: 178, left: 10 }}>
        <Mascot size={118} />
      </View>
      <View style={{ position: "absolute", bottom: 16, right: 20 }}>
        <T
          size={11}
          style={{
            backgroundColor: theme.glass,
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}
        >
          Ваш день. Ваш ритм.
        </T>
      </View>
    </View>
  );
}
