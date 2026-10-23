import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, Mutation, PatientRecord, Profile } from "./model";
import { ApiError, type Repository } from "./repository";

export function useWorkspace(repository: Repository) {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [sessionExpired, updateSessionExpired] = useState(false);
  const expired = useRef(false);
  const setSessionExpired = useCallback((value: boolean) => {
    expired.current = value;
    updateSessionExpired(value);
  }, []);
  const current = useRef(patients);
  current.current = patients;
  const pending = useRef(false);
  const uncertain = useRef(new Map<string, Command>());
  const creations = useRef(new Map<string, string>());
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    if (pending.current || expired.current) return;
    const revision = generation.current;
    const sequence = ++refreshSequence.current;
    try {
      const data = await repository.list();
      if (
        expired.current ||
        pending.current ||
        revision !== generation.current ||
        sequence !== refreshSequence.current
      )
        return;
      current.current = data;
      setPatients(data);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setSessionExpired(true);
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    void refresh();
    const check = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    const timer = window.setInterval(check, 10000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(
        `doctor-updates-${repository.mode}-${repository.actor.id}`,
      );
      channel.current.onmessage = check;
    }
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      channel.current?.close();
      channel.current = null;
    };
  }, [refresh]);
  const update = (value: PatientRecord) => {
    generation.current++;
    current.current = current.current.map((p) =>
      p.id === value.id ? value : p,
    );
    setPatients(current.current);
    setSavedAt(new Date().toISOString());
    channel.current?.postMessage("changed");
  };
  const mutate = useCallback(
    async (id: string, mutation: Mutation, expectedRevision?: number) => {
      if (expired.current)
        throw new ApiError(
          "Сессия завершилась. Войдите повторно, чтобы сохранить черновик.",
          401,
        );
      if (pending.current)
        throw new Error("Дождитесь завершения предыдущего сохранения.");
      const patient = current.current.find((p) => p.id === id);
      if (!patient) throw new Error("Пациент не найден.");
      pending.current = true;
      setBusy(true);
      setError("");
      const key = `${id}:${JSON.stringify(mutation)}`;
      const command = uncertain.current.get(key) ?? {
        commandId: crypto.randomUUID(),
        expectedRevision: expectedRevision ?? patient.revision,
        mutation,
      };
      uncertain.current.set(key, command);
      try {
        const value = await repository.execute(id, command);
        uncertain.current.delete(key);
        update(value);
        return value;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setSessionExpired(true);
        if (!(e instanceof ApiError) || (e.status >= 400 && e.status < 500))
          uncertain.current.delete(key);
        setError(message(e));
        throw e;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [repository],
  );
  const create = useCallback(
    async (profile: Partial<Profile>) => {
      if (expired.current)
        throw new ApiError(
          "Сессия завершилась. Войдите повторно, чтобы сохранить данные.",
          401,
        );
      if (pending.current) throw new Error("Дождитесь предыдущего сохранения.");
      pending.current = true;
      setBusy(true);
      setError("");
      const key = JSON.stringify(profile);
      const id = creations.current.get(key) ?? crypto.randomUUID();
      creations.current.set(key, id);
      try {
        const value = await repository.create(profile, id);
        creations.current.delete(key);
        generation.current++;
        current.current = [
          value,
          ...current.current.filter((p) => p.id !== value.id),
        ];
        setPatients(current.current);
        setSavedAt(new Date().toISOString());
        channel.current?.postMessage("changed");
        return value;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setSessionExpired(true);
        if (!(e instanceof ApiError) || (e.status >= 400 && e.status < 500))
          creations.current.delete(key);
        setError(message(e));
        throw e;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [repository],
  );
  return {
    sessionExpired,
    setSessionExpired,
    actor: repository.actor,
    patients,
    loading,
    error,
    setError,
    busy,
    savedAt,
    refresh,
    mutate,
    create,
  };
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Действие не выполнено. Повторите попытку.";
}
export type WorkspaceActions = ReturnType<typeof useWorkspace>;
