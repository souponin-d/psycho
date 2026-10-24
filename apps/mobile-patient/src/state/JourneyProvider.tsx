import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { openPatientRepository } from "../storage/sqlite";
import type { PatientRepository } from "../storage/database";
import type { JourneyState, PatientCommand } from "../core/journeyModel";
import { useApp } from "./AppProvider";
import { PatientValidationError } from "../core/patientErrors";

const Context = createContext<{
  journey: JourneyState | null;
  ready: boolean;
  saving: boolean;
  error: string;
  act: (command: PatientCommand) => Promise<boolean>;
  retry: () => void;
} | null>(null);

export function JourneyProvider({ children }: PropsWithChildren) {
  const { today, isActive } = useApp();
  const [journey, setJourney] = useState<JourneyState | null>(null);
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const repository = useRef<PatientRepository | null>(null);
  const failed = useRef<PatientCommand | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    openPatientRepository()
      .then(async (repo) => {
        const state = await repo.load();
        if (alive) {
          repository.current = repo;
          setJourney(state);
          setError("");
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Не удалось открыть записи",
          );
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const act = useCallback(async (command: PatientCommand) => {
    const repo = repository.current;
    if (!repo || failed.current) return false;
    inFlight.current++;
    setSaving(true);
    try {
      const state = await repo.apply(command);
      if (mounted.current) {
        setJourney(state);
        setError("");
      }
      return true;
    } catch (e) {
      if (!(e instanceof PatientValidationError)) failed.current = command;
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Не удалось сохранить запись",
        );
      return false;
    } finally {
      inFlight.current--;
      if (mounted.current) setSaving(inFlight.current > 0);
    }
  }, []);
  useEffect(() => {
    if (isActive && repository.current) void act({ type: "tick" });
  }, [today, isActive, ready, act]);
  const retry = useCallback(() => {
    const command = failed.current;
    failed.current = null;
    if (command) void act(command);
    else if (repository.current) setError("");
    else {
      setReady(false);
      setAttempt((n) => n + 1);
    }
  }, [act]);
  return (
    <Context.Provider value={{ journey, ready, saving, error, act, retry }}>
      {children}
    </Context.Provider>
  );
}
export function useJourney() {
  const context = useContext(Context);
  if (!context) throw new Error("JourneyProvider is required");
  return context;
}
