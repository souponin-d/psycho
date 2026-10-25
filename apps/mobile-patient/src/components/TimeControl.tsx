import { useState } from "react";
import { Modal, ScrollView, TextInput, View } from "react-native";
import { useApp } from "../state/AppProvider";
import { Button, RoundButton, T } from "./UI";
import { Touch } from "./Motion";
export function TimeControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { theme } = useApp();
  const [open, setOpen] = useState(false),
    [hour, setHour] = useState(9),
    [minute, setMinute] = useState(0);
  function show() {
    const [h, m] = value.split(":").map(Number);
    setHour(Number.isInteger(h) && h >= 0 && h < 24 ? h : 9);
    setMinute(Number.isInteger(m) && m >= 0 && m < 60 ? m : 0);
    setOpen(true);
  }
  return (
    <View style={{ gap: 8 }}>
      <T size={13}>{label}</T>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          maxLength={5}
          keyboardType="numbers-and-punctuation"
          style={{
            flex: 1,
            fontFamily: "Onest",
            fontSize: 20,
            color: theme.text,
            backgroundColor: theme.soft,
            padding: 14,
            borderRadius: 16,
          }}
        />
        <RoundButton
          icon="calendar"
          label={"Выбрать часы и минуты: " + label}
          onPress={show}
        />
      </View>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            backgroundColor: "#091E21AA",
            padding: 24,
          }}
        >
          <View
            style={{
              padding: 24,
              borderRadius: 28,
              backgroundColor: theme.page,
              gap: 16,
            }}
          >
            <T size={21} weight="600">
              {label}
            </T>
            <View style={{ flexDirection: "row", gap: 20, height: 260 }}>
              {(
                [
                  ["Часы", 24, hour, setHour],
                  ["Минуты", 60, minute, setMinute],
                ] as const
              ).map(([name, count, selected, select]) => (
                <View key={name} style={{ flex: 1, gap: 8 }}>
                  <T muted>{name}</T>
                  <ScrollView
                    contentOffset={{ x: 0, y: Math.max(0, selected - 2) * 48 }}
                    showsVerticalScrollIndicator
                  >
                    {Array.from({ length: count }, (_, n) => (
                      <Touch
                        key={n}
                        accessibilityRole="button"
                        accessibilityLabel={`${name}: ${n}`}
                        accessibilityState={{ selected: n === selected }}
                        onPress={() => select(n)}
                        style={{
                          height: 48,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 16,
                          backgroundColor:
                            n === selected ? theme.soft : "transparent",
                        }}
                      >
                        <T size={22} weight={n === selected ? "700" : "400"}>
                          {String(n).padStart(2, "0")}
                        </T>
                      </Touch>
                    ))}
                  </ScrollView>
                </View>
              ))}
            </View>
            <Button
              title="Выбрать время"
              onPress={() => {
                onChange(
                  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
                );
                setOpen(false);
              }}
            />
            <Button secondary title="Отмена" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
