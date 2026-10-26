import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, View } from "react-native";
import {
  companionTimeline,
  type CompanionFrame,
} from "../core/companionTimeline";
import {
  blendLayers,
  createFrameGate,
  createArtworkSlots,
} from "../core/companionPlayback";
import type { CompanionMode } from "../core/companion";
const idle: CompanionFrame = { group: "idle", index: 0 };
const key = (f: CompanionFrame) => f.group + ":" + f.index;

/** Видимый готовый кадр никогда не затухает до готовности замены. */
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
  renderFrame: (frame: CompanionFrame, onReady: () => void) => ReactNode;
}) {
  const [slots, setSlots] = useState<CompanionFrame[]>([idle, idle]);
  const sources = useRef<CompanionFrame[]>([idle, idle]);
  const front = useRef(0);
  const alpha = useRef([new Animated.Value(1), new Animated.Value(0)]).current;
  const gate = useRef(createFrameGate(key(idle))).current;
  const artwork = useRef(createArtworkSlots(resetKey, renderFrame)).current;
  const currentRenderer = useRef(renderFrame);
  currentRenderer.current = renderFrame;
  const ready = useRef<
    ((index: number, frame: CompanionFrame, appearance: string) => void) | null
  >(null);
  useEffect(() => {
    let alive = true,
      timer: ReturnType<typeof setTimeout> | undefined,
      animation: Animated.CompositeAnimation | undefined;
    const timeline = companionTimeline(active ? mode : "idle");
    const later = (fn: () => void, ms: number) => {
      if (active)
        timer = setTimeout(() => {
          if (alive) fn();
        }, ms);
    };
    const show = (index: number) => {
      if (!alive) return;
      if (index >= timeline.steps.length) {
        if (timeline.loop && active) show(0);
        return;
      }
      const step = active ? timeline.steps[index] : idle,
        old = front.current,
        next = 1 - old;
      const duration = active ? timeline.steps[index].blendMs : 0;
      const hold = active ? timeline.steps[index].holdMs : 0;
      if (
        key(sources.current[old]) === key(step) &&
        artwork.identity(old) === resetKey
      ) {
        later(() => show(index + 1), hold);
        return;
      }
      const token = gate.begin(key(step) + ":" + resetKey);
      let started = false;
      alpha[old].setValue(1);
      alpha[next].setValue(0);
      ready.current = (slot, frame, appearance) => {
        if (
          !alive ||
          started ||
          slot !== next ||
          key(frame) !== key(step) ||
          appearance !== resetKey
        )
          return;
        started = true;
        animation = Animated.timing(alpha[next], {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        });
        animation.start(({ finished }) => {
          if (!alive || !finished || !gate.commit(token)) return;
          front.current = next;
          alpha[old].setValue(0);
          ready.current = null;
          later(() => show(index + 1), Math.max(0, hold - duration));
        });
      };
      artwork.stage(next, resetKey, currentRenderer.current);
      sources.current[next] = { group: step.group, index: step.index };
      setSlots([...sources.current]);
    };
    alpha[front.current].setValue(1);
    alpha[1 - front.current].setValue(0);
    show(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      ready.current = null;
      gate.cancel();
      animation?.stop();
    };
  }, [mode, active, resetKey, alpha, gate, artwork]);
  const layers = blendLayers(front.current, 0);
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, overflow: "visible" }}
    >
      {slots.map((frame, index) => {
        const appearance = artwork.identity(index);
        return (
          <Animated.View
            key={index}
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              opacity: alpha[index],
              zIndex: layers[index].zIndex,
            }}
          >
            {artwork.value(index)(frame, () =>
              ready.current?.(index, frame, appearance),
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}
