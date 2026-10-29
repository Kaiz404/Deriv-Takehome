# Nimbus RAG assistant

Answers questions from the docs in `docs/` with cited, validated answers. TypeScript, no framework, no vector DB.

## Run

Requires Node >= 22 and an OpenAI API key.

```sh
npm install
cp .env.example .env     # set OPENAI_API_KEY
npm run verify           # typecheck + full pipeline + tests
```

| Command | What it does |
|---|---|
| `npm start` | Runs the pipeline (~10s) from `docs/` and `questions.json`, writes `artifacts/`, prints a summary. |
| `npm test` | Unit tests (no network) and checks on the current `artifacts/`. |
| `npm run verify` | Both of the above, plus `tsc`. |

Swap in your own `docs/` (`.md`/`.txt`) and `questions.json` (`[{ "id", "question" }]`) and rerun. Without a key, `npm start` exits at INIT; the committed `artifacts/` come from a real run.

## Pipeline

| Stage | Output in `artifacts/` |
|---|---|
| DOCUMENTS_LOADED | `documents.json` |
| CHUNKS_CREATED | `chunks.json`: heading/paragraph chunks, `CHUNK_SIZE = 800`; small adjacent sections are merged |
| INDEX_BUILT | `index.json`: BM25 stats + `text-embedding-3-small` vectors |
| RETRIEVAL_COMPLETE | `retrieval_results.json`: top 3 by BM25 + cosine, fused with Reciprocal Rank Fusion |
| ANSWERS_GENERATED | `answers.json`: raw model output, including which `model` answered |
| CITATIONS_VALIDATED | `citation_validation.json` |
| RESULTS_EXPORTED | `final_answers.json`: answer, citations, retrieved ids, validation |
| VALIDATION_COMPLETE | re-checks every artifact; exits 1 if an invariant breaks |

Every OpenAI call is logged to `llm_calls.jsonl`.

**Models.** Chat models are tried in order: `gpt-6-luna`, `gpt-5.6-luna`, `gpt-4.1-mini` (`src/models.ts`). 400/403/404 skips a model for the rest of the run; 429, 5xx and network errors move to the next model after the SDK's retries; 401 stops. Override with `OPENAI_MODELS=a,b,c` and `OPENAI_EMBED_MODEL`.

**Gate.** Questions that are empty, symbol-only, over 2000 chars, or whose best chunk cosine is below `MIN_RELEVANCE = 0.20` skip the model and get the canonical unsupported answer. On the sample docs, junk scores ≤ 0.18 and real questions ≥ 0.30.

## Validation

Deterministic checks in `src/stages/validate.ts`. Any error replaces the final answer with *"The knowledge base does not provide enough information to answer this."*, `supported: false`, no citations, `downgraded: true`.

| Code | Severity | Rule |
|---|---|---|
| `CITATION_NOT_RETRIEVED` | error | Cited id is not in this question's retrieved chunks |
| `SUPPORTED_WITHOUT_CITATION` | error | `supported: true` with no citations |
| `UNSUPPORTED_WITH_CITATION` | error | `supported: false` with citations |
| `UNGROUNDED_NUMBER` | error | A number in the answer is not in the cited text (`1,000` = `1000`) |
| `SUPPORTED_FLAG_MISMATCH` | error | `supported: true` but the answer says the knowledge base does not cover it |
| `MODEL_OUTPUT_INVALID` | error | Output was not valid JSON for the schema, or the model refused |
| `LLM_CALL_FAILED` | error | Every model in the chain failed |
| `LOW_TERM_OVERLAP` | warning | Under half the answer's key terms appear in the cited text |
| `NONCANONICAL_UNSUPPORTED` | warning | Unsupported answer not worded as the canonical sentence |
| `INVALID_QUESTION`, `NO_RELEVANT_CONTEXT` | info | The gate skipped the model |

A broken input set (no key, no docs, invalid `questions.json`) stops the run with exit 1 and lists every problem. A broken single question only affects that question.

## Limitations

- `gpt-6-luna` only accepts the default temperature, so wording varies between runs; the validators are what keep answers grounded.
- Numbers written as words are not checked. The tokenizer is English-only.
- `MIN_RELEVANCE` was measured on the sample docs only.
- Prompt injection is mitigated (delimited context, strict schema, validators), not eliminated.
