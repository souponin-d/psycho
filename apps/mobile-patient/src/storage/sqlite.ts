import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPatientRepository, type PatientRepository } from "./database";
import { instantNow } from "../core/calendar";

let opening: Promise<PatientRepository> | null = null;
export function openPatientRepository(): Promise<PatientRepository> {
  if (!opening)
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync("syncli-patient-v2.db");
      await db.execAsync(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS patient_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);",
      );
      return createPatientRepository(
        {
          async read() {
            return (
              (
                await db.getFirstAsync<{ payload: string }>(
                  "SELECT payload FROM patient_state WHERE id=1",
                )
              )?.payload ?? null
            );
          },
          async write(payload) {
            await db.withExclusiveTransactionAsync(async (transaction) => {
              await transaction.runAsync(
                "INSERT OR REPLACE INTO patient_state(id,payload) VALUES(1,?)",
                payload,
              );
            });
          },
        },
        () => AsyncStorage.getItem("syncli.patient.demo.v1"),
        instantNow,
      );
    })().catch((error) => {
      opening = null;
      throw error;
    });
  return opening;
}
