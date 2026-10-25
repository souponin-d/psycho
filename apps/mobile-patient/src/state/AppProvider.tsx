import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
} from "react";
import { AccessibilityInfo, AppState as NativeAppState } from "react-native";
import { dayKey } from "../config/content";
import {
  createDefaultState,
  reduceState,
  type Action,
  type AppState,
} from "../core/model";
import { themes } from "../theme/themes";
import { createStorage } from "../core/storage";

const Context = createContext<{
  state: AppState;
  dispatch: Dispatch<Action>;
  ready: boolean;
  reducedMotion: boolean;
  storageError: boolean;
  retrySave: () => void;
  today: string;
  isActive: boolean;
} | null>(null);
export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(
    reduceState,
    undefined,
    createDefaultState,
  );
  const [ready, setReady] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [today, setToday] = useState(dayKey());
  const [isActive, setIsActive] = useState(
    NativeAppState.currentState === "active",
  );
  const store = useRef(createStorage(AsyncStorage)).current;
  const [readAttempt, setReadAttempt] = useState(0);
  const [readSucceeded, setReadSucceeded] = useState(false);
  useEffect(() => {
    let alive = true;
    store
      .read()
      .then((restored) => {
        if (alive) {
          dispatch({ type: "restore", state: restored });
          setReadSucceeded(true);
          setStorageError(false);
        }
      })
      .catch(() => {
        if (alive) setStorageError(true);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setSystemReduced(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReduced,
    );
    const foreground = NativeAppState.addEventListener("change", (status) => {
      setIsActive(status === "active");
      setToday(dayKey());
    });
    const timer = setInterval(() => setToday(dayKey()), 30000);
    return () => {
      alive = false;
      motion.remove();
      foreground.remove();
      clearInterval(timer);
    };
  }, [store, readAttempt]);
  useEffect(() => {
    if (!ready || !readSucceeded) return;
    let alive = true;
    store
      .write(state)
      .then(() => {
        if (alive) setStorageError(false);
      })
      .catch(() => {
        if (alive) setStorageError(true);
      });
    return () => {
      alive = false;
    };
  }, [state, ready, readSucceeded, saveAttempt, store]);
  return (
    <Context.Provider
      value={{
        state,
        dispatch,
        ready,
        reducedMotion: systemReduced || !state.motion,
        storageError,
        retrySave: () =>
          readSucceeded
            ? setSaveAttempt((n) => n + 1)
            : setReadAttempt((n) => n + 1),
        today,
        isActive,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("AppProvider is required");
  return { ...context, theme: themes[context.state.theme] };
}
