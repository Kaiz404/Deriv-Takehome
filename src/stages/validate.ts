import type { Answer, FinalAnswer, RetrievalResult, ValidationResult } from "../types.ts";

/** Normalized numeric tokens: "1,000" -> "1000", "$0.50" -> "0.50". */
export function extractNumbers(text: string): Set<string> {
  throw new Error("TODO");
}

/** Pure, deterministic. passed = no error-severity issues. */
export function validateAnswer(a: Answer, r: RetrievalResult): ValidationResult {
  throw new Error("TODO");
}

/** Pure. Downgrades to the canonical unsupported answer when validation failed. */
export function enforce(a: Answer, v: ValidationResult, r: RetrievalResult): FinalAnswer {
  throw new Error("TODO");
}
