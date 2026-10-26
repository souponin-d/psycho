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
} from "../core/patientChannel";
import { useApp } from "./AppProvider";
const modeKey = "syncli.patient.connection-mode.v1";
type Mode = "demo" | "server" | null;
type Connection = {
  ready: boolean;
  mode: Mode;
  connected: boolean;
  opening: boolean;
  snapshot: PatientSnapshot | null;
  error: string;
  connect: (code: string) => Promise<void>;
  demo: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (text: string, id: string) => Promise<void>;
};
const Context = createContext<Connection | null>(null);
export function PatientConnectionProvider({ children }: PropsWithChildren) {
  const { isActive } = useApp();
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState<Mode>(null),
    [opening, setOpening] = useState(false),
    [snapshot, setSnapshot] = useState<PatientSnapshot | null>(null),
    [error, setError] = useState("");
  const channel = useRef<ReturnType<typeof createPatientChannel> | null>(null),
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
    };
  }, []);
  const connect = useCallback(async (code: string) => {
    const turn = ++generation.current;
    channel.current?.lock();
    setSnapshot(null);
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
      setMode("server");
      setSnapshot(data);
    } catch (e) {
      if (turn === generation.current) {
        channel.current?.lock();
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
    setSnapshot(null);
    setOpening(false);
    setError("");
    await AsyncStorage.setItem(modeKey, "demo");
    if (mounted.current) setMode("demo");
  }, []);
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
  const send = useCallback(async (text: string, id: string) => {
    const current = channel.current,
      turn = generation.current;
    if (!current?.authorized())
      throw new Error("Введите код приглашения для связи с врачом");
    try {
      const data = await current.send(text, id);
      if (turn !== generation.current || !mounted.current)
        throw new Error("Режим подключения изменился");
      setSnapshot(data);
      setError("");
    } catch (e) {
      if (turn === generation.current && mounted.current) {
        setError(e instanceof Error ? e.message : "Отправка не подтверждена");
        if (!current.authorized()) setSnapshot(null);
      }
      throw e;
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
        error,
        connect,
        demo,
        refresh,
        send,
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
