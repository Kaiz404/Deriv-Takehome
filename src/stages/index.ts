import type { Bm25Index, Chunk, Index } from "../types.ts";

/** Text that BM25 and embeddings see for a chunk. */
export const indexText = (c: Chunk) => (c.heading ? `${c.heading}\n${c.text}` : c.text);

export function buildBm25(chunks: Chunk[]): Bm25Index {
  throw new Error("TODO");
}

/** `embedFn` is injected so tests run without the network. */
export async function buildIndex(chunks: Chunk[], embedFn: (texts: string[]) => Promise<number[][]>): Promise<Index> {
  throw new Error("TODO");
}
