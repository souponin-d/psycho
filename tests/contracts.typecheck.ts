import type { ChartSeries, SeriesPoint } from "@psycho/ui-web/contracts";

// Потребитель вправе передать неизменяемую серию без копирования массива.
const externalPoints: readonly SeriesPoint[] = [
  { id: "demo-external", label: "Внешний пример", value: 0 },
];
export const readonlySeries: ChartSeries = {
  label: "Серия с readonly-входом",
  points: externalPoints,
};
