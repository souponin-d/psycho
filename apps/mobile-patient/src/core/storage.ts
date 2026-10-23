import { restoreState, type AppState } from "./model.ts";
export interface StoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export function createStorage(port: StoragePort) {
  const key = "syncli.patient.demo.v1";
  let readSucceeded = false;
  let queue = Promise.resolve();
  return {
    async read(): Promise<AppState> {
      readSucceeded = false;
      const raw = await port.getItem(key);
      readSucceeded = true;
      return restoreState(raw);
    },
    write(state: AppState): Promise<void> {
      if (!readSucceeded)
        return Promise.reject(new Error("Read must succeed before saving"));
      const snapshot = JSON.stringify(state);
      queue = queue.catch(() => {}).then(() => port.setItem(key, snapshot));
      return queue;
    },
  };
}
