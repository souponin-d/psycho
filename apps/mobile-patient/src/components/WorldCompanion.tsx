import { useJourney } from "../state/JourneyProvider";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Companion } from "./Companion";
import { T } from "./UI";
import { Touch } from "./Motion";
import { useSceneMotion } from "../hooks/useSceneMotion";
import { useApp } from "../state/AppProvider";
import {
  routeToObject,
  type CompanionMode,
  type WalkPoint,
} from "../core/companion";
import { worldItems } from "../config/worldCatalog";
import type { WorldState } from "../core/journeyModel";
import type { MascotId } from "../core/model";
import { useFeedback } from "../hooks/useFeedback";

export function WorldCompanion({
  world,
  width,
  height,
  home,
  request,
  editing,
  id,
  celebrate,
  celebrationKey,
  visible = true,
}: {
  world: WorldState;
  width: number;
  height: number;
  home: WalkPoint;
  request: { id: string; at: number } | null;
  editing: boolean;
  id?: MascotId;
  celebrate?: "dayComplete" | "reward" | "sad";
  celebrationKey?: string;
  visible?: boolean;
}) {
  const { theme, reducedMotion } = useApp();
  const active = useSceneMotion() && !editing && visible;
  const [initial] = useState(() => {
    const candidate = {
      x: Math.max(0.24, Math.min(0.76, home.x - 0.22)),
      y: Math.max(0.13, home.y - 0.04),
    };
    return (
      routeToObject(candidate, world, undefined, candidate)[0] ?? candidate
    );
  });
  const position = useRef(
    new Animated.ValueXY({ x: initial.x * width, y: initial.y * height }),
  ).current;
  const location = useRef(initial);
  const [mode, setMode] = useState<CompanionMode>("idle");
  const [eventMode, setEventMode] = useState<CompanionMode | null>(null);
  const celebrated = useRef(new Set<string>());
  const { journey, act } = useJourney();
  const shown = useRef(journey?.shown);
  shown.current = journey?.shown;
  const [bubble, setBubble] = useState("");
  const [action, setAction] = useState<"flowers" | "read" | null>(null);
  const [roam, setRoam] = useState(0);
  const [facing, setFacing] = useState(1);
  const requestDone = useRef(0);
  const [spark, setSpark] = useState(false);
  const [touched, setTouched] = useState(0);
  const tapCount = useRef(0);
  const { pulse } = useFeedback();
  useEffect(() => {
    if (!touched) return;
    const timer = setTimeout(() => setTouched(0), 900);
    return () => clearTimeout(timer);
  }, [touched]);
  useEffect(() => {
    const showInteraction = (target?: string) => {
      const item = worldItems.find(
        (i) =>
          i.id ===
          world.placements.find((p) => p.instanceId === target)?.itemId,
      );
      if (item?.interaction === "sit") {
        setMode("sleepy");
        setBubble("Небольшая пауза");
      } else if (item?.interaction === "flowers") {
        setMode("curious");
        setBubble("Любые ощущения важны");
        setAction("flowers");
      } else if (item?.interaction === "light") {
        setMode("surprised");
        setBubble("Здесь стало теплее");
        setSpark(true);
      } else if (item?.interaction === "read") {
        setMode("curious");
        setBubble("Что спросим на приёме?");
        setAction("read");
      } else setMode(roam % 5 === 3 ? "curious" : "idle");
    };
    if (reducedMotion && request && !editing) {
      const route = routeToObject(location.current, world, request.id);
      const last = route.at(-1);
      if (last) {
        location.current = last;
        position.setValue({ x: last.x * width, y: last.y * height });
      }
      setBubble("");
      setAction(null);
      setSpark(false);
      showInteraction(request.id);
      return;
    }
    if (!active) {
      position.stopAnimation();
      setMode("idle");
      return;
    }
    let cancelled = false;
    const explicit = !!request && request.at !== requestDone.current;
    if (explicit) requestDone.current = request!.at;
    const target = explicit ? request!.id : undefined;
    const dest = {
      x: Math.max(
        0.18,
        Math.min(0.82, home.x - 0.15 + Math.sin(roam * 1.8) * 0.15),
      ),
      y: Math.max(
        0.13,
        Math.min(0.84, home.y + 0.06 + Math.abs(Math.cos(roam)) * 0.04),
      ),
    };
    const route = routeToObject(location.current, world, target, dest);
    setBubble("");
    setAction(null);
    setSpark(false);
    const run = async () => {
      for (const p of route) {
        if (cancelled) return;
        const from = location.current;
        const distance = Math.hypot(
          (p.x - from.x) * width,
          (p.y - from.y) * height,
        );
        if (distance < 2) continue;
        setMode("walk");
        setFacing(p.x >= from.x ? 1 : -1);
        await new Promise<void>((resolve) =>
          Animated.timing(position, {
            toValue: { x: p.x * width, y: p.y * height },
            duration: Math.max(180, (distance / 95) * 1000),
            easing: Easing.linear,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) location.current = p;
            resolve();
          }),
        );
      }
      if (cancelled) return;
      showInteraction(target);
    };
    void run();
    const timer = setTimeout(
      () => {
        if (!cancelled) setRoam((n) => n + 1);
      },
      Math.max(6000, route.length * 1100 + 3500),
    );
    return () => {
      cancelled = true;
      position.stopAnimation();
      clearTimeout(timer);
    };
  }, [
    active,
    reducedMotion,
    editing,
    world,
    request,
    roam,
    position,
    width,
    height,
    home.x,
    home.y,
  ]);
  useEffect(() => {
    if (!active) {
      setEventMode(null);
      return;
    }
    if (!celebrate) return;
    const key =
      celebrate === "reward"
        ? `reward:${celebrationKey}`
        : `day:${celebrationKey?.split(":")[0]}:${celebrate}`;
    if (celebrated.current.has(key) || shown.current?.[key]) return;
    celebrated.current.add(key);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void act({ type: "seen", key }).then((ok) => {
      if (!ok || !alive) return;
      setEventMode(celebrate);
      if (celebrate !== "sad") pulse(true);
      timer = setTimeout(
        () => setEventMode(null),
        celebrate === "sad" ? 1400 : 2100,
      );
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [celebrate, celebrationKey, active, act, pulse]);
  // Reduced motion keeps a fully visible, tappable companion in one safe spot.
  const anchor =
    reducedMotion || editing
      ? {
          translateX: (reducedMotion ? location.current : initial).x * width,
          translateY: (reducedMotion ? location.current : initial).y * height,
        }
      : null;
  const bubbleLeft = Math.max(
    12 - (location.current.x * width - 72),
    Math.min(-10, width - 12 - (location.current.x * width - 72) - 164),
  );
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: -72,
        top: -102,
        width: 144,
        height: 180,
        overflow: "visible",
        transform: [
          { translateX: anchor?.translateX ?? position.x },
          { translateY: anchor?.translateY ?? position.y },
        ],
      }}
    >
      {bubble && !editing && (
        <View
          style={{
            position: "absolute",
            bottom: 154,
            left: bubbleLeft,
            width: 164,
            padding: 9,
            borderRadius: 18,
            backgroundColor: theme.surface,
          }}
        >
          <T size={11} style={{ textAlign: "center" }}>
            {bubble}
          </T>
          {action && (
            <Touch
              accessibilityRole="button"
              onPress={() =>
                router.push(
                  action === "read"
                    ? "/questions"
                    : { pathname: "/check-in", params: { personal: "1" } },
                )
              }
              style={{ paddingVertical: 8 }}
            >
              <T size={12} weight="600" style={{ textAlign: "center" }}>
                {action === "read" ? "Мои вопросы" : "Записать момент"}
              </T>
            </Touch>
          )}
        </View>
      )}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        style={{ transform: [{ scaleX: facing }] }}
      >
        <Companion
          size={144}
          id={id}
          quiet={!active}
          outfit={id ? world.outfits[id] : undefined}
          mode={
            touched
              ? touched % 2
                ? "touch"
                : "surprised"
              : (eventMode ?? mode)
          }
        />
      </View>
      {!editing && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${id === "cloud" ? "Облачко" : "Пушистик"}: погладить спутника`}
          onPress={() => {
            pulse();
            setTouched(++tapCount.current);
          }}
          style={{
            position: "absolute",
            left: 48,
            top: 50,
            width: 48,
            height: 44,
          }}
        />
      )}
      {spark && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 105,
            top: 54,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#F5D88D",
            boxShadow: "0 0 20px #F5D88D",
          }}
        />
      )}
    </Animated.View>
  );
}
