import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useApp } from "../state/AppProvider";
import { createHapticGate } from "../core/hapticGate";
export function useFeedback() {
  const { state } = useApp();
  const gate = useRef(createHapticGate()).current;
  const pulse = useCallback(
    (confirm = false) => {
      if (!state.haptics) return;
      const effect =
        Platform.OS === "android"
          ? Haptics.performAndroidHapticsAsync(
              confirm
                ? Haptics.AndroidHaptics.Confirm
                : Haptics.AndroidHaptics.Segment_Frequent_Tick,
            )
          : confirm
            ? Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              )
            : Haptics.selectionAsync();
      void effect.catch(() => {});
    },
    [state.haptics],
  );
  const step = useCallback(
    (cell: string) => {
      if (gate.step(cell, Date.now(), state.haptics)) pulse();
    },
    [gate, state.haptics, pulse],
  );
  return { pulse, step, reset: gate.reset };
}
