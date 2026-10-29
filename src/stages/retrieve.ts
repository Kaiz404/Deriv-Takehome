import type { Chunk, Index, Question, RetrievalResult } from "../types.ts";

/** Pure. `qEmbedding` is null when classifyQuestion rejected the question. */
export function retrieve(q: Question, qEmbedding: number[] | null, index: Index, chunks: Chunk[]): RetrievalResult {
  throw new Error("TODO");
}
