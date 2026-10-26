import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  createPatientChannel,
  type PatientSnapshot,
  type PatientDoseUpdate,
} from "../core/patientChannel";
import { createPatientMessageSync } from "../core/patientMessageSync";
import {
  createPatientDoseSync,
  DoseQueuedError,
} from "../core/patientDoseSync";
import { PatientApiError } from "../core/patientGateway";
import {
  createPatientReportSync,
  ReportQueuedError,
  type PatientReport,
} from "../core/patientReportSync";
import {
  createPatientQuestionnaireSync,
  QuestionnaireQueuedError,
  type PatientQuestionnaireResult,
} from "../core/patientQuestionnaireSync";
import {
  createPatientOutbox,
  type PatientOutboxCommand,
  type PatientOutboxOwner,
} from "../core/patientOutbox";
import { useApp } from "./AppProvider";
const modeKey = "syncli.patient.connection-mode.v1";
type Mode = "demo" | "server" | null;
type Connection = {
  ready: boolean;
  mode: Mode;
  connected: boolean;
  opening: boolean;
  snapshot: PatientSnapshot | null;
  owner: PatientOutboxOwner | null;
  error: string;
  pendingMessages: PatientOutboxCommand[];
  pendingDoses: PatientOutboxCommand[];
  doseError: string;
  pendingReports: PatientOutboxCommand[];
  reportError: string;
  pendingQuestionnaires: PatientOutboxCommand[];
  questionnaireError: string;
  connect: (code: string) => Promise<void>;
  demo: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (text: string, id: string) => Promise<void>;
  markDose: (value: PatientDoseUpdate, id: string) => Promise<void>;
  cancelPendingDose: (id: string) => Promise<void>;
  sendReport: (value: PatientReport) => Promise<void>;
  cancelPendingReport: (id: string) => Promise<void>;
  sendQuestionnaire: (value: PatientQuestionnaireResult) => Promise<void>;
  cancelPendingQuestionnaire: (id: string) => Promise<void>;
  resetConnection: () => Promise<void>;
};
const Context = createContext<Connection | null>(null);
export function PatientConnectionProvider({ children }: PropsWithChildren) {
  const { isActive } = useApp();
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState<Mode>(null),
    [opening, setOpening] = useState(false),
    [snapshot, setSnapshot] = useState<PatientSnapshot | null>(null),
    [owner, setOwner] = useState<PatientOutboxOwner | null>(null),
    [pendingMessages, setPendingMessages] = useState<PatientOutboxCommand[]>(
      [],
    ),
    [pendingDoses, setPendingDoses] = useState<PatientOutboxCommand[]>([]),
    [doseError, setDoseError] = useState(""),
    [pendingReports, setPendingReports] = useState<PatientOutboxCommand[]>([]),
    [reportError, setReportError] = useState(""),
    [pendingQuestionnaires, setPendingQuestionnaires] = useState<
      PatientOutboxCommand[]
    >([]),
    [questionnaireError, setQuestionnaireError] = useState(""),
    [error, setError] = useState("");
  const channel = useRef<ReturnType<typeof createPatientChannel> | null>(null),
    messageSync = useRef<ReturnType<typeof createPatientMessageSync> | null>(
      null,
    ),
    doseSync = useRef<ReturnType<typeof createPatientDoseSync> | null>(null),
    doseBlocked = useRef(false),
    reportSync = useRef<ReturnType<typeof createPatientReportSync> | null>(
      null,
    ),
    reportBlocked = useRef(false),
    questionnaireSync = useRef<ReturnType<
      typeof createPatientQuestionnaireSync
    > | null>(null),
    questionnaireBlocked = useRef(false),
    generation = useRef(0),
    refreshing = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    AsyncStorage.getItem(modeKey)
      .then((value) => {
        if (mounted.current)
          setMode(value === "demo" || value === "server" ? value : null);
      })
      .catch(() => {
        if (mounted.current) setError("Не удалось прочитать режим подключения");
      })
      .finally(() => {
        if (mounted.current) setReady(true);
      });
    return () => {
      mounted.current = false;
      generation.current++;
      channel.current?.lock();
      messageSync.current = null;
      doseSync.current = null;
      reportSync.current = null;
      questionnaireSync.current = null;
    };
  }, []);
  const connect = useCallback(async (code: string) => {
    const turn = ++generation.current;
    channel.current?.lock();
    messageSync.current = null;
    doseSync.current = null;
    reportSync.current = null;
    questionnaireSync.current = null;
    doseBlocked.current = false;
    reportBlocked.current = false;
    questionnaireBlocked.current = false;
    setSnapshot(null);
    setOwner(null);
    setPendingMessages([]);
    setPendingDoses([]);
    setDoseError("");
    setPendingReports([]);
    setReportError("");
    setPendingQuestionnaires([]);
    setQuestionnaireError("");
    setOpening(true);
    setError("");
    try {
      const baseUrl = process.env.EXPO_PUBLIC_PATIENT_API_ORIGIN;
      if (!baseUrl)
        throw new Error(
          "Адрес сервера ещё не настроен. Демо-режим доступен отдельно.",
        );
      const next = createPatientChannel({
        baseUrl,
        allowLocalHttp: process.env.EXPO_PUBLIC_PATIENT_LOCAL_HTTP === "1",
      });
      channel.current = next;
      const data = await next.connect(code);
      if (turn !== generation.current || !mounted.current) return;
      await AsyncStorage.setItem(modeKey, "server");
      if (turn !== generation.current || !mounted.current) return;
      const owner = next.owner();
      if (!owner) throw new Error("Не удалось подтвердить владельца записей");
      const sync = createPatientMessageSync(AsyncStorage, owner, {
        currentOwner: () => next.owner(),
        send: async (text, id) => {
          const updated = await next.send(text, id);
          if (turn !== generation.current || !mounted.current)
            throw new Error("Режим подключения изменился");
          setSnapshot(updated);
        },
      });
      const pending = await sync.pending();
      const doses = createPatientDoseSync(AsyncStorage, owner, {
        currentOwner: () => next.owner(),
        send: async (value, id) => {
          const updated = await next.markDose(value, id);
          if (turn !== generation.current || !mounted.current)
            throw new Error("Режим подключения изменился");
          setSnapshot(updated);
        },
      });
      const pendingDoseItems = await doses.pending();
      const reports = createPatientReportSync(AsyncStorage, owner, {
        currentOwner: () => next.owner(),
        send: async (value, id) => {
          const updated = await next.sendReport(value, id);
          if (turn !== generation.current || !mounted.current)
            throw new Error("Режим подключения изменился");
          setSnapshot(updated);
        },
      });
      const pendingReportItems = await reports.pending();
      const questionnaires = createPatientQuestionnaireSync(
        AsyncStorage,
        owner,
        {
          currentOwner: () => next.owner(),
          send: async (value, id) => {
            const updated = await next.sendQuestionnaire(value, id);
            if (turn !== generation.current || !mounted.current)
              throw new Error("Режим подключения изменился");
            setSnapshot(updated);
          },
        },
      );
      const pendingQuestionnaireItems = await questionnaires.pending();
      if (turn !== generation.current || !mounted.current) return;
      messageSync.current = sync;
      doseSync.current = doses;
      reportSync.current = reports;
      questionnaireSync.current = questionnaires;
      setPendingMessages(pending);
      setPendingDoses(pendingDoseItems);
      setPendingReports(pendingReportItems);
      setPendingQuestionnaires(pendingQuestionnaireItems);
      setMode("server");
      setOwner(owner);
      setSnapshot(data);
    } catch (e) {
      if (turn === generation.current) {
        channel.current?.lock();
        messageSync.current = null;
        doseSync.current = null;
        reportSync.current = null;
        questionnaireSync.current = null;
        const message =
          e instanceof Error ? e.message : "Не удалось подключиться";
        if (mounted.current) setError(message);
        throw new Error(message);
      }
    } finally {
      if (turn === generation.current && mounted.current) setOpening(false);
    }
  }, []);
  const demo = useCallback(async () => {
    generation.current++;
    channel.current?.lock();
    channel.current = null;
    messageSync.current = null;
    doseSync.current = null;
    reportSync.current = null;
    questionnaireSync.current = null;
    doseBlocked.current = false;
    reportBlocked.current = false;
    questionnaireBlocked.current = false;
    setSnapshot(null);
    setOwner(null);
    setPendingMessages([]);
    setPendingDoses([]);
    setDoseError("");
    setPendingReports([]);
    setReportError("");
    setPendingQuestionnaires([]);
    setQuestionnaireError("");
    setOpening(false);
    setError("");
    await AsyncStorage.setItem(modeKey, "demo");
    if (mounted.current) setMode("demo");
  }, []);
  const resetConnection = useCallback(async () => {
    const previous = channel.current?.owner() ?? owner;
    generation.current++;
    channel.current?.lock();
    channel.current = null;
    messageSync.current = null;
    doseSync.current = null;
    reportSync.current = null;
    questionnaireSync.current = null;
    doseBlocked.current = false;
    reportBlocked.current = false;
    questionnaireBlocked.current = false;
    setSnapshot(null);
    setOwner(null);
    setPendingMessages([]);
    setPendingDoses([]);
    setPendingReports([]);
    setPendingQuestionnaires([]);
    setDoseError("");
    setReportError("");
    setQuestionnaireError("");
    setError("");
    setOpening(false);
    if (previous)
      for (const stream of ["messages", "doses", "reports", "questionnaires"])
        await createPatientOutbox(AsyncStorage, previous, stream).clear();
    await AsyncStorage.removeItem(modeKey);
    if (mounted.current) setMode(null);
  }, [owner]);
  const refresh = useCallback(async () => {
    const current = channel.current,
      turn = generation.current;
    if (!current?.authorized() || refreshing.current) return;
    refreshing.current = true;
    try {
      const data = await current.read();
      if (turn === generation.current && mounted.current) {
        setSnapshot(data);
        setError("");
      }
      const sync = messageSync.current;
      if (turn === generation.current && mounted.current && sync) {
        try {
          await sync.retry();
        } catch (e) {
          if (turn === generation.current && mounted.current)
            setError(
              e instanceof Error ? e.message : "Не удалось отправить сообщение",
            );
        } finally {
          const pending = await sync.pending();
          if (turn === generation.current && mounted.current)
            setPendingMessages(pending);
        }
      }
      const doses = doseSync.current;
      if (
        turn === generation.current &&
        mounted.current &&
        doses &&
        !doseBlocked.current
      ) {
        try {
          await doses.retry();
          if (turn === generation.current && mounted.current) setDoseError("");
        } catch (e) {
          if (
            turn === generation.current &&
            e instanceof PatientApiError &&
            [400, 403, 409].includes(e.status)
          )
            doseBlocked.current = true;
          if (turn === generation.current && mounted.current)
            setDoseError(
              doseBlocked.current
                ? "Отметка не принята сервером. Проверьте назначение."
                : "Отметка ожидает отправки.",
            );
        } finally {
          const pending = await doses.pending();
          if (turn === generation.current && mounted.current)
            setPendingDoses(pending);
        }
      }
      const reports = reportSync.current;
      if (
        turn === generation.current &&
        mounted.current &&
        reports &&
        !reportBlocked.current
      ) {
        try {
          await reports.retry();
          if (turn === generation.current && mounted.current)
            setReportError("");
        } catch (e) {
          if (
            turn === generation.current &&
            e instanceof PatientApiError &&
            [400, 403, 409].includes(e.status)
          )
            reportBlocked.current = true;
          if (turn === generation.current && mounted.current)
            setReportError(
              reportBlocked.current
                ? "Самоотчёт не принят сервером. Проверьте запись."
                : "Самоотчёт ожидает отправки.",
            );
        } finally {
          const pending = await reports.pending();
          if (turn === generation.current && mounted.current)
            setPendingReports(pending);
        }
      }
      const questionnaires = questionnaireSync.current;
      if (
        turn === generation.current &&
        mounted.current &&
        questionnaires &&
        !questionnaireBlocked.current
      ) {
        try {
          await questionnaires.retry();
          if (turn === generation.current && mounted.current)
            setQuestionnaireError("");
        } catch (e) {
          if (
            turn === generation.current &&
            e instanceof PatientApiError &&
            [400, 403, 409].includes(e.status)
          )
            questionnaireBlocked.current = true;
          if (turn === generation.current && mounted.current)
            setQuestionnaireError(
              questionnaireBlocked.current
                ? "Ответы не приняты сервером. Проверьте задание."
                : "Ответы опроса ожидают отправки.",
            );
        } finally {
          const pending = await questionnaires.pending();
          if (turn === generation.current && mounted.current)
            setPendingQuestionnaires(pending);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      if (turn === generation.current && mounted.current) {
        setError(
          e instanceof Error ? e.message : "Не удалось обновить сообщения",
        );
        if (!current.authorized()) setSnapshot(null);
      }
    } finally {
      refreshing.current = false;
    }
  }, []);
  const markDose = useCallback(async (value: PatientDoseUpdate, id: string) => {
    const current = channel.current,
      sync = doseSync.current,
      turn = generation.current;
    if (!current?.authorized() || !sync)
      throw new Error("Введите код приглашения");
    if (doseBlocked.current)
      throw new Error("Сначала проверьте неотправленную отметку");
    try {
      await sync.mark(value, id);
      if (turn === generation.current && mounted.current) setDoseError("");
    } catch (e) {
      if (
        turn === generation.current &&
        e instanceof DoseQueuedError &&
        [400, 403, 409].includes(e.status)
      )
        doseBlocked.current = true;
      if (turn === generation.current && mounted.current)
        setDoseError(
          doseBlocked.current
            ? "Отметка не принята сервером. Проверьте назначение."
            : e instanceof Error
              ? e.message
              : "Отметка ожидает отправки.",
        );
      throw e;
    } finally {
      const pending = await sync.pending();
      if (turn === generation.current && mounted.current)
        setPendingDoses(pending);
    }
  }, []);
  const cancelPendingDose = useCallback(async (id: string) => {
    const sync = doseSync.current,
      turn = generation.current;
    if (!sync || !doseBlocked.current)
      throw new Error("Отменить можно только отклонённую отметку");
    const current = await sync.pending();
    if (current[0]?.commandId !== id)
      throw new Error("Эта отметка ещё не проверена сервером");
    await sync.cancel(id);
    const pending = await sync.pending();
    if (turn === generation.current && mounted.current) {
      doseBlocked.current = false;
      setPendingDoses(pending);
      setDoseError("");
    }
  }, []);
  const sendReport = useCallback(async (value: PatientReport) => {
    const current = channel.current,
      sync = reportSync.current,
      turn = generation.current;
    if (!current?.authorized() || !sync)
      throw new Error("Введите код приглашения");
    if (reportBlocked.current)
      throw new Error("Сначала проверьте неотправленный самоотчёт");
    try {
      await sync.send(value);
      if (turn === generation.current && mounted.current) setReportError("");
    } catch (e) {
      if (
        turn === generation.current &&
        e instanceof ReportQueuedError &&
        [400, 403, 409].includes(e.status)
      )
        reportBlocked.current = true;
      if (turn === generation.current && mounted.current)
        setReportError(
          reportBlocked.current
            ? "Самоотчёт не принят сервером. Проверьте запись."
            : e instanceof Error
              ? e.message
              : "Самоотчёт ожидает отправки.",
        );
      throw e;
    } finally {
      const pending = await sync.pending();
      if (turn === generation.current && mounted.current)
        setPendingReports(pending);
    }
  }, []);
  const cancelPendingReport = useCallback(async (id: string) => {
    const sync = reportSync.current,
      turn = generation.current;
    if (!sync || !reportBlocked.current)
      throw new Error("Отменить можно только отклонённый самоотчёт");
    const current = await sync.pending();
    if (current[0]?.commandId !== id)
      throw new Error("Эта запись ещё не проверена сервером");
    await sync.cancel(id);
    const pending = await sync.pending();
    if (turn === generation.current && mounted.current) {
      reportBlocked.current = false;
      setPendingReports(pending);
      setReportError("");
    }
  }, []);
  const sendQuestionnaire = useCallback(
    async (value: PatientQuestionnaireResult) => {
      const current = channel.current,
        sync = questionnaireSync.current,
        turn = generation.current;
      if (!current?.authorized() || !sync)
        throw new Error("Введите код приглашения");
      if (questionnaireBlocked.current)
        throw new Error("Сначала проверьте неотправленный опрос");
      try {
        await sync.send(value);
        if (turn === generation.current && mounted.current)
          setQuestionnaireError("");
      } catch (e) {
        if (
          turn === generation.current &&
          e instanceof QuestionnaireQueuedError &&
          [400, 403, 409].includes(e.status)
        )
          questionnaireBlocked.current = true;
        if (turn === generation.current && mounted.current)
          setQuestionnaireError(
            questionnaireBlocked.current
              ? "Ответы не приняты сервером. Проверьте задание."
              : e instanceof Error
                ? e.message
                : "Ответы ожидают отправки.",
          );
        throw e;
      } finally {
        const pending = await sync.pending();
        if (turn === generation.current && mounted.current)
          setPendingQuestionnaires(pending);
      }
    },
    [],
  );
  const cancelPendingQuestionnaire = useCallback(async (id: string) => {
    const sync = questionnaireSync.current,
      turn = generation.current;
    if (!sync || !questionnaireBlocked.current)
      throw new Error("Отменить можно только отклонённый опрос");
    const current = await sync.pending();
    if (current[0]?.commandId !== id)
      throw new Error("Эта запись ещё не проверена сервером");
    await sync.cancel(id);
    const pending = await sync.pending();
    if (turn === generation.current && mounted.current) {
      questionnaireBlocked.current = false;
      setPendingQuestionnaires(pending);
      setQuestionnaireError("");
    }
  }, []);
  const send = useCallback(async (text: string, id: string) => {
    const current = channel.current,
      sync = messageSync.current,
      turn = generation.current;
    if (!current?.authorized() || !sync)
      throw new Error("Введите код приглашения для связи с врачом");
    try {
      await sync.send(text, id);
      if (turn !== generation.current || !mounted.current)
        throw new Error("Режим подключения изменился");
      setError("");
    } catch (e) {
      if (turn === generation.current && mounted.current) {
        setError(e instanceof Error ? e.message : "Отправка не подтверждена");
        if (!current.authorized()) setSnapshot(null);
      }
      throw e;
    } finally {
      const pending = await sync.pending();
      if (turn === generation.current && mounted.current)
        setPendingMessages(pending);
    }
  }, []);
  const connected =
    mode === "server" && !!snapshot && !!channel.current?.authorized();
  useEffect(() => {
    if (!connected || !isActive) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [connected, isActive, refresh]);
  return (
    <Context.Provider
      value={{
        ready,
        mode,
        connected,
        opening,
        snapshot,
        owner,
        error,
        pendingMessages,
        pendingDoses,
        doseError,
        pendingReports,
        reportError,
        pendingQuestionnaires,
        questionnaireError,
        connect,
        demo,
        refresh,
        send,
        markDose,
        cancelPendingDose,
        sendReport,
        cancelPendingReport,
        sendQuestionnaire,
        cancelPendingQuestionnaire,
        resetConnection,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePatientConnection() {
  const context = useContext(Context);
  if (!context) throw new Error("PatientConnectionProvider is required");
  return context;
}
