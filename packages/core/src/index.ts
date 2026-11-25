export * from "./types";
export * from "./config";
export * from "./health";
export * from "./demo";
export * from "./db";
export * from "./ingest";
export * from "./scheduler";

export const isDemoMode = () => process.env.DEMO_MODE !== "false";
export const dailyBudgetEur = () => Number(process.env.DAILY_BUDGET_EUR ?? "2");
