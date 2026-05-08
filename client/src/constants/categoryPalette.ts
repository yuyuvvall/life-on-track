// Curated 16-color palette used by the Category management modal and the
// migration's auto-create fallback. All Tailwind-500 shades, balanced for use
// as a 1-color category badge on a light background.
export const CATEGORY_PALETTE = [
  '#f97316', // orange  (default: Food)
  '#f59e0b', // amber   (default: Transport)
  '#eab308', // yellow
  '#84cc16', // lime
  '#10b981', // emerald (default: Health)
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue    (default: Groceries)
  '#6366f1', // indigo
  '#a855f7', // purple  (default: Entertainment)
  '#ec4899', // pink    (default: Shopping)
  '#ef4444', // red
  '#64748b', // slate   (default: Bills)
  '#6b7280', // gray    (default: Other)
  '#78716c', // stone
  '#0ea5e9', // sky
] as const;

export type CategoryPaletteColor = typeof CATEGORY_PALETTE[number];
