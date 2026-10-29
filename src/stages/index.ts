import { BM25_B, BM25_K1, EMBED_MODEL } from "../config.ts";
import { tokenize } from "../text.ts";
import type { Bm25Index, Chunk, Index } from "../types.ts";

/** Text that BM25 and embeddings see for a chunk. */
export const indexText = (c: Chunk) => (c.heading ? `${c.heading}\n${c.text}` : c.text);

export function buildBm25(chunks: Chunk[]): Bm25Index {
  const tf: Record<string, number>[] = [];
  const len: number[] = [];
  const df: Record<string, number> = {};
  for (const c of chunks) {
    const tokens = tokenize(indexText(c));
    const counts: Record<string, number> = {};
    for (const t of tokens) counts[t] = (counts[t] ?? 0) + 1;
    for (const t of Object.keys(counts)) df[t] = (df[t] ?? 0) + 1;
    tf.push(counts);
    len.push(tokens.length);
  }
  const avgdl = chunks.length ? len.reduce((a, b) => a + b, 0) / chunks.length : 0;
  return { k1: BM25_K1, b: BM25_B, avgdl, df, tf, len };
}

export function bm25Score(index: Bm25Index, i: number, queryTokens: string[]): number {
  const n = index.tf.length;
  const norm = index.avgdl > 0 ? 1 - index.b + (index.b * index.len[i]) / index.avgdl : 1;
  let score = 0;
  for (const t of new Set(queryTokens)) {
    const f = index.tf[i][t];
    if (!f) continue;
    const df = index.df[t] ?? 0;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    score += (idf * f * (index.k1 + 1)) / (f + index.k1 * norm);
  }
  return score;
}

/** `embedFn` is injected so tests run without the network. */
export async function buildIndex(chunks: Chunk[], embedFn: (texts: string[]) => Promise<number[][]>): Promise<Index> {
  const embeddings = await embedFn(chunks.map(indexText));
  return { embed_model: EMBED_MODEL, chunk_ids: chunks.map((c) => c.chunk_id), bm25: buildBm25(chunks), embeddings };
}
