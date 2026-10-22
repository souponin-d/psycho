import { Redirect, Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useApp } from "../../state/AppProvider";
import { Icon, type IconName } from "../../components/Icon";
import { T } from "../../components/UI";
import { Touch } from "../../components/Motion";
const items: Record<string, { title: string; icon: IconName }> = {
  index: { title: "День", icon: "sun" },
  plan: { title: "План", icon: "leaf" },
  history: { title: "История", icon: "history" },
  chat: { title: "Рядом", icon: "message" },
};
function Bar({ state, navigation }: BottomTabBarProps) {
  const { theme } = useApp();
  const safe = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: Math.max(safe.bottom, 12),
        flexDirection: "row",
        borderRadius: 28,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.glass,
        padding: 7,
        elevation: 8,
        boxShadow: "0 8px 28px rgba(16,39,32,0.1)",
      }}
    >
      {state.routes.map((route, index) => {
        const item = items[route.name];
        if (!item) return null;
        const active = state.index === index;
        return (
          <View key={route.key} style={{ flex: 1 }}>
            <Touch
              accessibilityRole="tab"
              accessibilityLabel={item.title}
              accessibilityState={{ selected: active }}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!active && !event.defaultPrevented)
                  navigation.navigate(route.name);
              }}
              style={{
                minHeight: 54,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                backgroundColor: active ? theme.tint : "transparent",
                gap: 3,
              }}
            >
              <Icon name={item.icon} color={theme.text} size={21} />
              <T size={10} weight={active ? "600" : "400"}>
                {item.title}
              </T>
            </Touch>
          </View>
        );
      })}
    </View>
  );
}
export default function TabsLayout() {
  const { state, theme, reducedMotion } = useApp();
  if (!state.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={(props) => <Bar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.page },
        animation: reducedMotion ? "none" : "fade",
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="plan" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="chat" />
    </Tabs>
  );
}
