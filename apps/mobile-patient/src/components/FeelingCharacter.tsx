import { memo } from "react";
import { Animated } from "react-native";
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Path,
  G,
  Ellipse,
} from "react-native-svg";
import { feelingAt, type FeelingPoint } from "../core/feelings";
import {
  useFloat,
  useSceneClock,
  useSceneMotion,
} from "../hooks/useSceneMotion";
function eye(cx: number, cy: number, closed: boolean, height: number) {
  return closed
    ? `M${cx - 5} ${cy} Q${cx} ${cy - 7} ${cx + 5} ${cy}`
    : `M${cx - 4} ${cy} a4 ${height} 0 1 0 8 0 a4 ${height} 0 1 0 -8 0`;
}
export const FeelingCharacter = memo(function FeelingCharacter({
  point,
  size = 136,
  quiet = false,
}: {
  point: FeelingPoint;
  size?: number;
  quiet?: boolean;
}) {
  const running = useSceneMotion() && !quiet;
  const t = useSceneClock(running);
  const float = useFloat(running, 2100);
  const feeling = feelingAt(point),
    kind = feeling.kind;
  const pts = Array.from({ length: 9 }, (_, i) => {
    const a = (i * Math.PI * 2) / 9;
    const wave =
      Math.sin(t * (1.1 + point.energy / 6) + i * 1.9) * (2 + point.energy / 3);
    return [
      85 + Math.cos(a) * (57 + wave + Math.sin(i * 2.8) * 7),
      75 +
        Math.sin(a) *
          (50 + wave) *
          (kind === "tired" || kind === "quiet" ? 0.84 : 1),
    ];
  });
  let shape = `M${pts[0]!.join(" ")}`;
  for (let i = 0; i < 9; i++) {
    const p = pts[(i + 8) % 9]!,
      c = pts[i]!,
      n = pts[(i + 1) % 9]!,
      a = pts[(i + 2) % 9]!;
    shape +=
      " C" +
      [
        c[0]! + (n[0]! - p[0]!) / 6,
        c[1]! + (n[1]! - p[1]!) / 6,
        n[0]! - (a[0]! - c[0]!) / 6,
        n[1]! - (a[1]! - c[1]!) / 6,
        n[0],
        n[1],
      ].join(" ");
  }
  shape += " Z";
  const blink = Math.abs((t % 3.9) - 3.15) < 0.09;
  const closed = blink || ["calm", "happy", "joy"].includes(kind);
  let mouth = "M72 92 Q85 92 98 92",
    fill = "none",
    brows = ["", ""];
  if (kind === "tense") {
    brows = ["M53 54 Q61 53 67 47", "M102 47 Q109 53 117 54"];
    mouth = "M69 95 Q73 87 78 95 T87 95 T96 95 T102 95";
  }
  if (kind === "surprise") {
    brows = ["M53 51 Q61 45 69 51", "M101 51 Q109 45 117 51"];
    mouth = "M80 91 a6 8 0 1 0 12 0 a6 8 0 1 0 -12 0";
    fill = "#32283C";
  }
  if (kind === "sad") {
    brows = ["M53 55 Q61 50 68 50", "M102 50 Q109 50 117 55"];
    mouth = "M72 99 Q85 85 98 99";
  }
  if (kind === "tired") {
    brows = ["M53 56 L69 58", "M101 58 L117 56"];
    mouth = "M76 94 Q85 89 94 94";
  }
  if (kind === "quiet") mouth = "M76 93 Q85 95 94 93";
  if (kind === "calm") mouth = "M74 92 Q85 103 96 92";
  if (kind === "happy") mouth = "M70 90 Q85 111 100 90";
  if (kind === "joy") {
    brows = ["M52 51 Q61 44 69 49", "M101 49 Q109 44 118 51"];
    mouth = "M68 87 Q85 95 103 87 Q100 112 85 110 Q70 109 68 87 Z";
    fill = "#32283C";
  }
  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        transform: [
          {
            translateY: float.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -5],
            }),
          },
          {
            rotate: float.interpolate({
              inputRange: [0, 1],
              outputRange: ["-2deg", "2deg"],
            }),
          },
        ],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 170 150">
        <Defs>
          <RadialGradient id="skin" cx="30%" cy="24%" r="85%">
            <Stop offset="0" stopColor="#FFF9E9" />
            <Stop offset="1" stopColor={feeling.hue} />
          </RadialGradient>
        </Defs>
        <Path d={shape} fill="url(#skin)" />
        <Path
          d={shape}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.18}
          transform="translate(3 3) scale(.965)"
        />
        <G
          transform={`translate(${(point.valence - 3) * 0.8} ${(3 - point.energy) * 0.5})`}
        >
          {brows.map((d, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              stroke="#32283C"
              strokeWidth={2.8}
              strokeLinecap="round"
            />
          ))}
          {[61, 109].map((cx) => (
            <Path
              key={cx}
              d={eye(
                cx,
                kind === "tired" ? 73 : 69,
                closed,
                kind === "surprise" ? 7 : kind === "tired" ? 2.5 : 5,
              )}
              fill={closed ? "none" : "#32283C"}
              stroke={closed ? "#32283C" : "none"}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          ))}
          {kind === "joy" &&
            [52, 118].map((cx) => (
              <Ellipse
                key={cx}
                cx={cx}
                cy={86}
                rx={8}
                ry={4}
                fill="#E9A2A0"
                opacity={0.3}
              />
            ))}
          <Path
            d={mouth}
            fill={fill}
            stroke="#32283C"
            strokeWidth={3.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </Animated.View>
  );
});
