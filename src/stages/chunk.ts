import { CHUNK_SIZE } from "../config.ts";
import type { Chunk, Doc } from "../types.ts";

type Span = [start: number, end: number];

/** Shrinks [start, end) past surrounding whitespace; returns null if nothing is left. */
function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return start < end ? [start, end] : null;
}

/** Splits a trimmed span longer than CHUNK_SIZE at the last ". " or space within the limit. */
function hardSplit(text: string, [start, end]: Span): Span[] {
  const out: Span[] = [];
  while (end - start > CHUNK_SIZE) {
    const window = text.slice(start, start + CHUNK_SIZE);
    const sentence = window.lastIndexOf(". ");
    const space = window.lastIndexOf(" ");
    const cut = sentence > 0 ? start + sentence + 1 : space > 0 ? start + space : start + CHUNK_SIZE;
    const piece = trimSpan(text, start, cut);
    if (piece) out.push(piece);
    start = cut;
    while (start < end && /\s/.test(text[start])) start++;
  }
  const rest = trimSpan(text, start, end);
  if (rest) out.push(rest);
  return out;
}

/** Structural chunking. Invariant: chunk.text === doc.text.slice(start_char, end_char). */
export function chunkDocument(doc: Doc): Chunk[] {
  const { text } = doc;
  const bounds = [0, ...[...text.matchAll(/^#{1,6} /gm)].map((m) => m.index!).filter((i) => i > 0), text.length];
  const chunks: Chunk[] = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const [secStart, secEnd] = [bounds[i], bounds[i + 1]];
    const headingMatch = /^#{1,6}[ \t]+([^\n]*)/.exec(text.slice(secStart, secEnd));
    const heading = headingMatch ? headingMatch[1].trim() : "";

    const units: Span[] = [];
    let pos = secStart;
    for (const sep of [...text.slice(secStart, secEnd).matchAll(/\n\s*\n/g)]) {
      const paraEnd = secStart + sep.index!;
      const para = trimSpan(text, pos, paraEnd);
      if (para) units.push(...hardSplit(text, para));
      pos = paraEnd + sep[0].length;
    }
    const last = trimSpan(text, pos, secEnd);
    if (last) units.push(...hardSplit(text, last));

    for (let u = 0; u < units.length; ) {
      const start = units[u][0];
      let end = units[u][1];
      u++;
      while (u < units.length && units[u][1] - start <= CHUNK_SIZE) end = units[u++][1];
      chunks.push({
        chunk_id: `${doc.doc_id}#c${chunks.length}`,
        doc_id: doc.doc_id,
        text: text.slice(start, end),
        start_char: start,
        end_char: end,
        heading,
      });
    }
  }
  return chunks;
}
