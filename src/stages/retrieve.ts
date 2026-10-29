import { MIN_RELEVANCE, RRF_K, TOP_K } from "../config.ts";
import { tokenize } from "../text.ts";
import type { Chunk, Index, Question, RetrievalResult } from "../types.ts";
import { bm25Score } from "./index.ts";

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 1-based rank per position; ties broken by chunk_id ascending. */
function ranks(values: number[], ids: string[]): number[] {
  const order = values.map((_, i) => i).sort((x, y) => values[y] - values[x] || (ids[x] < ids[y] ? -1 : ids[x] > ids[y] ? 1 : 0));
  const out: number[] = new Array(values.length);
  order.forEach((idx, r) => (out[idx] = r + 1));
  return out;
}

/** Pure. `qEmbedding` is null when classifyQuestion rejected the question. */
export function retrieve(q: Question, qEmbedding: number[] | null, index: Index, chunks: Chunk[]): RetrievalResult {
  if (!qEmbedding) return { id: q.id, question: q.question, retrieved_chunks: [], gate: "INVALID_QUESTION" };

  const ids = chunks.map((c) => c.chunk_id);
  const qTokens = tokenize(q.question);
  const cos = chunks.map((_, i) => cosine(qEmbedding, index.embeddings[i]));
  const bm = chunks.map((_, i) => bm25Score(index.bm25, i, qTokens));
  const rCos = ranks(cos, ids);
  const rBm = ranks(bm, ids);
  const maxFused = 2 / (RRF_K + 1);

  const retrieved_chunks = chunks
    .map((c, i) => ({
      chunk_id: c.chunk_id,
      doc_id: c.doc_id,
      score: round4((1 / (RRF_K + rBm[i]) + 1 / (RRF_K + rCos[i])) / maxFused),
      text: c.text,
      bm25: round4(bm[i]),
      cosine: round4(cos[i]),
    }))
    .sort((a, b) => b.score - a.score || (a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0))
    .slice(0, Math.min(TOP_K, chunks.length));

  const gate = Math.max(...cos) < MIN_RELEVANCE ? "NO_RELEVANT_CONTEXT" : null;
  return { id: q.id, question: q.question, retrieved_chunks, gate };
}
