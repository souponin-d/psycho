import { useEffect, useRef } from "react";
import { Animated, Easing, Image, Pressable, View } from "react-native";
import { mascotOptions } from "../config/content";
import type { MascotId } from "../core/model";
import { useApp } from "../state/AppProvider";
import { useSceneMotion } from "../hooks/useSceneMotion";
export function Mascot({
  size = 160,
  id,
  quiet = false,
}: {
  size?: number;
  id?: MascotId;
  quiet?: boolean;
}) {
  const { state, reducedMotion } = useApp();
  const motionActive = useSceneMotion();
  const float = useRef(new Animated.Value(0)).current;
  const delight = useRef(new Animated.Value(0)).current;
  const mascot = mascotOptions.find((m) => m.id === (id ?? state.mascot))!;
  useEffect(() => {
    if (!motionActive || quiet) {
      float.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, motionActive, quiet]);
  function react() {
    if (reducedMotion) return;
    Animated.sequence([
      Animated.timing(delight, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(delight, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mascot.name}: коснуться спутника`}
      onPress={react}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: "absolute",
          width: size * 0.6,
          height: 12,
          bottom: 3,
          left: size * 0.2,
          borderRadius: 100,
          backgroundColor: "rgba(16,39,32,0.08)",
        }}
      />
      <Animated.View
        style={{
          transform: [
            {
              translateY: float.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -7],
              }),
            },
            {
              scale: Animated.add(
                float.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.025],
                }),
                delight.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.06],
                }),
              ),
            },
            {
              rotate: delight.interpolate({
                inputRange: [0, 1],
                outputRange: ["0deg", "-6deg"],
              }),
            },
          ],
        }}
      >
        <Image
          source={mascot.image}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </Animated.View>
    </Pressable>
  );
}
