import Svg, { Circle, Path } from "react-native-svg";
import type { Mood } from "../core/model";
export function MoodFace({
  mood,
  color,
  size = 42,
}: {
  mood: Mood;
  color: string;
  size?: number;
}) {
  const mouth =
    mood === "good"
      ? "M13 25Q21 37 29 25"
      : mood === "calm"
        ? "M14 27Q21 33 28 27"
        : mood === "neutral"
          ? "M15 29h12"
          : mood === "uneasy"
            ? "M14 30q4-4 7 0t7 0"
            : "M14 31Q21 23 28 31";
  return (
    <Svg width={size} height={size} viewBox="0 0 42 42">
      <Circle cx="21" cy="21" r="20" fill={color} />
      <Circle cx="14.5" cy="18" r="1.5" fill="#273A30" />
      <Circle cx="27.5" cy="18" r="1.5" fill="#273A30" />
      <Path
        d={mouth}
        stroke="#273A30"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}
