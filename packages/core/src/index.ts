export * from "./types";
export * from "./config";
export * from "./health";
export * from "./demo";

export const isDemoMode = () => process.env.DEMO_MODE !== "false";
export const dailyBudgetEur = () => Number(process.env.DAILY_BUDGET_EUR ?? "2");
