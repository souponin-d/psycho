import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, T, Panel, Button, Chip, RoundButton } from "../components/UI";
import { Touch } from "../components/Motion";
import { HistoryCharts } from "../components/HistoryCharts";
import { HistoryCalendar } from "../components/HistoryCalendar";
import { FeelingCharacter } from "../components/FeelingCharacter";
import { useApp } from "../state/AppProvider";
import { useJourney } from "../state/JourneyProvider";
import { usePatientConnection } from "../state/PatientConnectionProvider";
import {
  projectHistory,
  historyBounds,
  doseLabels,
  historyDayPresentation,
} from "../core/history";
import { isDay } from "../core/shore";
import { shiftDay } from "../core/calendar";
import { latestReports } from "../core/questionnaires";
import {
  saveHistoryExport,
  openExportShareSheet,
  saveExportCopy,
} from "../services/historyExport";
import { moodOptions } from "../config/content";

function Sheet({
  children,
  title,
  onClose,
}: PropsWithChildren<{ title: string; onClose: () => void }>) {
  const { theme, reducedMotion } = useApp();
  const safe = useSafeAreaInsets();
  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{
          flex: 1,
          backgroundColor: "rgba(4,18,16,0.4)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "90%",
            backgroundColor: theme.page,
            borderTopLeftRadius: 32,
            borderTopRightRadius: 32,
            padding: 24,
            paddingBottom: Math.max(safe.bottom, 24),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <T size={23} weight="600" style={{ flex: 1 }}>
              {title}
            </T>
            <RoundButton
              icon="close"
              label="Закрыть окно истории"
              onPress={onClose}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const dateLabel = (day: string) =>
  new Date(day + "T12:00:00").toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });

