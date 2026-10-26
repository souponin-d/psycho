import { useApp } from "../state/AppProvider";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  Filter,
  FeColorMatrix,
  Image as SvgImage,
} from "react-native-svg";
import { T } from "./UI";
import { Touch } from "./Motion";
import { Icon, type IconName } from "./Icon";
import { WorldItemArt } from "./WorldItemArt";
import { dayMarkerPresentation } from "../core/journeyPresentation";
import type { dayNode } from "../core/dayNode";
type Node = ReturnType<typeof dayNode>;
const icons: Record<Node["groups"][number]["kind"], IconName> = {
  dose: "pill",
  report: "heart",
  questionnaire: "leaf",
};
export function JourneyDayMarker({
  node,
  chapter,
  onPress,
}: {
  node: Node;
  chapter: number;
  onPress: () => void;
}) {
  const { theme } = useApp();
  const p = dayMarkerPresentation(node.day, node.status, node.awarded),
    w = p.active ? 154 : 132;
  const ink = theme.dark
    ? "#F0F3EB"
    : node.status === "missed"
      ? "#6B5548"
      : "#234A38";
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={
        p.date +
        ". " +
        p.status +
        (node.planUnavailable
          ? ". Данные плана недоступны. Глава "
          : ". Выполнено " + node.done + " из " + node.total + " дел. Глава ") +
        chapter
      }
      onPress={onPress}
      style={{
        width: w,
        height: 118,
        alignItems: "center",
        justifyContent: "center",
        opacity: node.status === "future" ? 0.82 : 1,
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 94,
        }}
      >
        <Svg
          width={w}
          height={94}
          viewBox="45 140 1450 790"
          preserveAspectRatio="none"
          accessible={false}
        >
          <Defs>
            <Filter id="stone-alpha">
              <FeColorMatrix
                type="matrix"
                values={
                  theme.dark
                    ? ".4 0 0 0 0 0 .5 0 0 0 0 0 .65 0 0 0 0 0 1.4 -.4"
                    : "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1.4 -.4"
                }
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
      {node.growth > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -7,
            top: -8,
            transform: [{ scale: node.growth === 3 ? 1 : 0.72 }],
          }}
        >
          <WorldItemArt
            id={node.growth === 3 ? "flowers" : "fern"}
            size={node.growth === 3 ? 54 : 40}
          />
        </View>
      )}
      <View
        pointerEvents="none"
        style={{
          alignItems: "center",
          paddingTop: 17,
          gap: 2,
          maxWidth: w - 20,
        }}
      >
        <T
          size={13}
          weight="700"
          style={{
            color: ink,
            textShadowColor: theme.dark ? "#213344" : "#FFF9E1",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
          }}
        >
          {p.date}
          {node.awarded ? " ✓" : ""}
        </T>
        <T size={10} weight={p.active ? "700" : "500"} style={{ color: ink }}>
          {p.status}
        </T>
        <View style={{ flexDirection: "row", gap: 5, marginTop: 3 }}>
          {node.groups.map((g) => (
            <LinearGradient
              key={g.kind}
              colors={
                g.complete ? ["#6E9271", "#345941"] : ["#F3EAD4", "#C1AD89"]
              }
              style={{
                width: 25,
                height: 23,
                borderRadius: 9,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: g.complete ? "#AEC09B" : "#BBA782",
                boxShadow: "0 2px 2px rgba(51,48,32,.16)",
              }}
            >
              <Icon
                name={g.complete ? "check" : icons[g.kind]}
                size={13}
                color={g.complete ? "#F0F3E5" : "#675E47"}
              />
            </LinearGradient>
          ))}
        </View>
      </View>
    </Touch>
  );
}
