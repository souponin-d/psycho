import { View, Image, StyleSheet } from "react-native";
import { themes } from "../theme/themes";
import { useApp } from "../state/AppProvider";
import { T } from "./UI";
import { Touch } from "./Motion";
import { Icon } from "./Icon";
import type { ThemeId } from "../core/model";
export function ThemePicker() {
  const { state, dispatch, theme } = useApp();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {(Object.keys(themes) as ThemeId[]).map((id) => {
        const item = themes[id];
        const active = state.theme === id;
        return (
          <View key={id} style={{ flex: 1 }}>
            <Touch
              accessibilityRole="button"
              accessibilityLabel={`Тема ${item.name}`}
              accessibilityState={{ selected: active }}
              onPress={() =>
                dispatch({ type: "preferences", patch: { theme: id } })
              }
              style={{
                borderRadius: 25,
                overflow: "hidden",
                borderWidth: active ? 2 : 1,
                borderColor: active ? theme.accent : theme.border,
                backgroundColor: item.page,
                height: 175,
              }}
            >
              <Image
                source={item.landscape}
                style={[
                  StyleSheet.absoluteFill,
                  { width: "100%", height: "100%" },
                ]}
                resizeMode="cover"
              />
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: item.overlay },
                ]}
              />
              <View
                style={{
                  position: "absolute",
                  left: 9,
                  right: 9,
                  top: 20,
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: "70%",
                    height: 5,
                    backgroundColor: item.text,
                    opacity: 0.8,
                    borderRadius: 5,
                  }}
                />
                <View
                  style={{
                    width: "45%",
                    height: 5,
                    backgroundColor: item.text,
                    opacity: 0.5,
                    borderRadius: 5,
                  }}
                />
              </View>
              <View
                style={{
                  position: "absolute",
                  bottom: 9,
                  left: 7,
                  right: 7,
                  borderRadius: 15,
                  padding: 9,
                  backgroundColor: item.glass,
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon
                  name={
                    id === "dark" ? "moon" : id === "light" ? "sun" : "leaf"
                  }
                  size={19}
                  color={item.text}
                />
                <T size={11} style={{ color: item.text }}>
                  {item.name}
                </T>
              </View>
              {active && (
                <View
                  style={{
                    position: "absolute",
                    right: 7,
                    top: 7,
                    borderRadius: 20,
                    padding: 4,
                    backgroundColor: theme.accent,
                  }}
                >
                  <Icon name="check" color={theme.onAccent} size={15} />
                </View>
              )}
            </Touch>
          </View>
        );
      })}
    </View>
  );
}
