import { View } from "react-native";
import Svg, {
  Defs,
  Filter,
  FeColorMatrix,
  Image as SvgImage,
} from "react-native-svg";
import { T } from "./UI";
import { Touch } from "./Motion";
import {
  dayMarkerPresentation,
  type JourneyDayStatus,
} from "../core/journeyPresentation";
export function JourneyDayMarker({
  day,
  status,
  completeToday,
  label,
  onPress,
}: {
  day: string;
  status: JourneyDayStatus;
  completeToday: boolean;
  label: string;
  onPress: () => void;
}) {
  const p = dayMarkerPresentation(day, status, completeToday);
  const ink = p.active
    ? "#1E4937"
    : status === "missed"
      ? "#715448"
      : "#3F483A";
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 126,
        height: 82,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <Svg
          width={126}
          height={82}
          viewBox="45 140 1450 790"
          preserveAspectRatio="none"
          accessible={false}
        >
          <Defs>
            <Filter id="stone-alpha">
              <FeColorMatrix
                type="matrix"
                values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1.4 -.4"
              />
            </Filter>
          </Defs>
          <SvgImage
            href={require("../../assets/images/day-stone-v04.png")}
            width={1536}
            height={1024}
            filter="url(#stone-alpha)"
          />
        </Svg>
      </View>
      <View
        pointerEvents="none"
        style={{ alignItems: "center", paddingBottom: 9, gap: 1 }}
      >
        <T
          size={13}
          weight="700"
          style={{
            color: ink,
            textShadowColor: "rgba(255,255,245,.6)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
          }}
        >
          {p.date}
          {p.symbol ? "  " + p.symbol : ""}
        </T>
        <T size={10} weight={p.active ? "700" : "500"} style={{ color: ink }}>
          {p.status}
        </T>
      </View>
    </Touch>
  );
}
