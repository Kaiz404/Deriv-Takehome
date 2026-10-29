# Nimbus RAG assistant

A small pipeline that answers questions about the Nimbus developer docs in `docs/`. Every answer is grounded in retrieved chunks, cites chunk ids, and is checked by deterministic validators before it is exported.

## Requirements

Node >= 22 and an OpenAI API key.

## Setup

```
npm install
cp .env.example .env    # set OPENAI_API_KEY
npm start               # runs the pipeline, writes artifacts/
npm test                # unit tests + artifact checks (run npm start first)
```

`.env` is loaded in code, so no shell flags are needed. Set `OPENAI_MODEL` and `OPENAI_EMBED_MODEL` to override the defaults (`gpt-6-luna`, `text-embedding-3-small`).

Without `OPENAI_API_KEY`, `npm start` refuses to run at INIT: it prints `OPENAI_API_KEY is required. Copy .env.example to .env.` and exits 1 before writing anything. The committed `artifacts/` come from a real run, so the outputs can be inspected without a key. `npm test` fails with "run npm start first" if `artifacts/` is missing.

## Stages and artifacts

| Stage | Artifact |
|---|---|
| INIT | resets `artifacts/` |
| DOCUMENTS_LOADED | `documents.json` |
| CHUNKS_CREATED | `chunks.json` |
| INDEX_BUILT | `index.json` (BM25 stats + embeddings) |
| QUESTIONS_LOADED | none (query embeddings stay in memory) |
| RETRIEVAL_COMPLETE | `retrieval_results.json` |
| ANSWERS_GENERATED | `answers.json` (raw model output) |
| CITATIONS_VALIDATED | `citation_validation.json` |
| RESULTS_EXPORTED | `final_answers.json` |
| VALIDATION_COMPLETE | re-checks all artifacts, prints the summary |

Offsets (`start_char`, `end_char`) refer to the BOM-stripped, LF-normalized text, not the raw file bytes.

Answer generation runs at most `GENERATION_CONCURRENCY = 5` calls at once (`src/config.ts`), preserving question order.

Every OpenAI call is appended to `artifacts/llm_calls.jsonl`.

## Design choices

- **Retrieval:** BM25 and embedding cosine, fused with Reciprocal Rank Fusion, top 3, all in memory. BM25 catches exact tokens such as `429`; embeddings catch paraphrases. The corpus is tiny, so there is no vector DB.
- **Chunking:** split at markdown headings, then paragraphs, merged up to `CHUNK_SIZE = 800` characters (`src/config.ts`). Chunks follow the doc structure, so a fact and its heading stay together.
- **Gibberish gate:** if the best cosine over all chunks is below `MIN_RELEVANCE = 0.20`, the LLM is skipped and the canonical unsupported answer is returned. The threshold was measured on the sample fixtures: gibberish and off-topic questions score 0.08-0.18, real-but-unanswerable ones 0.30-0.44, answerable ones 0.65+.

## Validation rules

| Code | Severity | Rule |
|---|---|---|
| `CITATION_NOT_RETRIEVED` | error | A cited id is not among the question's retrieved chunk ids. |
| `SUPPORTED_WITHOUT_CITATION` | error | `supported` is true and `citations` is empty. |
| `UNSUPPORTED_WITH_CITATION` | error | `supported` is false and `citations` is not empty. |
| `UNGROUNDED_NUMBER` | error | A number in the answer is not in the cited chunks' text. |
| `LOW_TERM_OVERLAP` | warning | Too few of the answer's content terms appear in the cited text. |
| `MODEL_OUTPUT_INVALID` | error | The model output did not parse, or the model refused. |
| `LLM_CALL_FAILED` | error | The API call failed after retries. |
| `SUPPORTED_FLAG_MISMATCH` | error | `supported` is true but the answer says the knowledge base does not cover it. |
| `NONCANONICAL_UNSUPPORTED` | warning | `supported` is false but the text is not the canonical sentence. |
| `INVALID_QUESTION` | info | Empty, symbol-only or over-long question; the gate skipped retrieval and the LLM. |
| `NO_RELEVANT_CONTEXT` | info | No chunk reached `MIN_RELEVANCE`; the LLM was skipped. |

A question passes when it has no error-severity issue.

## Downgrade behavior

If validation fails, `final_answers.json` replaces the answer with the canonical unsupported sentence, `supported: false`, no citations, and `downgraded: true`. `answers.json` is the raw model output, kept for audit; the citation rules are enforced on `final_answers.json`, where failures downgrade. Validation failures are expected data and do not change the exit code.

## Failure handling

If the input set is broken (no API key, no docs, bad `questions.json`, no chunks, failed embedding call), the run stops with exit 1 and lists every problem. If a single question is broken (invalid text, no relevant context, LLM error or bad output), that question gets the canonical unsupported answer and the run finishes.

## Known limitations

- `gpt-6-luna` has a fixed temperature, so answers vary from run to run.
- Numbers written as words ("eight") are not checked.
- The BM25 tokenizer and stopword list are English-only.
- Prompt injection is mitigated (delimited chunks, strict JSON schema, validators), not eliminated.
