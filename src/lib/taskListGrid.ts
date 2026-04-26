/** gridContainer paddingHorizontal 20×2 */
export const TASK_GRID_OUTER_PAD = 40;
/** FlatList content paddingHorizontal 4×2 when numColumns > 1 */
export const TASK_LIST_INNER_PAD = 8;
export const TASK_COL_GAP = 10;

/** Caps at 5 columns on wide viewports (matches image task list) */
export function taskListGridColumnCount(windowWidth: number) {
  const sidePadding = 56;
  const minSlotWidth = 212;
  const usable = Math.max(0, windowWidth - sidePadding);
  const n = Math.floor(usable / minSlotWidth);
  return Math.max(1, Math.min(5, n));
}

/** Fixed card width so the last row does not stretch a single item across the screen */
export function taskListCardSlotWidth(windowWidth: number, columns: number) {
  const inner = columns > 1 ? TASK_LIST_INNER_PAD : 0;
  const usable = Math.max(0, windowWidth - TASK_GRID_OUTER_PAD - inner);
  if (columns <= 1) return usable;
  const gaps = (columns - 1) * TASK_COL_GAP;
  return Math.max(140, Math.floor((usable - gaps) / columns));
}
