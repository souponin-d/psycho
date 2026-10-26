import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createPatientRepository, type PatientRepository } from "./database";
import { instantNow } from "../core/calendar";
import type { PatientOutboxOwner } from "../core/patientOutbox";
import { patientProfileKey } from "../core/patientProfileKey";
import { createServerJourney } from "../core/serverJourney";
import { createScopedSnapshot } from "./scopedSnapshot";
import type { WorldState, OnboardingProgress } from "../core/journeyModel";

const openings = new Map<string, Promise<PatientRepository>>();
export function openPatientRepository(
  owner: PatientOutboxOwner | null = null,
  initialWorld?: WorldState,
  onboarding?: OnboardingProgress,
): Promise<PatientRepository> {
  const key = patientProfileKey(owner);
  const world = initialWorld
    ? (JSON.parse(JSON.stringify(initialWorld)) as WorldState)
    : undefined;
  let opening = openings.get(key);
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync("syncli-patient-v2.db");
      await db.execAsync(
        "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS patient_state(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS patient_profiles(scope TEXT PRIMARY KEY, payload TEXT NOT NULL);",
      );
      if (owner) {
        const scoped = createScopedSnapshot(
          {
            async read(scope) {
              return (
                (
                  await db.getFirstAsync<{ payload: string }>(
                    "SELECT payload FROM patient_profiles WHERE scope=?",
                    scope,
                  )
                )?.payload ?? null
              );
            },
            async write(scope, payload) {
              await db.withExclusiveTransactionAsync(async (transaction) => {
                await transaction.runAsync(
                  "INSERT OR REPLACE INTO patient_profiles(scope,payload) VALUES(?,?)",
                  scope,
                  payload,
                );
              });
            },
          },
          key,
        );
        return createPatientRepository(
          scoped,
          async () => null,
          instantNow,
          (day) => createServerJourney(day, world, onboarding),
        );
      }
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
      openings.delete(key);
      throw error;
    });
    openings.set(key, opening);
  }
  return opening;
}
