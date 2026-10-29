import type { Chunk, Doc } from "../types.ts";

/** Structural chunking. Invariant: chunk.text === doc.text.slice(start_char, end_char). */
export function chunkDocument(doc: Doc): Chunk[] {
  throw new Error("TODO");
}
