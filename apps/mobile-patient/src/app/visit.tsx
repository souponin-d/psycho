import { patientLabel } from "../core/patientPresentation";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen, Heading, T, Button } from "../components/UI";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
export default function VisitScreen() {
  const { theme } = useApp(),
    { journey } = useJourney();
  if (!journey) return null;
  const visit = journey.plan.visit;
  return (
    <Screen title="Следующий приём" back>
      <Heading
        title="Встреча с врачом"
        body="Подготовим то, что важно обсудить."
      />
      <View
        style={{
          padding: 24,
          borderRadius: 27,
          backgroundColor: theme.soft,
          gap: 12,
          marginBottom: 25,
        }}
      >
        <T size={27} weight="500">
          {new Date(visit.day + "T12:00:00").toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
          })}{" "}
          · {visit.time}
        </T>
        <T>{visit.specialist}</T>
        <T muted size={13}>
          {patientLabel(visit.place)}
        </T>
      </View>
      <View style={{ gap: 12 }}>
        <Button
          title="Мои вопросы к приёму"
          onPress={() => router.push("/questions")}
        />
        <Button
          title="История и сводка периода"
          secondary
          onPress={() => router.push("/history")}
        />
        <Button
          title="Хочу связаться раньше"
          secondary
          onPress={() => router.push("/contact" as Href)}
        />
      </View>
    </Screen>
  );
}
