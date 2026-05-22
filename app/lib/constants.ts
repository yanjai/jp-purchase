export const CATEGORIES = ["藥妝", "衣服", "食品", "其他"] as const;
export type Category = (typeof CATEGORIES)[number];
