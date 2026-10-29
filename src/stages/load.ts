import type { Doc, Question } from "../types.ts";

/** Reads every .md/.txt under `dir` (recursive, sorted). Throws PipelineError if none. */
export async function loadDocuments(dir: string): Promise<Doc[]> {
  throw new Error("TODO");
}

/** Parses and validates questions.json. Throws PipelineError listing every file-level problem. */
export async function loadQuestions(file: string): Promise<Question[]> {
  throw new Error("TODO");
}

/** Per-question gate: INVALID_QUESTION for empty, symbol-only, or over-long questions. */
export function classifyQuestion(text: string): "INVALID_QUESTION" | null {
  throw new Error("TODO");
}
