import type { PropsWithChildren } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  type TextProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../state/AppProvider";
import { Icon, type IconName } from "./Icon";
import { Touch, Enter } from "./Motion";

export function T({
  style,
  muted,
  size = 16,
  weight = "400",
  ...props
}: TextProps & {
  muted?: boolean;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
}) {
  const { theme } = useApp();
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: "Onest",
          fontSize: size,
          lineHeight: size * 1.35,
          fontWeight: weight,
          color: muted ? theme.muted : theme.text,
        },
        style,
      ]}
    />
  );
}
export function Button({
  title,
  onPress,
  icon = "arrow",
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useApp();
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 58,
        paddingHorizontal: 22,
        paddingVertical: 15,
        borderRadius: 22,
        backgroundColor: secondary ? theme.soft : theme.accent,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
        gap: 12,
      }}
    >
      <T
        size={16}
        weight="600"
        style={{
          color: secondary ? theme.text : theme.onAccent,
          flexShrink: 1,
        }}
      >
        {title}
      </T>
      <Icon
        name={icon}
        color={secondary ? theme.text : theme.onAccent}
        size={22}
      />
    </Touch>
  );
}
export function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useApp();
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: theme.glass,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Icon name={icon} color={theme.text} size={21} />
    </Touch>
  );
}
export function Header({
  title = "синкли",
  back = false,
  subtitle,
}: {
  title?: string;
  back?: boolean;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <RoundButton
          icon="back"
          label="Назад"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        />
      ) : (
        <View>
          <T size={23} weight="700" style={{ letterSpacing: -1 }}>
            {title}
          </T>
          {subtitle && (
            <T muted size={11}>
              {subtitle}
            </T>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {back && (
          <T size={16} weight="500">
            {title}
          </T>
        )}
        {!back && (
          <RoundButton
            icon="settings"
            label="Настройки"
            onPress={() => router.push("/settings")}
          />
        )}
      </View>
    </View>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  back = false,
  style,
  scroll = true,
}: PropsWithChildren<{
  title?: string;
  subtitle?: string;
  back?: boolean;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
}>) {
  const { theme } = useApp();
  const safe = useSafeAreaInsets();
  const content = (
    <>
      <Header title={title} back={back} subtitle={subtitle} />
      <Enter>{children}</Enter>
    </>
  );
  return (
    <View
      style={[
        { flex: 1, backgroundColor: theme.page, paddingTop: safe.top },
        style,
      ]}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingBottom: safe.bottom + 120,
          }}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 24 }}>{content}</View>
      )}
    </View>
  );
}
export function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <View style={{ marginTop: 14, marginBottom: 24, gap: 8 }}>
      <T size={36} weight="500" style={{ letterSpacing: -1.4, lineHeight: 40 }}>
        {title.replace(/\\n/g, "\n")}
      </T>
      {body && (
        <T muted size={14}>
          {body}
        </T>
      )}
    </View>
  );
}
export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { theme } = useApp();
  return (
    <View
      style={[
        {
          padding: 20,
          borderRadius: 28,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useApp();
  return (
    <Touch
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        minHeight: 48,
        paddingHorizontal: 17,
        paddingVertical: 13,
        borderRadius: 20,
        backgroundColor: active ? theme.accent : theme.soft,
      }}
    >
      <T size={14} style={{ color: active ? theme.onAccent : theme.text }}>
        {label}
      </T>
    </Touch>
  );
}
export function FadeBottom() {
  const { theme } = useApp();
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["transparent", theme.page]}
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60 }}
    />
  );
}
const styles = StyleSheet.create({
  header: {
    minHeight: 70,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
});
