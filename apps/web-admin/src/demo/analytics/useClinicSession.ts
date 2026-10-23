import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { defaultFilter, validFilter } from "./aggregate";
import { DEMO_DAY } from "./fixtures";
import {
  initialClinicSession,
  projectClinic,
  reduceClinicSession,
  restoreClinicSession,
  serializeClinicSession,
} from "./session";
import type { ClinicDataset, ClinicFilter, DemoCommand } from "./model";

/** The demo is tab-scoped. No cross-tab or phone delivery is implied. */
export function useClinicSession(data: ClinicDataset) {
  const key = `syncli.analytics.demo.v1.${data.scenario}`;
  const blocked = useRef(false);
  const [writeAttempt, setWriteAttempt] = useState(0);
  const [storageStatus, setStorageStatus] = useState(
    "Сеанс сохранён в этой вкладке",
  );
  const [state, dispatch] = useReducer(
    (
      current: ReturnType<typeof initialClinicSession>,
      action: Parameters<typeof reduceClinicSession>[2],
    ) => reduceClinicSession(data, current, action),
    undefined,
    () => {
      let initial;
      try {
        initial = restoreClinicSession(sessionStorage.getItem(key), data);
      } catch {
        initial = {
          ...initialClinicSession(),
          error:
            "Не удалось прочитать сохранение. Демо работает в памяти; сохранённые данные не перезаписываются.",
        };
      }
      if (initial.error) blocked.current = true;
      const params = new URLSearchParams(window.location.search);
      const filter = { ...initial.filter };
      for (const field of [
        "from",
        "to",
        "departmentId",
        "doctorId",
        "group",
      ] as const)
        if (params.has(field)) filter[field] = params.get(field)!;
      return { ...initial, filter: validFilter(data, filter) };
    },
  );
  useEffect(() => {
    if (blocked.current) {
      setStorageStatus("Сохранение заблокировано до явного сброса");
      return;
    }
    try {
      sessionStorage.setItem(key, serializeClinicSession(state));
      setStorageStatus("Сеанс сохранён в этой вкладке");
    } catch {
      setStorageStatus(
        "Не удалось сохранить. Действия остаются в памяти до перезагрузки.",
      );
    }
  }, [key, state.commands, state.filter, writeAttempt]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("dataset", data.scenario);
    for (const [field, value] of Object.entries(state.filter))
      url.searchParams.set(field, value);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [data.scenario, state.filter]);
  const projected = useMemo(
    () => projectClinic(data, state.commands),
    [data, state.commands],
  );
  function send(
    command:
      | Omit<Extract<DemoCommand, { kind: "report" }>, "id" | "at">
      | Omit<Extract<DemoCommand, { kind: "accept" | "respond" }>, "id" | "at">
      | Omit<Extract<DemoCommand, { kind: "schedule" }>, "id" | "at">
      | Omit<Extract<DemoCommand, { kind: "roles" }>, "id" | "at">
      | Omit<Extract<DemoCommand, { kind: "request" }>, "id" | "at">,
  ) {
    dispatch({
      type: "command",
      command: {
        ...command,
        id: `demo-action-${crypto.randomUUID()}`,
        at: new Date(
          Date.parse(`${DEMO_DAY}T12:00:00Z`) +
            (state.commands.length + 1) * 10000,
        ).toISOString(),
      } as DemoCommand,
    });
  }
  const reset = () => {
    blocked.current = false;
    dispatch({ type: "reset" });
  };
  const setFilter = (patch: Partial<ClinicFilter>) =>
    dispatch({ type: "filter", patch });
  return {
    state,
    projected,
    send,
    setFilter,
    reset,
    storageStatus,
    defaultFilter,
    retrySave: () => setWriteAttempt((value) => value + 1),
  };
}
export type ClinicController = ReturnType<typeof useClinicSession>;
