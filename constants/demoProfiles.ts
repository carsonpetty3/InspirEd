export type DemoProfileKind = "low" | "high";

export const DEMO_PROFILES = {
  low:  { name: "Demo - Low Literacy",  readingLevel: 6 },  // Essential
  high: { name: "Demo - High Literacy", readingLevel: 14 }, // Comprehensive
} as const;