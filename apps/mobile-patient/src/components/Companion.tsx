import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, {
  Defs,
  Ellipse,
  FeColorMatrix,
  Filter,
  G,
  Image as SvgImage,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { companionFrames } from "../config/companionFrames";
import { companionAnimations } from "../config/companionAnimations";
import {
  modeDuration,
  motionPose,
  type CompanionMode,
} from "../core/companion";
import type { Outfit } from "../core/journeyModel";
import type { MascotId } from "../core/model";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { useSceneMotion } from "../hooks/useSceneMotion";
import { useFeedback } from "../hooks/useFeedback";

const Material = memo(function Material({
  source,
  outfit,
  size,
  mascot,
}: {
  mascot: MascotId;
  source: number;
  outfit: Outfit;
  size: number;
}) {
  const channels =
    outfit.color === "lavender"
      ? [1.04, 0.9, 1.15]
      : outfit.color === "pearl"
        ? [1.08, 1.02, 0.88]
        : [0.88, 1.02, 0.79];
  const matrix = channels
    .flatMap((c) => [0.2126 * c, 0.7152 * c, 0.0722 * c, 0, 0])
    .concat([0, 0, 0, 1.02, -0.02]);
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessible={false}>
      <Defs>
        <Filter
          id="fur"
          x="0"
          y="0"
          width="512"
          height="512"
          filterUnits="userSpaceOnUse"
        >
          <FeColorMatrix type="matrix" values={matrix} />
        </Filter>
        <LinearGradient id="knit" x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#F3DCB8" />
          <Stop offset=".48" stopColor="#D9B88F" />
          <Stop offset="1" stopColor="#AD8564" />
        </LinearGradient>
        <LinearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#B0C0A9" />
          <Stop offset="1" stopColor="#647E6D" />
        </LinearGradient>
      </Defs>
      {outfit.clothing === "cape" && (
        <Path
          d="M160 247Q115 314 115 416Q256 442 397 416Q392 313 352 247Z"
          fill="url(#coat)"
          stroke="#DADEC2"
          strokeWidth="4"
        />
      )}
      {outfit.clothing === "hoodie" && (
        <Path
          d="M136 270Q100 123 252 118Q409 130 378 278L347 297Q356 169 254 165Q158 170 166 297Z"
          fill="url(#knit)"
          stroke="#F2E2C9"
          strokeWidth="5"
        />
      )}
      <SvgImage
        href={source}
        x="0"
        y="0"
        width="512"
        height="512"
        filter="url(#fur)"
      />
      {outfit.clothing === "scarf" && mascot === "cloud" && (
        <G transform="translate(121.5833 291.2) scale(0.173611 0.165714)">
          <SvgImage
            href={require("../../assets/companions/cloud-scarf-v04.png")}
            width={1536}
            height={1024}
          />
        </G>
      )}
      {outfit.clothing === "scarf" && mascot !== "cloud" && (
        <G>
          <Path
            d="M140 334Q254 372 371 333L366 361Q252 397 144 359Z"
            fill="url(#knit)"
            stroke="#F1DFC2"
            strokeWidth="4"
          />
          <Path
            d="M326 352l35 7-7 64-34-3z"
            fill="url(#knit)"
            stroke="#F1DFC2"
            strokeWidth="3"
          />
          <Path
            d="M331 364l-4 46m16-43-4 46M152 346q100 33 203 0"
            stroke="#AD8D6C"
            strokeWidth="2"
            opacity=".7"
          />
        </G>
      )}
      {outfit.clothing === "hoodie" && (
        <G>
          <Path
            d="M160 337q92 35 190 0l25 64q-116 36-237 0z"
            fill="url(#knit)"
            stroke="#F3DFC2"
            strokeWidth="4"
          />
          <Path
            d="M216 369h79v27q-40 13-79 0z"
            fill="#C6A37C"
            stroke="#EED5B4"
            strokeWidth="3"
          />
          <Path d="M224 350v20m62-20v20" stroke="#F9E9D0" strokeWidth="4" />
        </G>
      )}
      {outfit.clothing === "cape" && (
        <G>
          <Path
            d="M159 329q96 33 190 0l-27 30q-65 12-135 0z"
            fill="url(#coat)"
            stroke="#E0E4C9"
            strokeWidth="3"
          />
          <Ellipse
            cx="256"
            cy="351"
            rx="13"
            ry="10"
            fill="#D9BF78"
            stroke="#F6DE9A"
            strokeWidth="3"
          />
        </G>
      )}
      {outfit.accessory === "leaf" && (
        <G transform="rotate(-20 340 152)">
          <Path
            d="M322 178Q306 109 370 102Q377 154 322 178Z"
            fill="#849E71"
            stroke="#C6D7A6"
            strokeWidth="4"
          />
          <Path d="M322 179l39-65" stroke="#D8E3B3" strokeWidth="3" />
        </G>
      )}
      {outfit.accessory === "star" && (
        <Path
          d="m348 101 12 27 30 3-23 21 7 30-26-16-27 16 7-30-22-21 30-3z"
          fill="#E0BF73"
          stroke="#FAE6AD"
          strokeWidth="5"
        />
      )}
      {outfit.accessory === "bow" && (
        <G>
          <Path
            d="M346 147Q310 111 314 157Q316 179 346 158Q383 186 384 151Q386 118 346 147Z"
            fill="#B89AB8"
            stroke="#E8CEE2"
            strokeWidth="4"
          />
          <Ellipse
            cx="347"
            cy="153"
            rx="9"
            ry="12"
            fill="#D5B6CF"
            stroke="#F0DBE9"
            strokeWidth="3"
          />
        </G>
      )}
    </Svg>
  );
});
export function Companion({
  size = 160,
  id,
  quiet = false,
  mode,
  outfit: override,
  onPress,
}: {
  size?: number;
  id?: MascotId;
  quiet?: boolean;
  mode?: CompanionMode;
  outfit?: Outfit;
  onPress?: () => void;
}) {
  const { state, reducedMotion } = useApp();
  const { journey } = useJourney();
  const active = useSceneMotion() && !quiet;
  const { pulse } = useFeedback();
  const mascot = id ?? state.mascot;
  const outfit = override ??
    journey?.world.outfits[mascot] ?? {
      color: mascot === "fluffy" ? "sage" : "lavender",
      clothing: "scarf",
      accessory: "none",
    };
  const [reaction, setReaction] = useState<CompanionMode | null>(null);
  const tapCount = useRef(0);
  const [frame, setFrame] = useState(0);
  const shown = active ? (reaction ?? mode ?? "idle") : "idle";
  const sequence = companionAnimations[shown];
  const phase = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    phase.setValue(0);
    setFrame(0);
    if (!active) return;
    const animation = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: modeDuration[shown],
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    let index = 0;
    const timer = setInterval(
      () => setFrame(++index % sequence.frames.length),
      Math.max(100, modeDuration[shown] / sequence.frames.length),
    );
    return () => {
      animation.stop();
      clearInterval(timer);
    };
  }, [active, shown, sequence, phase]);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), modeDuration[reaction]);
    return () => clearTimeout(timer);
  }, [reaction]);
  useEffect(() => {
    if (!active) setReaction(null);
  }, [active]);
  const samples = Array.from({ length: 17 }, (_, i) => i / 16);
  const poses = samples.map((p) => motionPose(shown, p));
  const interpolation = (key: "x" | "y" | "scale") =>
    phase.interpolate({
      inputRange: samples,
      outputRange: poses.map((p) => (key === "scale" ? p[key] : p[key] * size)),
    });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mascot === "fluffy" ? "Пушистик" : "Облачко"}: коснуться спутника`}
      onPress={() => {
        pulse();
        if (!reducedMotion && !quiet)
          setReaction(tapCount.current++ % 2 ? "surprised" : "touch");
        onPress?.();
      }}
      style={{ width: size, height: size, overflow: "visible" }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: size * 0.26,
          bottom: size * 0.13,
          width: size * 0.48,
          height: size * 0.045,
          borderRadius: 100,
          backgroundColor: "rgba(30,48,34,.12)",
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          overflow: "visible",
          transform: [
            { translateX: interpolation("x") },
            { translateY: interpolation("y") },
            { scale: interpolation("scale") },
            {
              rotate: phase.interpolate({
                inputRange: samples,
                outputRange: poses.map((p) => `${p.rotation}deg`),
              }),
            },
          ],
        }}
      >
        <Material
          mascot={mascot}
          source={
            companionFrames[mascot][sequence.group][
              sequence.frames[frame % sequence.frames.length]
            ]
          }
          outfit={outfit}
          size={size}
        />
      </Animated.View>
    </Pressable>
  );
}
