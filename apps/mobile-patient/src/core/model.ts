import { validFeeling, type FeelingPoint } from "./feelings.ts";
import { decorations, isDay, type Decoration } from "./shore.ts";
export type ThemeId = "light" | "dark" | "lavender";
export function planOperation(
  id: string,
  done: boolean,
): "report" | "undo" | "complete" {
  return done ? "undo" : id === "checkin" ? "report" : "complete";
}
export function historyDates(state: AppState, recent: string[]): string[] {
  return [
    ...new Set([
      ...recent,
      ...Object.keys(state.completed),
      ...state.reports.map((report) => report.day),
    ]),
  ].sort();
}
export type MascotId = "fluffy" | "cloud";
export type Mood = "low" | "uneasy" | "neutral" | "calm" | "good";
export type SelfReport = {
  id: string;
  day: string;
  time: string;
  mood: Mood;
  sleep: string;
  note: string;
  feeling?: FeelingPoint;
  label?: string;
};
export type VisitQuestion = { id: string; text: string; day: string };
export type AppState = {
  version: 1;
  onboarded: boolean;
  theme: ThemeId;
  mascot: MascotId;
  name: string;
  morning: string;
  motion: boolean;
  haptics: boolean;
  gameplay: boolean;
  memoryDays: string[];
  decoration: Decoration;
  questions: VisitQuestion[];
  completed: Record<string, string[]>;
  reports: SelfReport[];
};
export type Action =
  | { type: "restore"; state: AppState }
  | {
      type: "preferences";
      patch: Partial<
        Pick<
          AppState,
          | "theme"
          | "mascot"
          | "name"
          | "morning"
          | "motion"
          | "haptics"
          | "gameplay"
          | "decoration"
        >
      >;
    }
  | { type: "onboard"; value: boolean }
  | { type: "complete"; day: string; taskId: string; done: boolean }
  | { type: "report"; report: SelfReport }
  | { type: "question:add"; question: VisitQuestion }
  | { type: "question:remove"; id: string }
  | { type: "reset" };
export function createDefaultState(): AppState {
  return {
    version: 1,
    onboarded: false,
    theme: "light",
    mascot: "fluffy",
    name: "Анна",
    morning: "09:00",
    motion: true,
    haptics: true,
    gameplay: true,
    memoryDays: [],
    decoration: "leaf",
    questions: [],
    completed: {},
    reports: [],
  };
}
const taskIds = ["morning", "checkin", "walk", "evening"];
const moods = ["low", "uneasy", "neutral", "calm", "good"];
function validReport(value: unknown): SelfReport | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    !r.id ||
    !isDay(r.day) ||
    typeof r.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ||
    !moods.includes(String(r.mood)) ||
    typeof r.sleep !== "string" ||
    typeof r.note !== "string" ||
    (r.feeling !== undefined && !validFeeling(r.feeling))
  )
    return null;
  return {
    id: r.id.slice(0, 100),
    day: r.day,
    time: r.time,
    mood: r.mood as Mood,
    sleep: r.sleep.slice(0, 40),
    note: r.note.slice(0, 500),
    ...(validFeeling(r.feeling) ? { feeling: { ...r.feeling } } : {}),
    ...(typeof r.label === "string" && r.label.trim()
      ? { label: r.label.trim().slice(0, 60) }
      : {}),
  };
}
function validQuestion(value: unknown): VisitQuestion | null {
  if (!value || typeof value !== "object") return null;
  const q = value as VisitQuestion;
  return typeof q.id === "string" &&
    q.id &&
    typeof q.text === "string" &&
    q.text.trim() &&
    isDay(q.day)
    ? { id: q.id.slice(0, 100), text: q.text.trim().slice(0, 240), day: q.day }
    : null;
}
export function restoreState(value: string | null): AppState {
  const base = createDefaultState();
  try {
    const raw: unknown = value ? JSON.parse(value) : null;
    if (!raw || typeof raw !== "object" || (raw as AppState).version !== 1)
      return base;
    const r = raw as Partial<AppState>;
    const completed: Record<string, string[]> = {};
    if (r.completed && typeof r.completed === "object") {
      for (const [day, ids] of Object.entries(r.completed)) {
        if (isDay(day) && Array.isArray(ids))
          completed[day] = [
            ...new Set(ids.filter((id) => taskIds.includes(id))),
          ];
      }
    }
    const reports = Array.isArray(r.reports)
      ? r.reports.map(validReport).filter((v): v is SelfReport => v !== null)
      : [];
    const memoryDays = [
      ...new Set([
        ...(Array.isArray(r.memoryDays) ? r.memoryDays.filter(isDay) : []),
        ...reports.map((report) => report.day),
      ]),
    ].sort();
    const questions = Array.isArray(r.questions)
      ? r.questions
          .map(validQuestion)
          .filter((q): q is VisitQuestion => q !== null)
      : [];
    return {
      ...base,
      onboarded: r.onboarded === true,
      theme: ["light", "dark", "lavender"].includes(String(r.theme))
        ? r.theme!
        : base.theme,
      mascot: r.mascot === "cloud" ? "cloud" : "fluffy",
      name:
        typeof r.name === "string"
          ? r.name.trim().slice(0, 30) || "Анна"
          : "Анна",
      morning: ["08:00", "09:00", "10:00"].includes(String(r.morning))
        ? r.morning!
        : "09:00",
      motion: r.motion !== false,
      haptics: r.haptics !== false,
      gameplay: r.gameplay !== false,
      memoryDays,
      decoration: decorations(memoryDays).includes(r.decoration!)
        ? r.decoration!
        : "leaf",
      questions: [...new Map(questions.map((q) => [q.id, q])).values()].slice(
        -40,
      ),
      completed,
      reports: [
        ...new Map(reports.map((report) => [report.id, report])).values(),
      ],
    };
  } catch {
    return base;
  }
}
export function reduceState(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "restore":
      return action.state;
    case "preferences":
      return restoreState(JSON.stringify({ ...state, ...action.patch }));
    case "onboard":
      return { ...state, onboarded: action.value };
    case "complete": {
      if (!taskIds.includes(action.taskId) || !isDay(action.day)) return state;
      const ids = state.completed[action.day] ?? [];
      return {
        ...state,
        completed: {
          ...state.completed,
          [action.day]: action.done
            ? [...new Set([...ids, action.taskId])]
            : ids.filter((id) => id !== action.taskId),
        },
      };
    }
    case "report": {
      const report = validReport(action.report);
      if (!report || state.reports.some((r) => r.id === report.id))
        return state;
      return {
        ...state,
        reports: [...state.reports, report],
        memoryDays: [...new Set([...state.memoryDays, report.day])].sort(),
        completed: {
          ...state.completed,
          [report.day]: [
            ...new Set([...(state.completed[report.day] ?? []), "checkin"]),
          ],
        },
      };
    }
    case "question:add": {
      const question = validQuestion(action.question);
      if (
        !question ||
        state.questions.length >= 40 ||
        state.questions.some((q) => q.id === question.id)
      )
        return state;
      return { ...state, questions: [...state.questions, question] };
    }
    case "question:remove":
      return {
        ...state,
        questions: state.questions.filter((q) => q.id !== action.id),
      };
    case "reset":
      return createDefaultState();
  }
}
