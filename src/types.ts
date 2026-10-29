import { z } from "zod";

export type Doc = { doc_id: string; path: string; text: string };

export type Chunk = {
  chunk_id: string;
  doc_id: string;
  text: string;
  start_char: number;
  end_char: number;
  heading: string;
};

export const QuestionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  question: z.string(),
});
export type Question = z.infer<typeof QuestionSchema>;
export type QuestionId = Question["id"];

export type Gate = "INVALID_QUESTION" | "NO_RELEVANT_CONTEXT" | null;

export type Bm25Index = {
  k1: number;
  b: number;
  avgdl: number;
  df: Record<string, number>;
  tf: Record<string, number>[];
  len: number[];
};

export type Index = {
  embed_model: string;
  chunk_ids: string[];
  bm25: Bm25Index;
  embeddings: number[][];
};

export type RetrievedChunk = {
  chunk_id: string;
  doc_id: string;
  score: number;
  text: string;
  heading: string;
  bm25: number;
  cosine: number;
};

export type RetrievalResult = {
  id: QuestionId;
  question: string;
  retrieved_chunks: RetrievedChunk[];
  gate: Gate;
};

export const ModelAnswerSchema = z.object({
  answer: z.string(),
  supported: z.boolean(),
  citations: z.array(z.string()),
});
export type ModelAnswer = z.infer<typeof ModelAnswerSchema>;

export type IssueCode =
  | "CITATION_NOT_RETRIEVED"
  | "SUPPORTED_WITHOUT_CITATION"
  | "UNSUPPORTED_WITH_CITATION"
  | "UNGROUNDED_NUMBER"
  | "LOW_TERM_OVERLAP"
  | "MODEL_OUTPUT_INVALID"
  | "LLM_CALL_FAILED"
  | "SUPPORTED_FLAG_MISMATCH"
  | "NONCANONICAL_UNSUPPORTED"
  | "INVALID_QUESTION"
  | "NO_RELEVANT_CONTEXT";

export type Issue = { code: IssueCode; severity: "error" | "warning" | "info"; detail: string };

/** Raw generation output. `generation_issue` is set when the LLM was skipped or failed. */
export type Answer = ModelAnswer & {
  id: QuestionId;
  question: string;
  gate: Gate;
  generation_issue: Issue | null;
  /** The chat model that produced this answer; null when no model answered. */
  model: string | null;
};

export type ValidationResult = { id: QuestionId; passed: boolean; issues: Issue[] };

export type FinalAnswer = {
  id: QuestionId;
  question: string;
  answer: string;
  supported: boolean;
  citations: string[];
  retrieved_chunk_ids: string[];
  validation: { passed: boolean; issues: Issue[] };
  downgraded: boolean;
};

/** Input-set-level failure: the run stops with exit 1 and prints every problem. */
export class PipelineError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join("\n"));
  }
}
