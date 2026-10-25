import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import {
  companionTimeline,
  type CompanionFrame,
} from "../core/companionTimeline";
import type { CompanionMode } from "../core/companion";
const idle: CompanionFrame = { group: "idle", index: 0 };
const same = (a: CompanionFrame, b: CompanionFrame) =>
  a.group === b.group && a.index === b.index;
/** Два постоянных слоя: смена позы затухает на UI thread, без вращения всей картинки. */
export function CompanionSprite({
  mode,
  active,
  size,
  resetKey,
  renderFrame,
}: {
  mode: CompanionMode;
  active: boolean;
  size: number;
  resetKey: string;
  renderFrame: (frame: CompanionFrame) => ReactNode;
}) {
  const [slots, setSlots] = useState<CompanionFrame[]>([idle, idle]);
  const sources = useRef<CompanionFrame[]>([idle, idle]);
  const front = useRef(0);
  const alpha = useRef([new Animated.Value(1), new Animated.Value(0)]).current;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let animation: Animated.CompositeAnimation | undefined;
    const timeline = companionTimeline(mode);
    const later = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (alive) fn();
      }, ms);
    };
    const show = (index: number) => {
      if (!alive) return;
      if (index >= timeline.steps.length) {
        if (timeline.loop) show(0);
        return;
      }
      const step = timeline.steps[index],
        old = front.current,
        next = 1 - old;
      const advance = () =>
        later(() => show(index + 1), step.holdMs - step.blendMs);
      if (same(sources.current[old], step)) {
        later(() => show(index + 1), step.holdMs);
        return;
      }
      sources.current[next] = { group: step.group, index: step.index };
      setSlots([...sources.current]);
      alpha[next].setValue(0);
      raf = requestAnimationFrame(() => {
        if (!alive) return;
        animation = Animated.parallel([
          Animated.timing(alpha[old], {
            toValue: 0,
            duration: step.blendMs,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
          Animated.timing(alpha[next], {
            toValue: 1,
            duration: step.blendMs,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]);
        animation.start(({ finished }) => {
          if (alive && finished) {
            front.current = next;
            advance();
          }
        });
      });
    };
    if (!active) {
      sources.current = [idle, idle];
      front.current = 0;
      setSlots([idle, idle]);
      alpha[0].setValue(1);
      alpha[1].setValue(0);
    } else {
      alpha[front.current].setValue(1);
      alpha[1 - front.current].setValue(0);
      show(0);
    }
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(raf);
      animation?.stop();
    };
  }, [mode, active, resetKey, alpha]);
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, overflow: "visible" }}
    >
      {slots.map((frame, index) => (
        <Animated.View
          key={index}
          pointerEvents="none"
          style={{ position: "absolute", inset: 0, opacity: alpha[index] }}
        >
          {renderFrame(frame)}
        </Animated.View>
      ))}
    </View>
  );
}
