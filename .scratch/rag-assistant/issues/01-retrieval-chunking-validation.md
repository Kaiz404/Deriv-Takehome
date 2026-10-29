# 01 Retrieval, chunking, validation, no-key mode

Type: grilling
Status: resolved

## Question

Does the pipeline need a vector DB, or prompt engineering plus validators? How should we chunk "semantically"? How are unsupported answers enforced? What happens without an API key?

## Answer

- **Retrieval:** hybrid in memory. BM25 + `text-embedding-3-small` cosine, fused with RRF (k=60), top 3, index saved to `artifacts/index.json`. No vector DB, because the corpus is about 20 chunks. Prompt-only "retrieval" is ruled out because the brief requires a saved top-3 retrieval stage.
- **Chunking:** structural "semantic" chunking. Split at markdown headings, then paragraphs, greedily merged within a section up to `CHUNK_SIZE` = 800. Offsets are exact and the result is deterministic. Embedding-breakpoint chunking was rejected for its cost, non-determinism and offset complexity.
- **Validation:** deterministic validators (citation ⊆ retrieved, supported⇔citations, numeric grounding, term-overlap warning). Any error-level issue downgrades the final answer to the canonical unsupported answer. `answers.json` keeps the raw output.
- **No key:** stop at INIT with a clear message. The key is assumed to be present.
