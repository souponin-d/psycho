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
import type {
  JourneyState,
  PatientCommand,
  OnboardingProgress,
} from "../core/journeyModel";
import { useApp } from "./AppProvider";
import { PatientValidationError } from "../core/patientErrors";
import type { PatientOutboxOwner } from "../core/patientOutbox";
import { patientProfileKey } from "../core/patientProfileKey";
import { usePatientConnection } from "./PatientConnectionProvider";

const Context = createContext<{
  journey: JourneyState | null;
  ready: boolean;
  saving: boolean;
  error: string;
  act: (command: PatientCommand) => Promise<boolean>;
  retry: () => void;
} | null>(null);

export function JourneyProvider({
  children,
  owner = null,
  onboarding,
}: PropsWithChildren<{
  owner?: PatientOutboxOwner | null;
  onboarding?: OnboardingProgress;
}>) {
  const { today, isActive } = useApp();
  const connection = usePatientConnection();
  const scope = patientProfileKey(owner);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const repositoryScope = useRef<string | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
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
    setReady(false);
    failed.current = null;
    openPatientRepository(owner, undefined, onboarding)
      .then(async (repo) => {
        const state = await repo.load();
        if (alive) {
          repository.current = repo;
          repositoryScope.current = scope;
          setLoadedScope(scope);
          setJourney(state);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) {
          repository.current = null;
          repositoryScope.current = null;
          setLoadedScope(scope);
          setJourney(null);
          setError(
            e instanceof Error ? e.message : "Не удалось открыть записи",
          );
        }
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt, owner, onboarding, scope]);
  const act = useCallback(async (command: PatientCommand) => {
    const repo = repository.current;
    const turn = activeScope.current;
    if (!repo || repositoryScope.current !== turn || failed.current)
      return false;
    inFlight.current++;
    setSaving(true);
    try {
      const state = await repo.apply(command);
      if (mounted.current && activeScope.current === turn) {
        setJourney(state);
        setError("");
      }
      return mounted.current && activeScope.current === turn;
    } catch (e) {
      if (
        activeScope.current === turn &&
        !(e instanceof PatientValidationError)
      )
        failed.current = command;
      if (mounted.current && activeScope.current === turn)
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
  }, [today, isActive, ready, loadedScope, scope, act]);
  useEffect(() => {
    const reports = connection.snapshot?.reports;
    if (
      owner &&
      connection.connected &&
      ready &&
      loadedScope === scope &&
      connection.owner &&
      patientProfileKey(connection.owner) === scope &&
      (reports?.kind === "ready" || reports?.kind === "partial")
    )
      void act({ type: "server:reports", reports: reports.reports });
  }, [
    owner,
    connection.connected,
    connection.owner,
    connection.snapshot?.reports,
    ready,
    loadedScope,
    scope,
    act,
  ]);
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
    <Context.Provider
      value={{
        journey,
        ready: ready && loadedScope === scope,
        saving,
        error,
        act,
        retry,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useJourney() {
  const context = useContext(Context);
  if (!context) throw new Error("JourneyProvider is required");
  return context;
}
