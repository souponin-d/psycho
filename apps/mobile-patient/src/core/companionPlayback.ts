/** Текущий кадр остаётся непрозрачной основой до полной готовности следующего. */
export function blendLayers(front: number, progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return [0, 1].map((index) => ({
    opacity: index === front ? 1 : p,
    zIndex: index === front ? 0 : 1,
  }));
}
export function createFrameGate(initial: string) {
  let generation = 0,
    visible = initial;
  return {
    begin(frame: string) {
      return { generation: ++generation, frame };
    },
    commit(token: { generation: number; frame: string }) {
      if (token.generation !== generation) return false;
      visible = token.frame;
      return true;
    },
    cancel() {
      generation++;
    },
    visible() {
      return visible;
    },
  };
}

/** Снимок внешнего вида принадлежит слоту, а не последним props родителя. */
export function createArtworkSlots<T>(identity: string, value: T) {
  const slots = [
    { identity, value },
    { identity, value },
  ];
  return {
    stage(index: number, nextIdentity: string, nextValue: T) {
      slots[index] = { identity: nextIdentity, value: nextValue };
    },
    identity(index: number) {
      return slots[index].identity;
    },
    value(index: number) {
      return slots[index].value;
    },
  };
}

/** Дедупликация только in-flight; завершённый getSize не гарантирует живой bitmap. */
export function createResourcePreparer<T>(load: (source: T) => Promise<void>) {
  const pending = new Map<T, Promise<void>>();
  return (source: T) => {
    const previous = pending.get(source);
    if (previous) return previous;
    const result = load(source).finally(() => pending.delete(source));
    pending.set(source, result);
    return result;
  };
}
