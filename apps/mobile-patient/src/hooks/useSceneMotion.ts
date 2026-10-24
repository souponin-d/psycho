import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../state/AppProvider";
export function useSceneMotion() {
  const focused = useIsFocused();
  const { reducedMotion, isActive } = useApp();
  return !reducedMotion && focused && isActive;
}
export function useFloat(active: boolean, duration = 2600) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, value]);
  return value;
}
export function useSceneClock(active: boolean) {
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0,
      previous = 0;
    const start = Date.now();
    const update = () => {
      const now = Date.now();
      if (now - previous >= 33) {
        setClock((now - start) / 1000);
        previous = now;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return active ? clock : 0;
}
