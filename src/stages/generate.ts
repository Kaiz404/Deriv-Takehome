import type { Answer, RetrievalResult } from "../types.ts";

export const SYSTEM_PROMPT = "TODO";

/** Skips the LLM when r.gate is set. Never throws on API or parse errors; records generation_issue instead. */
export async function generateAnswer(r: RetrievalResult): Promise<Answer> {
  throw new Error("TODO");
}
