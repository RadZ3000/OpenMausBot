/** Stepping through the pictures in a transcript wraps: the last one's
 * "next" is the first. Kept apart from the viewer so the arithmetic that
 * decides what you see next is testable without a DOM. */
export function stepIndex(index: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
