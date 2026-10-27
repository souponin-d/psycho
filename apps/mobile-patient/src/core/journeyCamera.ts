/** Content starts after the header padding; center a day in the unobstructed area. */
export function journeyCameraOffset(
  contentY: number,
  viewport: number,
  insets: { top: number; bottom: number },
) {
  const freeHeight = Math.max(1, viewport - insets.top - insets.bottom);
  return Math.max(0, contentY - freeHeight / 2);
}
