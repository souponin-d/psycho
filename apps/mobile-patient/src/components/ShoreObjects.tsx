import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import Svg, {
  Path,
  Ellipse,
  Defs,
  LinearGradient,
  Stop,
  G,
  Circle,
  RadialGradient,
} from "react-native-svg";
import { useIsFocused } from "@react-navigation/native";
import { useApp } from "../state/AppProvider";
import type { Decoration } from "../core/shore";
export function useShoreReveal(open: boolean) {
  const { reducedMotion, isActive } = useApp(),
    focused = useIsFocused();
  const value = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [progress, setProgress] = useState(open ? 1 : 0);
  useEffect(() => {
    if (!focused || !isActive) return;
    const listener = value.addListener(({ value: n }) => setProgress(n));
    const animation = Animated.timing(value, {
      toValue: open ? 1 : 0,
      duration: reducedMotion ? 0 : 1000,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      value.removeListener(listener);
      animation.stop();
    };
  }, [open, focused, reducedMotion, isActive, value]);
  return progress;
}
export function Lotus({ open, size = 88 }: { open: boolean; size?: number }) {
  const p = useShoreReveal(open);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="petal" x1="0" y1="0" x2=".5" y2="1">
          <Stop stopColor="#FFF7F0" />
          <Stop offset="1" stopColor="#D8AED3" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={48} cy={85} rx={42} ry={12} fill="#8DA575" />
      <Path
        d="M50 80 Q18 63 15 32 Q52 42 50 80"
        fill="url(#petal)"
        stroke="#F9EFE7"
        transform={`rotate(${-p * 32} 50 80)`}
      />
      <Path
        d="M50 80 Q82 63 85 32 Q48 42 50 80"
        fill="url(#petal)"
        stroke="#F9EFE7"
        transform={`rotate(${p * 32} 50 80)`}
      />
      <Path
        d="M50 80 Q19 41 37 15 Q62 42 50 80"
        fill="url(#petal)"
        stroke="#F9EFE7"
        transform={`rotate(${-p * 24} 50 80)`}
      />
      <Path
        d="M50 80 Q81 41 63 15 Q38 42 50 80"
        fill="url(#petal)"
        stroke="#F9EFE7"
        transform={`rotate(${p * 24} 50 80)`}
      />
      <Path
        d="M50 80 Q29 35 50 6 Q71 35 50 80"
        fill="url(#petal)"
        stroke="#FFF5ED"
      />
      <Ellipse cx={50} cy={70} rx={11} ry={6} fill="#F5D78F" opacity={p} />
    </Svg>
  );
}
export function Book({ size = 68 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.66} viewBox="0 0 80 52">
      <Path
        d="M5 10 Q21 3 39 13 Q57 3 75 10 L72 42 Q55 37 40 47 Q25 37 8 42 Z"
        fill="#BCA47C"
        stroke="#756442"
      />
      <Path
        d="M6 6 Q22 0 39 11 Q57 0 75 6 L71 37 Q54 33 40 43 Q26 33 9 37 Z"
        fill="#FFF4DB"
        stroke="#CFC3A6"
      />
      <Path
        d="M40 12 V41 M15 13 Q25 12 32 17 M15 19 Q25 18 32 23 M48 17 Q58 11 67 13 M48 23 Q58 17 66 19"
        fill="none"
        stroke="#AAA391"
        strokeWidth={1.5}
      />
    </Svg>
  );
}
export function Lantern({ lit, size = 37 }: { lit: boolean; size?: number }) {
  return (
    <Svg width={size * 2} height={size * 2} viewBox="-18 -10 76 80">
      <Defs>
        <RadialGradient id="lampglow">
          <Stop stopColor="#FFE1A1" stopOpacity={0.8} />
          <Stop offset="1" stopColor="#FFD578" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {lit && <Ellipse cx={20} cy={32} rx={36} ry={38} fill="url(#lampglow)" />}
      <Path
        d="M12 14 V8 Q20 -2 28 8 V14 M7 18 L20 10 L33 18 Z M11 20 H29 L32 49 H8 Z M6 51 H34"
        fill="#B49862"
        stroke="#66583C"
        strokeWidth={2}
      />
      <Path d="M15 24 H25 L27 44 H13 Z" fill={lit ? "#FFE8A0" : "#827A5D"} />
    </Svg>
  );
}
export function DecorationArt({
  id,
  size = 45,
}: {
  id: Decoration;
  size?: number;
}) {
  if (id === "lantern") return <Lantern lit size={size / 2} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 50 50">
      {id === "leaf" ? (
        <G>
          <Path
            d="M7 42 Q3 12 43 6 Q47 41 7 42"
            fill="#B7C995"
            stroke="#647C4E"
            strokeWidth={1.5}
          />
          <Path d="M7 42 L35 14" stroke="#647C4E" strokeWidth={1.5} />
        </G>
      ) : (
        <G>
          <Ellipse
            cx={25}
            cy={30}
            rx={19}
            ry={12}
            fill="#B6ACCE"
            transform="rotate(-20 25 30)"
          />
          <Path
            d="M12 24 Q24 13 37 23"
            fill="none"
            stroke="#DAD1E4"
            strokeWidth={2}
          />
        </G>
      )}
    </Svg>
  );
}
export function MemoryStone({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox="0 0 45 30">
      <Defs>
        <LinearGradient id="stone">
          <Stop stopColor="#FFF6CF" />
          <Stop offset="1" stopColor="#C2A77D" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={22} cy={20} rx={20} ry={9} fill="#4A503C" opacity={0.2} />
      <Ellipse cx={22} cy={14} rx={20} ry={11} fill="url(#stone)" />
      <Circle cx={17} cy={9} r={3} fill="#FFFFFF" opacity={0.45} />
    </Svg>
  );
}