export default function HistoryScreen() {
  const { theme, today, state } = useApp();
  const { journey, act, saving } = useJourney();
  const connection = usePatientConnection();
  const focused = useIsFocused();
  useEffect(() => {
    if (focused && journey && !journey.activity?.history)
      void act({ type: "activity", activity: "history" });
  }, [focused, journey, act]);
  const params = useLocalSearchParams<{ day?: string }>();
  const requested =
    typeof params.day === "string" && isDay(params.day) && params.day <= today
      ? params.day
      : today;
  const [selected, setSelected] = useState(requested),
    [end, setEnd] = useState(requested);
  const [period, setPeriod] = useState<7 | 30>(7);
  const [month, setMonth] = useState(requested.slice(0, 7));
  const [calendar, setCalendar] = useState(false),
    [limit, setLimit] = useState(20);
  const [exporting, setExporting] = useState(false),
    [exportBusy, setExportBusy] = useState(false),
    [allHistory, setAllHistory] = useState(false);
  const [file, setFile] = useState<Awaited<
    ReturnType<typeof saveHistoryExport>
  > | null>(null);
  const [dose, setDose] = useState<{
    slotId: string;
    status: "taken" | "missed" | "unknown";
    time: string;
    note: string;
  } | null>(null);
  const dates = useRef<ScrollView>(null);
  useEffect(() => {
    setSelected(requested);
    setEnd(requested);
  }, [requested]);
  useEffect(() => setLimit(20), [selected]);
  const from = shiftDay(end, -period + 1);
  const data = useMemo(
    () =>
      journey
        ? projectHistory(
            journey,
            { from, to: end },
            { gameplay: state.gameplay },
          )
        : null,
    [journey, from, end, state.gameplay],
  );
  if (!journey || !data) return null;
  const first = historyBounds(journey);
  const current =
    data.days.find((d) => d.day === selected) ?? data.days.at(-1)!;
  const revisedLegacy = new Set(
    journey.events
      .filter((e) => e.kind === "report" && e.entityId?.startsWith("legacy:"))
      .map((e) => e.entityId!.slice(7)),
  );
  const recorded = new Set([
    ...latestReports(journey).map((e) => e.day),
    ...journey.legacyArchive
      .filter((r) => !revisedLegacy.has(r.id))
      .map((r) => r.day),
  ]);
  const fieldStyle = {
    fontFamily: "Onest",
    fontSize: 17,
    padding: 16,
    borderRadius: 18,
    color: theme.text,
    backgroundColor: theme.soft,
  };
  const editReport = (id: string) =>
    router.push({
      pathname: "/check-in",
      params: { day: selected, reportId: id },
    });
  function removeReport(id: string, required: boolean) {
    Alert.alert(
      "Удалить запись?",
      connection.mode === "server" && required
        ? "Запись будет скрыта только на этом телефоне. В кабинете врача и на других устройствах она останется."
        : !state.gameplay
          ? "Запись будет убрана из списка; история исправлений сохранится."
          : required
            ? "Запись будет убрана из списка; история исправлений сохранится. Обязательный самоотчёт останется в плане. Закрытый игровой итог не изменится."
            : "Запись будет убрана из списка; история исправлений сохранится. Закрытый игровой итог и награды не изменятся.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: () =>
            void act({
              type: "event",
              event: {
                id: "delete-" + Date.now(),
                entityId: id,
                kind: "report",
                day: selected,
                required,
                fields: {},
                note: "",
                deleted: true,
              },
            }),
        },
      ],
    );
  }
  async function saveDose() {
    if (!dose) return;
    if (dose.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dose.time)) {
      Alert.alert(
        "Проверьте время",
        "Укажите часы и минуты, например 09:00, или оставьте поле пустым.",
      );
      return;
    }
    if (
      await act({
        type: "event",
        event: {
          id: "dose-edit-" + Date.now(),
          kind: "dose",
          action: "correct",
          day: selected,
          slotId: dose.slotId,
          status: dose.status,
          occurredAt:
            dose.status === "taken" ? dose.time || undefined : undefined,
          note: dose.note.trim(),
        },
      })
    )
      setDose(null);
  }
  async function createExport(format: "json" | "pdf") {
    if (!journey) return;
    setFile(null);
    setExportBusy(true);
    try {
      const projection = allHistory
        ? projectHistory(
            journey,
            { from: first, to: today },
            { gameplay: state.gameplay },
          )
        : data!;
      setFile(await saveHistoryExport(projection, format));
    } catch {
      Alert.alert(
        "Файл не создан",
        "Не удалось сохранить историю. Проверьте свободное место и попробуйте ещё раз.",
      );
    } finally {
      setExportBusy(false);
    }
  }
  return (
    <Screen title="История" back>
      {connection.mode === "server" &&
        connection.connected &&
        connection.snapshot?.reports.kind !== "ready" && (
          <Panel style={{ marginBottom: 16 }}>
            <T size={13}>
              Часть самоотчётов не удалось восстановить с сервера. Доступные
              записи показаны ниже.
            </T>
          </Panel>
        )}
      {!!journey?.planVersions?.length && (
        <Panel style={{ marginBottom: 16, gap: 6 }}>
          <T size={14} weight="600">
            Уточнения плана
          </T>
          {journey.planVersions.map((p) => (
            <T key={p.id} size={12} muted>
              С{" "}
              {new Date(
                (p.effectiveFrom ?? p.startedAt) + "T12:00:00",
              ).toLocaleDateString("ru-RU")}{" "}
              · обязательных разделов самоотчёта: {p.reportFields.length}
            </T>
          ))}
        </Panel>
      )}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {([7, 30] as const).map((value) => (
          <Chip
            key={value}
            label={value + " дней"}
            active={period === value}
            onPress={() => {
              setPeriod(value);
              setSelected(end);
            }}
          />
        ))}
        <Chip
          label="Календарь"
          active={calendar}
          onPress={() => {
            setMonth(selected.slice(0, 7));
            setCalendar(true);
          }}
        />
        <Chip
          label="Сегодня"
          active={selected === today}
          onPress={() => {
            setEnd(today);
            setSelected(today);
          }}
        />
      </View>
      <T muted size={12} style={{ marginBottom: 12 }}>
        {dateLabel(from)} — {dateLabel(end)}
      </T>
      <HistoryCharts data={data} />
      <T size={20} weight="600" style={{ marginTop: 28, marginBottom: 16 }}>
        Записи дня
      </T>
      <ScrollView
        ref={dates}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() =>
          dates.current?.scrollToEnd({ animated: false })
        }
        contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
      >
        {data.days.map((day) => (
          <Touch
            key={day.day}
            accessibilityRole="button"
            accessibilityLabel={"История за " + day.day}
            accessibilityState={{ selected: selected === day.day }}
            onPress={() => setSelected(day.day)}
            style={{
              width: 54,
              paddingVertical: 12,
              alignItems: "center",
              gap: 8,
              borderRadius: 24,
              backgroundColor: selected === day.day ? theme.accent : theme.soft,
            }}
          >
            <T
              size={11}
              style={{
                color: selected === day.day ? theme.onAccent : theme.muted,
              }}
            >
              {new Date(day.day + "T12:00").toLocaleDateString("ru-RU", {
                weekday: "short",
              })}
            </T>
            <T
              size={20}
              weight="600"
              style={{
                color: selected === day.day ? theme.onAccent : theme.text,
              }}
            >
              {day.day.slice(-2)}
            </T>
            <T
              size={10}
              style={{
                color: selected === day.day ? theme.onAccent : theme.muted,
              }}
            >
              {historyDayPresentation(day, state.gameplay).mark}
            </T>
          </Touch>
        ))}
      </ScrollView>
      <T size={23} weight="600" style={{ marginBottom: 8 }}>
        {dateLabel(selected)}
      </T>
      <T size={12} muted style={{ marginBottom: 16 }}>
        {selected < journey.plan.startedAt
          ? "Запись из архива до начала текущего плана."
          : historyDayPresentation(current, state.gameplay).label}
      </T>
      {(selected < today || current.gameOutcome !== "open") &&
        current.changes.some((change) => change.late) && (
          <Panel style={{ marginBottom: 16 }}>
            <T size={12}>
              {historyDayPresentation(current, state.gameplay).lateNote}
            </T>
          </Panel>
        )}
      <View style={{ gap: 16 }}>
        {current.doses.map((d) => (
          <Panel key={d.slotId} style={{ gap: 12 }}>
            <T size={17} weight="600">
              {journey.plan.medication.name} · {d.label}
            </T>
            <T size={14}>
              {doseLabels[d.status]}
              {d.occurredAt ? " · " + d.occurredAt : ""}
            </T>
            {!!d.note && (
              <T size={13} muted>
                {d.note}
              </T>
            )}
            <Button
              title={"Изменить приём: " + d.label}
              secondary
              icon="edit"
              disabled={saving}
              onPress={() =>
                setDose({
                  slotId: d.slotId,
                  status: d.status,
                  time: d.occurredAt,
                  note: d.note,
                })
              }
            />
          </Panel>
        ))}
        {current.reports.slice(0, limit).map((r) => (
          <Panel key={r.id} style={{ gap: 12 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              {r.fields.feeling && (
                <FeelingCharacter point={r.fields.feeling} size={56} quiet />
              )}
              <View style={{ flex: 1 }}>
                <T size={17} weight="600">
                  {r.label || "Самочувствие"}
                </T>
                <T muted size={11}>
                  {r.required ? "Обязательный самоотчёт" : "Личный момент"}
                  {r.edited ? " · исправлен" : ""}
                </T>
              </View>
            </View>
            {r.fields.feeling && (
              <T size={12} muted>
                Приятность {r.fields.feeling.valence}/6 · энергия{" "}
                {r.fields.feeling.energy}/6
              </T>
            )}
            {!!r.fields.sleep && <T size={13}>Сон: {r.fields.sleep}</T>}
            {r.fields.anxiety !== undefined && (
              <T size={13}>Напряжение: {r.fields.anxiety}/10</T>
            )}
            {r.fields.functioning !== undefined && (
              <T size={13}>Повседневные дела: {r.fields.functioning}/10</T>
            )}
            {!!r.fields.tolerability && (
              <T size={13}>Переносимость: {r.fields.tolerability}</T>
            )}
            {!!r.note && <T size={14}>{r.note}</T>}
            <Button
              title="Редактировать запись"
              secondary
              icon="edit"
              disabled={saving}
              onPress={() => editReport(r.id)}
            />
            <Touch
              accessibilityRole="button"
              accessibilityLabel={"Удалить запись " + r.id}
              disabled={saving}
              onPress={() => removeReport(r.id, r.required)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <T muted size={12}>
                Удалить запись
              </T>
            </Touch>
          </Panel>
        ))}
        {current.legacy.slice(0, limit).map((r) => (
          <Panel key={r.id} style={{ gap: 10 }}>
            <T size={16} weight="600">
              {r.label ||
                moodOptions.find((m) => m.id === r.mood)?.label ||
                "Самочувствие"}
            </T>
            <T muted size={11}>
              Из предыдущей версии · {r.time}
            </T>
            {!!r.sleep && <T size={13}>Сон: {r.sleep}</T>}
            {!!r.note && <T size={14}>{r.note}</T>}
            <Button
              title="Редактировать архивную запись"
              secondary
              icon="edit"
              onPress={() => editReport("legacy:" + r.id)}
            />
            <Touch
              accessibilityRole="button"
              accessibilityLabel={"Удалить архивную запись " + r.id}
              disabled={saving}
              onPress={() => removeReport("legacy:" + r.id, false)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <T muted size={12}>
                Удалить запись
              </T>
            </Touch>
          </Panel>
        ))}
        {Math.max(current.reports.length, current.legacy.length) > limit && (
          <Button
            title="Показать ещё записи"
            secondary
            onPress={() => setLimit((v) => v + 20)}
          />
        )}
        {current.reports.length === 0 && current.legacy.length === 0 && (
          <Panel style={{ gap: 12 }}>
            <T size={16} weight="600">
              Пока без записи
            </T>
            <T muted size={13}>
              {journey.drafts["report:" + selected]
                ? "Есть незавершённый самоотчёт. Его можно продолжить."
                : "Здесь можно оставить самочувствие и заметку об этом дне."}
            </T>
            <Button
              title={
                selected === today
                  ? "Записать самочувствие"
                  : "Дополнить прошлую запись"
              }
              secondary
              onPress={() =>
                router.push({
                  pathname: "/check-in",
                  params: { day: selected },
                })
              }
            />
          </Panel>
        )}
        {current.reports.length > 0 && (
          <Button
            title="Добавить личный момент"
            secondary
            onPress={() =>
              router.push({
                pathname: "/check-in",
                params: { day: selected, personal: "1" },
              })
            }
          />
        )}
        {current.tests.map((test) => (
          <Panel key={test.id} style={{ gap: 8 }}>
            <T size={16} weight="600">
              Опрос {test.name}
            </T>
            <T size={13}>{test.status}</T>
          </Panel>
        ))}
        {current.contacts.map((contact) => (
          <Panel key={contact.id} style={{ gap: 8 }}>
            <T size={16} weight="600">
              Обращение о переносимости
            </T>
            <T size={14}>{contact.description}</T>
            <T muted size={12}>
              {contact.severity} · {contact.preference}
            </T>
            <T muted size={11}>
              Обращение сохранено.
            </T>
          </Panel>
        ))}
        {current.changes.length > 0 && (
          <Panel style={{ gap: 12 }}>
            <T size={17} weight="600">
              История исправлений
            </T>
            {current.changes.slice(0, limit).map((change) => (
              <View key={change.id} style={{ gap: 4 }}>
                <T size={12} weight="600">
                  {change.type} · {new Date(change.at).toLocaleString("ru-RU")}
                </T>
                <T size={12}>
                  {change.previous} → {change.current}
                </T>
                <T muted size={10}>
                  {change.author}
                </T>
              </View>
            ))}
          </Panel>
        )}
      </View>
      <View style={{ gap: 12, marginTop: 24 }}>
        <Button
          title="Сохранить историю в файл"
          secondary
          icon="history"
          onPress={() => {
            setFile(null);
            setExporting(true);
          }}
        />
        <Button
          title="Вопросы к следующему приёму"
          secondary
          icon="message"
          onPress={() => router.push("/questions")}
        />
      </View>
      {calendar && (
        <Sheet title="Выберите день" onClose={() => setCalendar(false)}>
          <HistoryCalendar
            month={month}
            onMonth={setMonth}
            selected={selected}
            first={first}
            today={today}
            recorded={recorded}
            onSelect={(day) => {
              if (day < from || day > end) setEnd(day);
              setSelected(day);
              setCalendar(false);
            }}
          />
        </Sheet>
      )}
      {dose && (
        <Sheet
          title={"Приём · " + dateLabel(selected)}
          onClose={() => setDose(null)}
        >
          <View style={{ gap: 16 }}>
            {(["taken", "missed", "unknown"] as const).map((status) => (
              <Chip
                key={status}
                label={doseLabels[status]}
                active={dose.status === status}
                onPress={() => setDose({ ...dose, status })}
              />
            ))}
            {dose.status === "taken" && (
              <>
                <T size={13}>Время, если помните</T>
                <TextInput
                  accessibilityLabel="Время фактического приёма"
                  value={dose.time}
                  onChangeText={(time) => setDose({ ...dose, time })}
                  placeholder="Например, 09:00"
                  placeholderTextColor={theme.muted}
                  maxLength={5}
                  style={fieldStyle}
                />
              </>
            )}
            <T size={13}>Комментарий</T>
            <TextInput
              accessibilityLabel="Комментарий к приёму"
              value={dose.note}
              onChangeText={(note) => setDose({ ...dose, note })}
              maxLength={1000}
              multiline
              style={[fieldStyle, { minHeight: 100 }]}
            />
            {selected < today && (
              <T size={12} muted>
                {state.gameplay
                  ? "Исправится факт в истории. Закрытый стрик и награды не изменятся."
                  : "Изменения сохранятся в истории."}
              </T>
            )}
            <Button
              title="Сохранить исправление"
              disabled={saving}
              onPress={() => void saveDose()}
            />
          </View>
        </Sheet>
      )}
      {exporting && (
        <Sheet
          title="Файл вашей истории"
          onClose={() => {
            if (!exportBusy) setExporting(false);
          }}
        >
          <View style={{ gap: 16 }}>
            <T size={14}>
              В файл войдут самочувствие, сон, заметки, отметки приёмов,
              обращения и факт прохождения опросов. Ответов, баллов и
              интерпретаций тестов в нём не будет.
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Chip
                label="Выбранный период"
                active={!allHistory}
                onPress={() => {
                  setAllHistory(false);
                  setFile(null);
                }}
              />
              <Chip
                label="Вся история"
                active={allHistory}
                onPress={() => {
                  setAllHistory(true);
                  setFile(null);
                }}
              />
            </View>
            <T size={12} muted>
              {allHistory ? first + " — " + today : from + " — " + end}
            </T>
            <Button
              title={exportBusy ? "Создаём файл…" : "Создать PDF"}
              disabled={exportBusy}
              onPress={() => void createExport("pdf")}
            />
            <Button
              title="Создать JSON"
              secondary
              disabled={exportBusy}
              onPress={() => void createExport("json")}
            />
            {!!file && (
              <>
                <T size={13} weight="600">
                  Файл сохранён в Синкли
                </T>
                <T selectable size={11} muted>
                  {file.name}
                </T>
                <Button
                  title="Сохранить копию в папку"
                  secondary
                  disabled={exportBusy}
                  onPress={() =>
                    void saveExportCopy(file)
                      .then((saved) => {
                        if (saved)
                          Alert.alert(
                            "Копия сохранена",
                            "Файл находится в выбранной вами папке.",
                          );
                      })
                      .catch(() =>
                        Alert.alert(
                          "Копия не сохранена",
                          "Файл остаётся в Синкли. Проверьте выбранную папку и свободное место.",
                        ),
                      )
                  }
                />
                <Button
                  title="Открыть меню сохранения файла"
                  secondary
                  onPress={() =>
                    void openExportShareSheet(file).catch(() =>
                      Alert.alert(
                        "Меню недоступно",
                        "Файл остаётся сохранённым в приложении.",
                      ),
                    )
                  }
                />
              </>
            )}
            <T size={11} muted>
              Файл создаётся на телефоне. Приложение не отправляет его
              автоматически.
            </T>
          </View>
        </Sheet>
      )}
    </Screen>
  );
}
