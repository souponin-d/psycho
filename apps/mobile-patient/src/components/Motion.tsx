import { useEffect, useRef, type PropsWithChildren } from "react";
import {
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useApp } from "../state/AppProvider";
export function Enter({
  children,
  delay = 0,
  style,
}: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const { reducedMotion } = useApp();
  const value = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    const anim = Animated.timing(value, {
      toValue: 1,
      duration: reducedMotion ? 0 : 500,
      delay: reducedMotion ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [value, delay, reducedMotion]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: value,
          transform: [
            {
              translateY: value.interpolate({
                inputRange: [0, 1],
                outputRange: [18, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
export function Touch({
  children,
  style,
  onPress,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;
  const { reducedMotion } = useApp();
  const animate = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: reducedMotion ? 0 : 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        {...props}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        onPress={(e) => {
          void Haptics.selectionAsync().catch(() => {});
          onPress?.(e);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
