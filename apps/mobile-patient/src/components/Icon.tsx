import Svg, { Path, Circle } from "react-native-svg";
export type IconName =
  | "sun"
  | "moon"
  | "pill"
  | "leaf"
  | "heart"
  | "message"
  | "home"
  | "history"
  | "settings"
  | "arrow"
  | "check"
  | "back"
  | "spark"
  | "close"
  | "send"
  | "edit"
  | "calendar";
const paths: Record<IconName, string> = {
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10Z",
  pill: "m8 16 8-8M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Z",
  leaf: "M5 20c1-8 8-10 13-15M5 16C0 5 12 3 21 3c0 10-5 18-14 15",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  message:
    "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0ZM7 11h10m-10 4h6",
  home: "m3 10 9-7 9 7v10H3ZM9 20v-7h6v7",
  history: "M3 5v5h5M3 10a9 9 0 1 1 1 9m8-13v6l4 2",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  back: "m15 5-7 7 7 7",
  spark: "m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z",
  close: "m6 6 12 12M6 18 18 6",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  edit: "m15 4 5 5M4 20l5-1L21 7a3.5 3.5 0 0 0-5-5L4 14Z",
  calendar:
    "M6 4h12a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2Zm2-2v5m8-5v5M4 10h16m-12 4h2m4 0h2m-8 3h2",
};
export function Icon({
  name,
  color = "#173C30",
  size = 24,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "sun" && <Circle cx="12" cy="12" r="4" />}
      {name === "settings" && <Circle cx="12" cy="12" r="3" />}
      <Path d={paths[name]} />
    </Svg>
  );
}
