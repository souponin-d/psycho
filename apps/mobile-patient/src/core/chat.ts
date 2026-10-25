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
    return "С назначениями и дозировками поможет ваш врач. Вопрос можно сохранить в разделе «Вопросы к приёму» и обсудить на следующем приёме.";
  if (/врач|отправ|связ/.test(query))
    return "Сообщения врачу пока не отправляются. Сохраните вопрос в разделе «Вопросы к приёму», чтобы вернуться к нему перед встречей.";
  if (/план|сегодня|дела/.test(query))
    return "Откройте «План», чтобы увидеть события на сегодня. Кнопка «Заполнить самоотчёт» ведёт к записи самочувствия. Вопросы для врача сохраняются отдельно.";
  if (/сон|спал|ноч/.test(query))
    return "Как прошла ваша ночь? Можно сохранить пару слов о сне в самоотчёте. Эти записи останутся в истории на этом телефоне.";
  if (/трев|груст|плохо|устал/.test(query))
    return "Спасибо, что поделились. Можно описать ощущение на карте и добавить пару слов к моменту. Вопросы о состоянии стоит обсудить со своим врачом.";
  return "Можем посмотреть план дня, заполнить самоотчёт или найти сохранённые записи в истории. Что хочется сделать сейчас?";
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
