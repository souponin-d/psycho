import { Animated, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { feelingAt, type FeelingPoint } from "../core/feelings";
import { useFloat, useSceneMotion } from "../hooks/useSceneMotion";
import { useApp } from "../state/AppProvider";
export function FeelingBackdrop({ point }: { point: FeelingPoint }) {
  const { theme } = useApp();
  const float = useFloat(useSceneMotion(), 3400);
  const feeling = feelingAt(point);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.dark
              ? "#090E13"
              : theme.id === "lavender"
                ? "#F3ECF5"
                : "#FAF3E6",
          },
        ]}
      />
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 850"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient id="wash" cx="45%" cy="28%" rx="85%" ry="55%">
            <Stop
              stopColor={feeling.glow}
              stopOpacity={theme.dark ? 0.53 : 0.22}
            />
            <Stop offset="1" stopColor={feeling.glow} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="rim" cx="100%" cy="86%" r="75%">
            <Stop stopColor="#9D79BC" stopOpacity={theme.dark ? 0.17 : 0.12} />
            <Stop offset="1" stopColor="#9D79BC" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="400" height="850" fill="url(#wash)" />
        <Rect width="400" height="850" fill="url(#rim)" />
      </Svg>
      <Animated.View
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: "8%",
          height: "44%",
          opacity: float.interpolate({
            inputRange: [0, 1],
            outputRange: [0.65, 1],
          }),
          transform: [
            {
              translateX: float.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 12],
              }),
            },
            {
              translateY: float.interpolate({
                inputRange: [0, 1],
                outputRange: [-8, 8],
              }),
            },
            {
              scale: float.interpolate({
                inputRange: [0, 1],
                outputRange: [0.93, 1.1],
              }),
            },
          ],
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="aura">
              <Stop
                stopColor={feeling.hue}
                stopOpacity={theme.dark ? 0.29 : 0.32}
              />
              <Stop
                offset=".4"
                stopColor={feeling.glow}
                stopOpacity={theme.dark ? 0.18 : 0.1}
              />
              <Stop offset="1" stopColor={feeling.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#aura)" />
        </Svg>
      </Animated.View>
    </View>
  );
}
