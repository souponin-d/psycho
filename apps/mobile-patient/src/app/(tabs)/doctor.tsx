import { View } from "react-native";
import { router } from "expo-router";
import { Screen, T, Button } from "../../components/UI";
import { Touch } from "../../components/Motion";
import { Icon } from "../../components/Icon";
import { useApp } from "../../state/AppProvider";
import { usePatientConnection } from "../../state/PatientConnectionProvider";
import { chatRows } from "../../core/patientChatView";
import { doctorInboxCard } from "../../core/doctorInbox";

export default function DoctorInbox() {
  const { theme } = useApp();
  const connection = usePatientConnection();
  const available = connection.mode === "server" && !!connection.snapshot;
  const card = doctorInboxCard(
    chatRows(connection.snapshot?.messages ?? [], connection.pendingMessages),
    available,
  );
  const date = card.time ? new Date(card.time) : null;
  const time =
    date && Number.isFinite(date.getTime())
      ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
      : "";
  return (
    <Screen title="Связь с врачом">
      <Button
        title="Связаться с врачом"
        icon="message"
        onPress={() => router.push("/contact")}
      />
      <View style={{ marginTop: 24 }}>
        <Touch
          accessibilityRole="button"
          accessibilityLabel={
            available
              ? "Открыть чат с лечащим врачом"
              : "Подключить чат с врачом по коду"
          }
          onPress={() =>
            router.push(available ? "/doctor-chat" : "/onboarding?access=1")
          }
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 18,
            borderRadius: 22,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            minHeight: 100,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.tint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="doctor" size={25} color={theme.text} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <T size={16} weight="600" style={{ flex: 1 }}>
                Лечащий врач
              </T>
              {!!time && (
                <T muted size={11}>
                  {time}
                </T>
              )}
            </View>
            <T muted size={13} numberOfLines={2}>
              {card.preview}
            </T>
          </View>
          <Icon name="arrow" size={19} color={theme.muted} />
        </Touch>
      </View>
    </Screen>
  );
}
