import type { ThemeId } from "../core/model";
export const sceneAssets = {
  shore: {
    day: require("../../assets/images/shore-day-v04.png"),
    night: require("../../assets/images/shore-night-v04.png"),
  },
  garden: {
    day: require("../../assets/images/garden-day-v04.png"),
    night: require("../../assets/images/garden-night-v04.png"),
  },
};
export const sceneSource = (territory: "shore" | "garden", theme: ThemeId) =>
  sceneAssets[territory][theme === "dark" ? "night" : "day"];
