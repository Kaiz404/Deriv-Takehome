import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK_SIZE, DOCS_DIR } from "../src/config.ts";
import { chunkDocument } from "../src/stages/chunk.ts";
import { loadDocuments } from "../src/stages/load.ts";

test("real docs: slice invariant, size cap, stable unique ids", async () => {
  for (const doc of await loadDocuments(DOCS_DIR)) {
    const chunks = chunkDocument(doc);
    assert.ok(chunks.length > 0, doc.doc_id);
    for (const c of chunks) {
      assert.equal(c.text, doc.text.slice(c.start_char, c.end_char));
      assert.ok(c.end_char - c.start_char <= CHUNK_SIZE, c.chunk_id);
      assert.ok(c.text.length > 0 && c.text === c.text.trim());
    }
    const ids = chunks.map((c) => c.chunk_id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, chunkDocument(doc).map((c) => c.chunk_id));
  }
});

test("headings: .txt has none, markdown chunks carry their section heading", async () => {
  const docs = await loadDocuments(DOCS_DIR);
  const txt = chunkDocument(docs.find((d) => d.doc_id === "changelog.txt")!);
  assert.ok(txt.length >= 1 && txt.every((c) => c.heading === ""));
  const md = chunkDocument({ doc_id: "x.md", path: "x", text: "intro\n\n# Title\n\nbody one\n\n## Sub\n\nbody two" });
  assert.deepEqual(md.map((c) => c.heading), ["", "Title", "Sub"]);
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
