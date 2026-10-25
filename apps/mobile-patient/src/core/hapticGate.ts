export function createHapticGate() {
  let lastCell = "";
  let lastTime = -Infinity;
  return {
    step(cell: string, now: number, enabled: boolean) {
      if (
        !enabled ||
        cell === lastCell ||
        (now >= lastTime && now - lastTime < 80)
      )
        return false;
      lastCell = cell;
      lastTime = now;
      return true;
    },
    reset() {
      lastCell = "";
      lastTime = -Infinity;
    },
  };
}
