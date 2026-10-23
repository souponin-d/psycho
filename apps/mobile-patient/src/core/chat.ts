export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};
export interface ChatTransport {
  reply(text: string, history: readonly ChatMessage[]): Promise<string>;
}
export function demoReply(text: string): string {
  const query = text.toLocaleLowerCase("ru");
  if (/препарат|доз|лечени|таблет/.test(query))
    return "С назначениями и дозировками поможет ваш врач. В этом прототипе я могу показать план и помочь оставить заметку, но не предлагаю лечение.";
  if (/врач|отправ|связ/.test(query))
    return "Сейчас это демо-чат: сообщения не отправляются врачу. Настоящую связь подключим отдельно. Пока можно посмотреть, как будет устроен разговор.";
  if (/план|сегодня|дела/.test(query))
    return "В плане на сегодня — утренняя отметка, короткий самоотчёт и прогулка. Откройте «План», чтобы увидеть время и отметить выполненное. Здесь все события демонстрационные.";
  if (/сон|спал|ноч/.test(query))
    return "Как прошла ваша ночь? Можно сохранить пару слов о сне в самоотчёте. Эти записи останутся в истории на этом телефоне.";
  if (/трев|груст|плохо|устал/.test(query))
    return "Спасибо, что поделились. Можно описать, что сейчас чувствуете, в короткой заметке. Я демонстрационный помощник и не оцениваю состояние — важные вопросы стоит обсудить со своим врачом.";
  return "Я рядом, чтобы помочь освоиться в Синкли. Можем посмотреть план дня, сделать запись о самочувствии или найти историю. Пока мои ответы демонстрационные — настоящий AI подключим позже.";
}
// Replace this adapter with a call to your own authenticated server proxy.
// Provider keys must never be embedded in a mobile bundle.
export const demoTransport: ChatTransport = {
  async reply(text) {
    if (!text.trim()) throw new Error("Введите сообщение");
    await new Promise((resolve) => setTimeout(resolve, 650));
    return demoReply(text.slice(0, 1000));
  },
};
