import OpenAI from "openai";

/**
 * Chat models tried in order. OPENAI_MODELS (comma-separated) replaces the chain.
 * gpt-5.6-luna is the same family one generation back; gpt-4.1-mini is the most widely
 * available model for evaluators whose key lacks the luna models.
 */
export const CHAT_MODELS: readonly string[] = process.env.OPENAI_MODELS
  ? process.env.OPENAI_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
  : ["gpt-6-luna", "gpt-5.6-luna", "gpt-4.1-mini"];

type Verdict = "fatal" | "next" | "next-and-mark-unavailable";

/** Which failures justify trying the next model. Runs after the SDK's own retries are exhausted. */
export function classifyFailure(err: unknown): Verdict {
  if (err instanceof OpenAI.APIConnectionError) return "next";
  if (!(err instanceof OpenAI.APIError)) return "fatal";
  if (err.status === 401) return "fatal";
  if (err.status === 400 || err.status === 403 || err.status === 404) return "next-and-mark-unavailable";
  if (err.status === 429 || (err.status ?? 0) >= 500) return "next";
  return "fatal";
}

const unavailableThisRun = new Set<string>();

/**
 * Calls `call` with each model until one succeeds. A model that answers 400/403/404 is skipped
 * for the rest of the run, so concurrent questions don't each rediscover it.
 */
export async function withModelFallback<T>(
  call: (model: string) => Promise<T>,
  models: readonly string[] = CHAT_MODELS,
  unavailable: Set<string> = unavailableThisRun,
): Promise<{ model: string; result: T }> {
  const failures: string[] = [];
  for (const model of models) {
    if (unavailable.has(model)) continue;
    try {
      return { model, result: await call(model) };
    } catch (err) {
      const verdict = classifyFailure(err);
      if (verdict === "fatal") throw err;
      if (verdict === "next-and-mark-unavailable") unavailable.add(model);
      failures.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`All chat models failed. ${failures.join(" | ") || "No models available."}`);
}
