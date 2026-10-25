import { Linking, View } from "react-native";
import { router, type Href } from "expo-router";
import { Screen, Heading, T, Button } from "../components/UI";
export default function HelpScreen() {
  return (
    <Screen title="Нужна помощь" back>
      <Heading title="Помощь доступна вне приложения" />
      <View style={{ gap: 20 }}>
        <T>
          Если вам или другому человеку угрожает опасность прямо сейчас,
          позвоните 112 или обратитесь за неотложной помощью. Не ждите ответа в
          приложении.
        </T>
        <Button
          title="Позвонить 112"
          onPress={() => void Linking.openURL("tel:112")}
        />
        <T muted size={13}>
          В этом сценарии нет реальной отправки врачу и работающей экстренной
          службы. Запись состояния не означает, что специалист её увидел.
        </T>
        <Button
          title="Сохранить вопрос к врачу"
          secondary
          onPress={() => router.push("/questions")}
        />
        <Button
          title="Обращение о переносимости"
          secondary
          onPress={() => router.push("/contact" as Href)}
        />
      </View>
    </Screen>
  );
}
