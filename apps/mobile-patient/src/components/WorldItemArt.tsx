import { Image, View } from "react-native";
import { worldAssets } from "../config/worldAssets";
import { useApp } from "../state/AppProvider";
/** Общие камера, свет и фактура; тень входит в отдельный прозрачный ресурс. */
export function WorldItemArt({ id, size = 64 }: { id: string; size?: number }) {
  const { state } = useApp();
  const source = worldAssets[id];
  if (!source) return null;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Image
        source={source}
        style={{ width: size, height: size }}
        resizeMethod="resize"
        resizeMode="contain"
      />
      {state.theme === "dark" && (
        <Image
          source={source}
          style={{
            position: "absolute",
            inset: 0,
            width: size,
            height: size,
            tintColor: "#344D6C",
            opacity: 0.36,
          }}
          resizeMethod="resize"
          resizeMode="contain"
        />
      )}
    </View>
  );
}
