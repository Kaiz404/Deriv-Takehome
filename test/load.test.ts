import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MAX_QUESTION_CHARS } from "../src/config.ts";
import { classifyQuestion, loadDocuments, loadQuestions } from "../src/stages/load.ts";
import { PipelineError } from "../src/types.ts";

const fixture = (name: string) => `test/fixtures/questions/${name}`;

for (const name of ["not-json.json", "not-array.json", "missing-question.json", "dup-ids.json", "missing.json"]) {
  test(`loadQuestions: ${name} is fatal`, async () => {
    await assert.rejects(loadQuestions(fixture(name)), PipelineError);
  });
}

test("loadQuestions: empty array is allowed", async () => {
  assert.deepEqual(await loadQuestions(fixture("empty.json")), []);
});

test("loadQuestions: reports every problem with its index", async () => {
  await assert.rejects(loadQuestions(fixture("dup-ids.json")), (e: PipelineError) => e.problems[0].startsWith("[1]"));
});

test("classifyQuestion", () => {
  for (const bad of ["", "   ", "???!!!", "a".repeat(MAX_QUESTION_CHARS + 1)]) {
    assert.equal(classifyQuestion(bad), "INVALID_QUESTION");
  }
  assert.equal(classifyQuestion("What is the rate limit?"), null);
});

test("loadDocuments: fixture dir returns sorted posix doc_ids", async () => {
  const docs = await loadDocuments("test/fixtures/docs");
  assert.deepEqual(docs.map((d) => d.doc_id), ["a.md", "sub/b.txt"]);
  assert.ok(docs.every((d) => !d.path.includes("\\") && d.text.length > 0));
});

test("loadDocuments: dir without md/txt throws", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "docs-"));
  await writeFile(path.join(dir, "a.json"), "{}");
  await assert.rejects(loadDocuments(dir), PipelineError);
  await assert.rejects(loadDocuments(path.join(dir, "nope")), PipelineError);
});
