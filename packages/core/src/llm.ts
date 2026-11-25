import { db, hasDatabase } from "./db";

/** Prix publics en dollars par million de jetons (vérifiés le 25/11/2026 sur platform.claude.com). */
const PRICES_USD: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 5, output: 25 },
};
/** Conversion prudente (légèrement haute) pour ne jamais sous-estimer les dépenses. */
const USD_TO_EUR = Number(process.env.USD_TO_EUR ?? "0.95");

export const llmModel = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
export const dailyBudget = () => Number(process.env.DAILY_BUDGET_EUR ?? "2");

export class BudgetExceededError extends Error {
  constructor(spent: number, cap: number) {
    super(`Plafond de dépenses du jour atteint (${spent.toFixed(2)} € / ${cap.toFixed(2)} €). La génération reprendra demain.`);
  }
}

export function costEur(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES_USD[model] ?? PRICES_USD["claude-sonnet-5-5"];
  return ((inputTokens * p.input + outputTokens * p.output) / 1e6) * USD_TO_EUR;
}

/** Dépenses du jour (heure de Paris), tous fournisseurs confondus. */
export async function spentToday(): Promise<number> {
  if (!hasDatabase()) return 0;
  const [r] = await db()`
    SELECT coalesce(sum(cost_eur), 0)::float AS total FROM cost_log
    WHERE at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')`;
  return Number(r.total);
}

export async function assertBudget(): Promise<void> {
  const spent = await spentToday();
  if (spent >= dailyBudget()) throw new BudgetExceededError(spent, dailyBudget());
}

export async function logCost(entry: { provider: string; model: string; purpose: string; inputUnits: number; outputUnits: number; costEur: number; bulletinId?: number | null }) {
  if (!hasDatabase()) return;
  await db()`
    INSERT INTO cost_log (provider, model, purpose, input_units, output_units, cost_eur, bulletin_id)
    VALUES (${entry.provider}, ${entry.model}, ${entry.purpose}, ${entry.inputUnits}, ${entry.outputUnits}, ${entry.costEur}, ${entry.bulletinId ?? null})`;
}

export interface StructuredCall {
  purpose: string;
  system: string;
  user: string;
  /** Schéma JSON de la réponse attendue. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  bulletinId?: number | null;
}

/** Fonction d'appel au modèle : remplaçable dans les tests. */
export type LlmFn = <T>(call: StructuredCall) => Promise<T>;

/**
 * Appelle Claude et force une réponse JSON conforme au schéma (via un outil obligatoire).
 * Vérifie le plafond avant chaque appel, journalise le coût, réessaie en cas de surcharge.
 */
export const callClaude: LlmFn = async <T,>(call: StructuredCall): Promise<T> => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Clé ANTHROPIC_API_KEY absente.");
  await assertBudget();
  const model = llmModel();
  const body = {
    model,
    max_tokens: call.maxTokens ?? 4000,
    temperature: 0,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
    tools: [{ name: "repondre", description: "Renvoie la réponse structurée.", input_schema: call.schema }],
    tool_choice: { type: "tool", name: "repondre" },
  };

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const usage = data.usage ?? {};
      const cost = costEur(model, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
      await logCost({ provider: "anthropic", model, purpose: call.purpose, inputUnits: usage.input_tokens ?? 0, outputUnits: usage.output_tokens ?? 0, costEur: cost, bulletinId: call.bulletinId });
      const block = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
      if (!block) throw new Error("Réponse du modèle sans contenu structuré.");
      return block.input as T;
    }
    lastError = `${res.status} ${data?.error?.message ?? ""}`.trim();
    if (![429, 500, 502, 503, 529].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }
  throw new Error(`Appel à Claude impossible : ${lastError}`);
};
