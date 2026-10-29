import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_SIZE, DOCS_DIR } from "../src/config.ts";
import { chunkDocument } from "../src/stages/chunk.ts";
import { loadDocuments } from "../src/stages/load.ts";

test("real docs: slice invariant, size cap, stable unique ids", async () => {
  for (const doc of await loadDocuments(DOCS_DIR)) {
    const chunks = chunkDocument(doc);
    for (const c of chunks) {
      assert.equal(c.text, doc.text.slice(c.start_char, c.end_char));
      assert.ok(c.end_char - c.start_char <= CHUNK_SIZE, c.chunk_id);
      assert.ok(c.text.length > 0 && c.text === c.text.trim());
    }
    const ids = chunks.map((c) => c.chunk_id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, chunks.map((_, i) => `${doc.doc_id}#c${i}`));
    assert.deepEqual(ids, chunkDocument(doc).map((c) => c.chunk_id));
  }
});

test("headings: .txt has none, markdown chunks carry their section heading", () => {
  const txt = chunkDocument({ doc_id: "n.txt", path: "n.txt", text: "first para\n\nsecond para" });
  assert.ok(txt.length >= 1 && txt.every((c) => c.heading === ""));
  const md = chunkDocument({
    doc_id: "x.md",
    path: "x",
    text: `${"a".repeat(500)}\n\n# Title\n\n${"b".repeat(500)}\n\n## Sub\n\n${"c".repeat(500)}`,
  });
  assert.deepEqual(md.map((c) => c.heading), ["", "Title", "Sub"]);
});

test("tiny sections merge into one chunk", () => {
  const text = "# T\n\nintro\n\n## A\n\nshort a\n\n## B\n\nshort b";
  const chunks = chunkDocument({ doc_id: "t.md", path: "t.md", text });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, text);
  assert.equal(chunks[0].heading, "T");
  assert.equal(chunks[0].chunk_id, "t.md#c0");
});

test("sections of ~500 chars are not merged past CHUNK_SIZE", () => {
  const body = "x".repeat(500);
  const text = ["# A", body, "## B", body, "## C", body].join("\n\n");
  const chunks = chunkDocument({ doc_id: "s.md", path: "s.md", text });
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks.map((c) => c.heading), ["A", "B", "C"]);
  assert.deepEqual(chunks.map((c) => c.chunk_id), ["s.md#c0", "s.md#c1", "s.md#c2"]);
  for (const c of chunks) {
    assert.ok(c.text.startsWith("#"));
    assert.equal(c.text, text.slice(c.start_char, c.end_char));
    assert.ok(c.end_char - c.start_char <= CHUNK_SIZE);
  }
});

test("oversize paragraph is hard-split within CHUNK_SIZE", () => {
  const text = "word ".repeat(600).trim();
  const chunks = chunkDocument({ doc_id: "big.txt", path: "big.txt", text });
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.end_char - c.start_char <= CHUNK_SIZE);
    assert.equal(c.text, text.slice(c.start_char, c.end_char));
  }
});
