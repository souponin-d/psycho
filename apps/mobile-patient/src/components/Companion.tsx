import { memo, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, {
  Defs,
  ClipPath,
  Path,
  Ellipse,
  Filter,
  FeColorMatrix,
  G,
  Image as SvgImage,
} from "react-native-svg";
import { wornAssets } from "../config/wornAssets";
import { garmentRig, type Garment } from "../core/garmentRig";
import { wardrobeAssets } from "../config/wardrobeAssets";
import { wardrobeRect, type WardrobeItem } from "../core/wardrobeLayout";
import { companionFrames } from "../config/companionFrames";
import { CompanionSprite } from "./CompanionSprite";
import {
  companionTimelineDuration,
  type CompanionFrame,
} from "../core/companionTimeline";
import type { CompanionMode } from "../core/companion";
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
  frame,
  night,
}: {
  source: number;
  outfit: Outfit;
  size: number;
  mascot: MascotId;
  frame: CompanionFrame;
  night: boolean;
}) {
  const light = night ? [0.55, 0.66, 0.82] : [1, 1, 1];
  const channels = (
    outfit.color === "lavender"
      ? [1.04, 0.9, 1.15]
      : outfit.color === "pearl"
        ? [1.08, 1.02, 0.88]
        : [0.88, 1.02, 0.79]
  ).map((n, i) => n * light[i]);
  const matrix = channels
    .flatMap((c) => [0.2126 * c, 0.7152 * c, 0.0722 * c, 0, 0])
    .concat([0, 0, 0, 1.02, -0.02]);
  const wearMatrix = [
    light[0],
    0,
    0,
    0,
    0,
    0,
    light[1],
    0,
    0,
    0,
    0,
    0,
    light[2],
    0,
    0,
    0,
    0,
    0,
    1.03,
    -0.03,
  ];
  const layer = (id: string) => {
    const asset = wardrobeAssets[id as WardrobeItem];
    if (!asset) return null;
    const rect = wardrobeRect(
        mascot,
        frame.group,
        frame.index,
        id as WardrobeItem,
      ),
      [x0, y0, x1, y1] = asset.bounds;
    const sx = rect.width / (x1 - x0),
      sy = rect.height / (y1 - y0);
    return (
      <G
        key={id}
        filter="url(#wear)"
        transform={`rotate(-18 ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})`}
      >
        <G
          transform={
            "translate(" +
            (rect.x - x0 * sx) +
            " " +
            (rect.y - y0 * sy) +
            ") scale(" +
            sx +
            " " +
            sy +
            ")"
          }
        >
          <SvgImage
            href={asset.source}
            width={asset.width}
            height={asset.height}
          />
        </G>
      </G>
    );
  };
  const rig = garmentRig(
    mascot,
    frame.group,
    frame.index,
    outfit.clothing as Garment,
  );
  const wear =
    wornAssets[`${mascot}-${outfit.clothing}` as keyof typeof wornAssets];
  const [l, t, r, b] = wear.bounds;
  const gx = rig.rect.width / (r - l),
    gy = rig.rect.height / (b - t);
  const cloth = () => (
    <G filter="url(#wear)">
      <G transform={rig.transform}>
        <SvgImage
          href={wear.source}
          x={rig.rect.x - l * gx}
          y={rig.rect.y - t * gy}
          width={1254 * gx}
          height={1254 * gy}
        />
      </G>
    </G>
  );
  const body = () => (
    <SvgImage href={source} width="512" height="512" filter="url(#fur)" />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" accessible={false}>
      <Defs>
        <ClipPath id="front">
          <Path d={rig.frontPath} transform={rig.transform} />
        </ClipPath>
        <ClipPath id="attachment">
          <Ellipse
            cx={rig.tx + (mascot === "cloud" ? 328 : 318) * rig.sx}
            cy={rig.ty + 153 * rig.sy}
            rx={16 * rig.sx}
            ry={7 * rig.sy}
          />
        </ClipPath>
        <ClipPath id="feet">
          <G transform={rig.transform}>
            {rig.feet.map((f, i) => (
              <Ellipse key={i} cx={f.x} cy={f.y} rx={f.rx} ry={f.ry} />
            ))}
          </G>
        </ClipPath>
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
        <Filter
          id="wear"
          x="0"
          y="0"
          width="512"
          height="512"
          filterUnits="userSpaceOnUse"
        >
          <FeColorMatrix type="matrix" values={wearMatrix} />
        </Filter>
      </Defs>
      {cloth()}
      {body()}
      <G clipPath="url(#front)">{cloth()}</G>

      <G clipPath="url(#feet)">{body()}</G>
      {outfit.accessory !== "none" && (
        <>
          {layer(outfit.accessory)}
          <G clipPath="url(#attachment)">{body()}</G>
        </>
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
  const lastTap = useRef(0);
  const shown = active ? (reaction ?? mode ?? "idle") : "idle";
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(
      () => setReaction(null),
      companionTimelineDuration(reaction),
    );
    return () => clearTimeout(timer);
  }, [reaction]);
  useEffect(() => {
    if (!active) setReaction(null);
  }, [active]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${mascot === "fluffy" ? "Пушистик" : "Облачко"}: коснуться спутника`}
      onPress={() => {
        pulse();
        if (!reducedMotion && !quiet && Date.now() - lastTap.current > 350) {
          lastTap.current = Date.now();
          setReaction(tapCount.current++ % 2 ? "surprised" : "touch");
        }
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
          backgroundColor: "rgba(30,48,34,.10)",
          transform: [{ scaleY: 0.55 }],
          boxShadow: "0 2px 6px rgba(28,45,33,.1)",
        }}
      />
      <CompanionSprite
        mode={shown}
        active={active}
        size={size}
        resetKey={
          mascot +
          ":" +
          outfit.color +
          ":" +
          outfit.clothing +
          ":" +
          outfit.accessory
        }
        renderFrame={(frame) => (
          <Material
            mascot={mascot}
            frame={frame}
            night={state.theme === "dark"}
            source={companionFrames[mascot][frame.group][frame.index]}
            outfit={outfit}
            size={size}
          />
        )}
      />
    </Pressable>
  );
}
