import assert from "node:assert/strict";
import { test } from "node:test";
import OpenAI from "openai";
import { withModelFallback } from "../src/models.ts";

const apiError = (status: number) => OpenAI.APIError.generate(status, { message: `status ${status}` }, `status ${status}`, new Headers());

test("first model answers: no fallback", async () => {
  const tried: string[] = [];
  const out = await withModelFallback(async (m) => (tried.push(m), "ok"), ["a", "b", "c"], new Set());
  assert.deepEqual(out, { model: "a", result: "ok" });
  assert.deepEqual(tried, ["a"]);
});

test("404 on the primary falls through to the next model and is skipped for the rest of the run", async () => {
  const unavailable = new Set<string>();
  const call = async (m: string) => {
    if (m === "a") throw apiError(404);
    return m;
  };
  assert.equal((await withModelFallback(call, ["a", "b"], unavailable)).model, "b");
  assert.ok(unavailable.has("a"));

  const tried: string[] = [];
  await withModelFallback(async (m) => (tried.push(m), m), ["a", "b"], unavailable);
  assert.deepEqual(tried, ["b"], "a is not retried after a 404");
});

test("429, 5xx and connection errors fall through without marking the model unavailable", async () => {
  for (const err of [apiError(429), apiError(503), new OpenAI.APIConnectionError({ message: "down" })]) {
    const unavailable = new Set<string>();
    const out = await withModelFallback(async (m) => { if (m === "a") throw err; return m; }, ["a", "b"], unavailable);
    assert.equal(out.model, "b");
    assert.equal(unavailable.size, 0);
  }
});

test("401 is fatal: a bad key fails every model the same way", async () => {
  const tried: string[] = [];
  await assert.rejects(withModelFallback(async (m) => { tried.push(m); throw apiError(401); }, ["a", "b"], new Set()));
  assert.deepEqual(tried, ["a"]);
});

test("non-API errors are not swallowed", async () => {
  await assert.rejects(withModelFallback(async () => { throw new TypeError("bug"); }, ["a", "b"], new Set()), TypeError);
});

test("every model failing throws one error naming each failure", async () => {
  await assert.rejects(
    withModelFallback(async (m) => { throw apiError(m === "a" ? 404 : 500); }, ["a", "b"], new Set()),
    /All chat models failed\. a: .*\| b: /,
  );
});
