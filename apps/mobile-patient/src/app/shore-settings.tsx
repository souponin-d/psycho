import { Redirect } from "expo-router";
export default function ShoreSettingsScreen() {
  return (
    <Redirect href={{ pathname: "/(tabs)", params: { editWorld: "open" } }} />
  );
}
