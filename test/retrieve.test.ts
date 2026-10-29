import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../src/stages/index.ts";
import { retrieve } from "../src/stages/retrieve.ts";
import type { Chunk } from "../src/types.ts";

const mk = (id: string, text: string): Chunk => ({
  chunk_id: id, doc_id: "d", text, start_char: 0, end_char: text.length, heading: "",
});

const texts = ["alpha beta gamma", "delta epsilon", "rate limit returns 429", "zeta eta theta", "iota kappa"];
const vecs = [[1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]];
const chunks = texts.map((t, i) => mk(`c${i}`, t));

async function setup(cs: Chunk[], vs: number[][]) {
  const m = new Map(cs.map((c, i) => [c.text, vs[i]]));
  return buildIndex(cs, async (ts) => ts.map((t) => m.get(t)!));
}

test("returns exactly 3 when more chunks, all when fewer (E5)", async () => {
  const idx = await setup(chunks, vecs);
  assert.equal(retrieve({ id: 1, question: "alpha" }, vecs[0], idx, chunks).retrieved_chunks.length, 3);
  const two = chunks.slice(0, 2);
  const idx2 = await setup(two, vecs.slice(0, 2));
  assert.equal(retrieve({ id: 1, question: "alpha" }, vecs[0], idx2, two).retrieved_chunks.length, 2);
});

test("matching chunk ranks first with score 1", async () => {
  const idx = await setup(chunks, vecs);
  const r = retrieve({ id: 1, question: "alpha beta" }, vecs[0], idx, chunks);
  assert.equal(r.retrieved_chunks[0].chunk_id, "c0");
  assert.equal(r.retrieved_chunks[0].score, 1);
  assert.equal(r.gate, null);
});

test("null embedding gives INVALID_QUESTION and no chunks", async () => {
  const idx = await setup(chunks, vecs);
  const r = retrieve({ id: 1, question: "" }, null, idx, chunks);
  assert.equal(r.gate, "INVALID_QUESTION");
  assert.deepEqual(r.retrieved_chunks, []);
});

test("low cosine gates NO_RELEVANT_CONTEXT but still records chunks", async () => {
  const idx = await setup(chunks, vecs);
  const q = [0.1, 0.1, 0.1, 0.1, 0.1, 5]; // ~0 cosine with every chunk vector
  const r = retrieve({ id: 1, question: "unrelated" }, q.concat(), { ...idx, embeddings: idx.embeddings.map((v) => [...v, 0]) }, chunks);
  assert.equal(r.gate, "NO_RELEVANT_CONTEXT");
  assert.equal(r.retrieved_chunks.length, 3);
});

test("deterministic", async () => {
  const idx = await setup(chunks, vecs);
  const q = { id: 1, question: "alpha" };
  assert.deepEqual(retrieve(q, vecs[0], idx, chunks), retrieve(q, vecs[0], idx, chunks));
});

test("query 429 matches lexically", async () => {
  const idx = await setup(chunks, vecs);
  const r = retrieve({ id: 1, question: "429" }, [0.1, 0.1, 0.1, 0.1, 0.1], idx, chunks);
  const hit = r.retrieved_chunks.find((c) => c.chunk_id === "c2")!;
  assert.ok(hit.bm25 > 0);
});
