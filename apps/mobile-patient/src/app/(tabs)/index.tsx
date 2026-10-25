import { JourneyMap } from "../../components/JourneyMap";
import { useApp } from "../../state/AppProvider";
import PlanScreen from "./plan";
export default function TodayScreen() {
  const { state } = useApp();
  if (!state.gameplay) return <PlanScreen />;
  return <JourneyMap />;
}
