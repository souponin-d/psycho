import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "../state/AppProvider";
import { JourneyProvider, useJourney } from "../state/JourneyProvider";
import { ReminderProvider } from "../state/ReminderProvider";
import { T } from "../components/UI";
import {
  PatientConnectionProvider,
  usePatientConnection,
} from "../state/PatientConnectionProvider";
export { ErrorBoundary } from "expo-router";
function Navigation() {
  const { ready, theme, reducedMotion, storageError, retrySave } = useApp();
  const patient = useJourney();
  const connection = usePatientConnection();
  const { state } = useApp();
  const needsAccess =
    ready &&
    patient.ready &&
    connection.ready &&
    state.onboarded &&
    connection.mode !== "demo" &&
    !connection.connected;
  if (!ready || !patient.ready || !connection.ready)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.page,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  if (!patient.journey)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.page,
          padding: 30,
          justifyContent: "center",
          gap: 20,
        }}
      >
        <T size={24}>Не удалось открыть записи</T>
        <T>
          {patient.error ||
            "Попробуйте прочитать их ещё раз. Данные не удалены."}
        </T>
        <T accessibilityRole="button" onPress={patient.retry}>
          Повторить
        </T>
      </View>
    );
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.page },
          animation: reducedMotion ? "none" : "fade",
          animationDuration: 300,
        }}
      >
        <Stack.Protected guard={!needsAccess}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="check-in"
            options={{
              presentation: "modal",
              animation: reducedMotion ? "none" : "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="settings"
            options={{ animation: reducedMotion ? "none" : "slide_from_right" }}
          />
          <Stack.Screen name="companion-preview" />
          <Stack.Screen name="contact" />
          <Stack.Screen name="questionnaire" />
          <Stack.Screen name="questions" />
          <Stack.Screen name="shore-settings" />
          <Stack.Screen name="visit" />
          <Stack.Screen name="world" />
        </Stack.Protected>
        <Stack.Screen
          name="onboarding"
          initialParams={{ access: state.onboarded ? "1" : undefined }}
          options={{ gestureEnabled: false }}
        />
        <Stack.Screen name="help" />
      </Stack>
      {(storageError || patient.error) && (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 110,
            backgroundColor: theme.surface,
            padding: 16,
            borderRadius: 20,
          }}
        >
          <T
            onPress={patient.error ? patient.retry : retrySave}
            accessibilityRole="button"
            size={13}
          >
            {patient.error || "Не удалось сохранить на телефоне."} Коснитесь,
            чтобы повторить.
          </T>
        </View>
      )}
    </>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({
    Onest: require("../../assets/fonts/Onest.ttf"),
  });
  if (!loaded && !error)
    return <View style={{ flex: 1, backgroundColor: "#F6F5ED" }} />;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <PatientConnectionProvider>
          <JourneyProvider>
            <ReminderProvider>
              <Navigation />
            </ReminderProvider>
          </JourneyProvider>
        </PatientConnectionProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
