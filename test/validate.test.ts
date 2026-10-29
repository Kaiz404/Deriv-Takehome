import assert from "node:assert/strict";
import { test } from "node:test";
import { UNSUPPORTED_ANSWER } from "../src/config.ts";
import { generateAnswer } from "../src/stages/generate.ts";
import { enforce, extractNumbers, validateAnswer } from "../src/stages/validate.ts";
import type { Answer, RetrievalResult } from "../src/types.ts";

const chunk = (chunk_id: string, text: string) => ({ chunk_id, doc_id: "d.md", score: 1, text, heading: "", bm25: 1, cosine: 1 });

const retrieval = (text: string, gate: RetrievalResult["gate"] = null): RetrievalResult => ({
  id: 1,
  question: "q",
  retrieved_chunks: [chunk("d.md#c0", text)],
  gate,
});

const answer = (over: Partial<Answer>): Answer => ({
  id: 1,
  question: "q",
  answer: "Pro plans allow requests per minute.",
  supported: true,
  citations: ["d.md#c0"],
  gate: null,
  generation_issue: null,
  model: null,
  ...over,
});

const R = retrieval("Pro plans allow 600 requests per minute for every account.");
const codes = (a: Answer, r = R) => validateAnswer(a, r).issues.map((i) => i.code);

test("clean supported answer passes with no issues", () => {
  const v = validateAnswer(answer({}), R);
  assert.equal(v.passed, true);
  assert.deepEqual(v.issues, []);
});

test("CITATION_NOT_RETRIEVED is exact-match", () => {
  assert.ok(codes(answer({ citations: ["D.md#c0"] })).includes("CITATION_NOT_RETRIEVED"));
});

test("SUPPORTED_WITHOUT_CITATION", () => {
  assert.ok(codes(answer({ citations: [] })).includes("SUPPORTED_WITHOUT_CITATION"));
});

test("UNSUPPORTED_WITH_CITATION", () => {
  const a = answer({ supported: false, answer: UNSUPPORTED_ANSWER });
  assert.ok(codes(a).includes("UNSUPPORTED_WITH_CITATION"));
});

test("UNGROUNDED_NUMBER", () => {
  const v = validateAnswer(answer({ answer: "Pro plans allow 300 requests per minute." }), R);
  assert.ok(v.issues.some((i) => i.code === "UNGROUNDED_NUMBER"));
  assert.equal(v.passed, false);
});

test("LOW_TERM_OVERLAP is a warning and does not fail", () => {
  const v = validateAnswer(answer({ answer: "Quantum entanglement powers teleportation devices." }), R);
  const issue = v.issues.find((i) => i.code === "LOW_TERM_OVERLAP");
  assert.equal(issue?.severity, "warning");
  assert.equal(v.passed, true);
});

test("MODEL_OUTPUT_INVALID and LLM_CALL_FAILED come through generation_issue", () => {
  for (const code of ["MODEL_OUTPUT_INVALID", "LLM_CALL_FAILED"] as const) {
    const a = answer({
      supported: false,
      citations: [],
      answer: UNSUPPORTED_ANSWER,
      generation_issue: { code, severity: "error", detail: "x" },
    });
    const v = validateAnswer(a, R);
    assert.deepEqual(v.issues.map((i) => i.code), [code]);
    assert.equal(v.passed, false);
  }
});

test("SUPPORTED_FLAG_MISMATCH", () => {
  assert.ok(codes(answer({ answer: UNSUPPORTED_ANSWER })).includes("SUPPORTED_FLAG_MISMATCH"));
  assert.ok(codes(answer({ answer: "The knowledge base does not say." })).includes("SUPPORTED_FLAG_MISMATCH"));
});

test("NONCANONICAL_UNSUPPORTED is a warning", () => {
  const v = validateAnswer(answer({ supported: false, citations: [], answer: "I don't know." }), R);
  assert.equal(v.issues[0]?.code, "NONCANONICAL_UNSUPPORTED");
  assert.equal(v.passed, true);
});

test("number normalization: 1,000 vs 1000 in both directions", () => {
  assert.deepEqual([...extractNumbers("1,000 and 1,000,000")], ["1000", "1000000"]);
  const a = answer({ answer: "Pro plans allow 1,000 requests per minute." });
  assert.ok(!codes(a, retrieval("Pro plans allow 1000 requests per minute.")).includes("UNGROUNDED_NUMBER"));
  const b = answer({ answer: "Pro plans allow 1000 requests per minute." });
  assert.ok(!codes(b, retrieval("Pro plans allow 1,000 requests per minute.")).includes("UNGROUNDED_NUMBER"));
});

test("$0.50 is grounded by 0.50", () => {
  assert.deepEqual([...extractNumbers("$0.50")], ["0.50"]);
  const a = answer({ answer: "Extra requests cost $0.50 each." });
  assert.ok(!codes(a, retrieval("Extra requests cost 0.50 each.")).includes("UNGROUNDED_NUMBER"));
});

test("enforce downgrades a failed supported answer", () => {
  const a = answer({ answer: "Pro plans allow 300 requests per minute." });
  const v = validateAnswer(a, R);
  const f = enforce(a, v, R);
  assert.equal(f.answer, UNSUPPORTED_ANSWER);
  assert.equal(f.supported, false);
  assert.deepEqual(f.citations, []);
  assert.equal(f.downgraded, true);
  assert.deepEqual(f.retrieved_chunk_ids, ["d.md#c0"]);
});

test("enforce keeps a valid supported answer", () => {
  const a = answer({});
  const f = enforce(a, validateAnswer(a, R), R);
  assert.equal(f.answer, a.answer);
  assert.equal(f.supported, true);
  assert.equal(f.downgraded, false);
});

test("gated answer passes with info issues only, without calling the LLM", async () => {
  const r: RetrievalResult = { id: 2, question: "???", retrieved_chunks: [], gate: "NO_RELEVANT_CONTEXT" };
  const a = await generateAnswer(r);
  assert.equal(a.answer, UNSUPPORTED_ANSWER);
  assert.equal(a.supported, false);
  assert.deepEqual(a.citations, []);
  assert.equal(a.gate, "NO_RELEVANT_CONTEXT");
  const v = validateAnswer(a, r);
  assert.equal(v.passed, true);
  assert.deepEqual(v.issues.map((i) => [i.code, i.severity]), [["NO_RELEVANT_CONTEXT", "info"]]);
  const f = enforce(a, v, r);
  assert.equal(f.downgraded, false);
});
