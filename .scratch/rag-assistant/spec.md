# Spec: Grounded RAG assistant (TypeScript)

Implements every MUST and SHOULD item in `problem_statement.md`. Time budget: 50 minutes. Decisions behind this spec are in [map.md](map.md).

## Fixed decisions

| Area | Decision |
|---|---|
| Runtime | Node 22, TypeScript run with `tsx`. No build step. Env from `node --env-file-if-exists=.env`. |
| Dependencies | `openai`, `zod`. Dev: `tsx`, `typescript`, `@types/node`. No vector DB, no LangChain. |
| Chat model | `gpt-6-luna` through Chat Completions with `response_format: json_schema, strict: true`. Do **not** send `temperature` (the model rejects anything but 1). Send `seed: 7`. |
| Embeddings | `text-embedding-3-small`. |
| No API key | Stop in INIT with `OPENAI_API_KEY is required. Copy .env.example to .env.` and exit code 1. Write no artifacts. |
| Retrieval | Hybrid, in memory: BM25 + embedding cosine, fused by Reciprocal Rank Fusion. Top 3. |
| Chunking | Structural: markdown headings, then paragraphs, merged up to `CHUNK_SIZE`. |
| Validation | Deterministic. Hard failures **downgrade** the answer to the canonical unsupported answer. No LLM judge. |

## Layout

```
package.json          scripts: start, test
tsconfig.json         strict, module nodenext, noEmit
.env.example          OPENAI_API_KEY=
src/
  config.ts           every constant below
  types.ts            zod schemas + inferred types for each artifact record
  pipeline.ts         entry point: stage runner, summary print
  stages/
    load.ts           loadDocuments, loadQuestions
    chunk.ts          chunkDocument (pure)
    index.ts          buildIndex (BM25 stats + embeddings)
    retrieve.ts       retrieve (pure, given index + query embedding)
    generate.ts       generateAnswer (LLM call + prompt)
    validate.ts       validateAnswer (pure), enforce (pure)
  llm.ts              OpenAI client, call wrapper that appends to llm_calls.jsonl
  io.ts               writeJson, artifact paths
test/
  chunk.test.ts       unit: offsets, ids, size cap
  validate.test.ts    unit: each issue code
  artifacts.test.ts   reads artifacts/, asserts the section 9 checks
```

## Constants (`src/config.ts`)

```ts
export const CHUNK_SIZE = 800;          // max chars per chunk
export const TOP_K = 3;
export const RRF_K = 60;
export const CHAT_MODEL = "gpt-6-luna";
export const EMBED_MODEL = "text-embedding-3-small";
export const UNSUPPORTED_ANSWER = "The knowledge base does not provide enough information to answer this.";
export const MIN_TERM_OVERLAP = 0.5;    // soft grounding warning threshold
export const MIN_RELEVANCE = 0.20;      // max cosine below this => skip LLM, answer unsupported.
                                        // Measured 2026-10-29: gibberish/off-topic 0.08-0.18, real-but-unsupported 0.30-0.44, answerable 0.65+
export const MAX_QUESTION_CHARS = 2000; // longer questions are rejected as INVALID_QUESTION
export const DOCS_DIR = "docs"; export const QUESTIONS_PATH = "questions.json"; export const ARTIFACTS_DIR = "artifacts";
```

## Stages

`pipeline.ts` defines `type Stage = "INIT" | "DOCUMENTS_LOADED" | ... | "VALIDATION_COMPLETE"` as a const array in the order the problem statement gives. Each stage is its own function. Each stage writes its artifact before the next stage starts, and the runner logs `[STAGE] <name>` each time it moves on. Delete and recreate `artifacts/` in INIT so a run never keeps stale outputs.

### INIT
Check `OPENAI_API_KEY`. Reset `artifacts/`.

### DOCUMENTS_LOADED → `artifacts/documents.json`
- Read every `.md` and `.txt` file under `docs/`, including subfolders. Sort paths so the order is deterministic, and ignore other file types.
- Normalize `\r\n` to `\n` before storing. Offsets refer to the normalized text.
- `doc_id` is the posix relative path, e.g. `pricing.md`. `path` is `docs/pricing.md`.
- Record: `{ doc_id, path, text }`.
- Zero documents is a fatal error with a clear message.

### CHUNKS_CREATED → `artifacts/chunks.json`
`chunkDocument(doc): Chunk[]`, a pure function.
1. Split into **sections** at lines matching `^#{1,6} ` (markdown). A `.txt` file, or text with no headings, is one section.
2. Split each section into **paragraphs** at `\n\s*\n`, tracking absolute offsets.
3. Greedily merge consecutive paragraphs **within a section** while the merged span is `<= CHUNK_SIZE`. Never merge across sections.
4. Split any single paragraph longer than `CHUNK_SIZE` at the last sentence end (`. `), or at the last space before the limit.
5. Trim whitespace by moving the offsets, not by editing the text.
- Invariant: `chunk.text === doc.text.slice(start_char, end_char)`. A unit test asserts it.
- `chunk_id = \`${doc_id}#c${n}\`` where `n` is the chunk's 0-based index within the doc. It is stable for the same input.
- `heading` is the nearest heading line (without `#`), or `""`. It goes into the BM25 and embedding input as `heading + "\n" + text`. It is also stored on the chunk as an extra field.
- Record: `{ chunk_id, doc_id, text, start_char, end_char, heading }`.

### INDEX_BUILT → `artifacts/index.json`
- **BM25**: tokenize to lowercase alphanumerics (keep `429`, `2xx`) and drop a short stopword list. Store document frequency, average chunk length and per-chunk term frequencies. k1 = 1.5, b = 0.75.
- **Embeddings**: one batched `embeddings.create` call over all chunk inputs.
- Write `{ embed_model, chunk_ids, bm25: {...}, embeddings: number[][] }`. This makes it visible that the index is built at runtime.
- Log the embedding call to `llm_calls.jsonl` with `stage: "index_build"` and `question_id: null`.

### QUESTIONS_LOADED
- Two levels of checking. The file level fails fast; the question level falls back per question (see "Edge cases").
- **File level, fatal** (exit 1 with every problem listed; artifacts from earlier stages stay on disk for debugging):
  - The file is missing.
  - It isn't valid JSON (the message includes the parse error).
  - The top level isn't an array.
  - An item isn't an object.
  - `id` is missing or isn't a number or string.
  - `question` is missing or isn't a string.
  - There are duplicate ids.
- An empty array is **not** fatal. The pipeline runs with 0 questions and the summary says so.
- **Question level, not fatal.** Run `classifyQuestion(text)`, a pure function. It returns `INVALID_QUESTION` when the question:
  - is empty or whitespace only after trimming, or
  - has no word token of 2 or more letters or digits (e.g. `"???!!!"`), or
  - is longer than `MAX_QUESTION_CHARS`.
- Embed only the valid questions, in one batched call logged with `stage: "query_embedding"`.
- Strip a UTF-8 BOM before `JSON.parse`. The same applies when reading docs.

### RETRIEVAL_COMPLETE → `artifacts/retrieval_results.json`
`retrieve(question, qEmbedding, index): RetrievedChunk[]`, a pure function.
- Rank all chunks by BM25 and, separately, by cosine similarity.
- RRF: `fused = 1/(RRF_K + rank_bm25) + 1/(RRF_K + rank_cos)` with 1-based ranks.
- `score = fused / (2 / (RRF_K + 1))`, normalized to [0, 1]. Round to 4 decimal places. Break ties by `chunk_id`.
- Take the top `TOP_K`, or fewer if the corpus has fewer chunks. Record: `{ id, question, retrieved_chunks: [{ chunk_id, doc_id, score, text, bm25, cosine }], gate }`.
- `gate`, computed deterministically here and acted on in generation:
  - `"INVALID_QUESTION"` when `classifyQuestion` rejected the question. `retrieved_chunks` is `[]` because there was nothing to embed.
  - `"NO_RELEVANT_CONTEXT"` when the highest cosine over **all** chunks is below `MIN_RELEVANCE`. The retrieved chunks are still recorded so the decision can be audited.
  - `null` when the question passes.

### ANSWERS_GENERATED → `artifacts/answers.json` (raw model output)
- If `gate` is not null, **skip the LLM**. Write `{ answer: UNSUPPORTED_ANSWER, supported: false, citations: [], gate }`. No call is logged.
- Otherwise, make one call per question, all run concurrently with `Promise.all`. The SDK default of 2 retries is enough.
- Wrap each call in try/catch. If an API error remains after the retries (429, 5xx, timeout, refusal), it must not fail the whole run. Record the canonical unsupported answer and give the question the issue `LLM_CALL_FAILED` with the error message.

System prompt (all four required instructions are explicit):
```
You answer questions about a developer platform using ONLY the context chunks provided.
Rules:
1. Use only facts stated in the context. Do not use outside knowledge.
2. If the context does not contain the answer, set supported=false, citations=[], and answer exactly:
   "The knowledge base does not provide enough information to answer this."
3. If supported=true, cite every chunk you used by its exact chunk_id in citations. Cite only chunk_ids that appear in the context.
4. Never invent product features, limits, prices, or policies. Copy numbers exactly as written in the context.
5. If the context answers only part of the question, answer that part and say what is not covered.
Keep the answer to 1-3 sentences.
```
User message: `Question: ...` followed by each chunk as `[chunk_id: pricing.md#c1]\n<heading>\n<text>`.

Strict JSON schema: `{ answer: string, supported: boolean, citations: string[] }`. Parse it with zod. If parsing fails, record an answer with `supported: false`, `citations: []` and `answer: UNSUPPORTED_ANSWER`, and give its validation entry the issue `MODEL_OUTPUT_INVALID`.

Record: `{ id, question, answer, supported, citations }`.

Logging: append one line per call to `artifacts/llm_calls.jsonl`, using exactly the fields in problem statement section 8. `provider: "openai"`. `prompt_hash` is the sha256 hex of `JSON.stringify(messages)`. `input_artifacts: ["artifacts/retrieval_results.json"]`, `output_artifact: "artifacts/answers.json"`.

### CITATIONS_VALIDATED → `artifacts/citation_validation.json`
`validateAnswer(answer, retrieval): ValidationResult`, a pure function with no I/O. Issues are `{ code, severity: "error" | "warning", detail }`.

| Code | Severity | Rule |
|---|---|---|
| `CITATION_NOT_RETRIEVED` | error | A cited id is not among this question's retrieved chunk_ids. |
| `SUPPORTED_WITHOUT_CITATION` | error | `supported` is true and `citations` is empty. |
| `UNSUPPORTED_WITH_CITATION` | error | `supported` is false and `citations` is not empty. |
| `UNGROUNDED_NUMBER` | error | A number in the answer is not found in the cited chunks' text (grounding check 1). |
| `LOW_TERM_OVERLAP` | warning | Fewer than `MIN_TERM_OVERLAP` of the answer's content terms appear in the cited text (grounding check 2). |
| `MODEL_OUTPUT_INVALID` | error | Set during generation if the model output didn't parse, or if the model refused. |
| `LLM_CALL_FAILED` | error | The API call still failed after retries. |
| `SUPPORTED_FLAG_MISMATCH` | error | `supported` is true but the answer is the canonical unsupported sentence, or says the knowledge base doesn't cover it. |
| `NONCANONICAL_UNSUPPORTED` | warning | `supported` is false but the answer text isn't the canonical sentence. Enforcement replaces it with the canonical text. |
| `INVALID_QUESTION` | info | The gate rejected the question as empty, symbol-only or too long. `passed` stays true: the fallback is the correct output. |
| `NO_RELEVANT_CONTEXT` | info | The gate found no chunk with cosine ≥ `MIN_RELEVANCE`. `passed` stays true. |

Allow `"info"` as a severity. Do not normalize cited ids; any id that doesn't match exactly counts as `CITATION_NOT_RETRIEVED`, which makes fabricated or reformatted ids visible.

The number check, which needs care because luna rewrites `1000` as `1,000`:
- Extract numbers with `/\d+(?:[.,]\d+)*/g` and normalize by removing `,` thousands separators. `1,000` becomes `1000`, `0.50` stays `0.50`, `$49` becomes `49`, `24` stays `24`.
- Collect the cited text's numbers the same way. Each number in the answer must be in that set.
- Skip the check when `supported` is false.
- Known limitation: numbers written as words ("eight") are not checked. Put this in the README.

Term overlap: content terms are tokens of 4 or more characters that are not stopwords. Compare the first 5 characters of each term so that `retained` matches `retention`. Skip the check when `supported` is false.

`passed = no error-severity issues`. Record: `{ id, passed, issues }`. The problem requires `issues` to be an array; an array of objects is fine.

**Enforce** (`enforce(answer, validation)`, pure): if `passed` is false, the final answer becomes `{ answer: UNSUPPORTED_ANSWER, supported: false, citations: [] }` with `downgraded: true`. `answers.json` keeps the raw model output so the change can be audited.

### RESULTS_EXPORTED → `artifacts/final_answers.json`
One record per question:
```json
{ "id": 1, "question": "...", "answer": "...", "supported": true,
  "citations": ["authentication.md#c1"], "retrieved_chunk_ids": ["..."],
  "validation": { "passed": true, "issues": [] }, "downgraded": false }
```

### VALIDATION_COMPLETE
- Re-read the artifacts written in this run and assert the section 9 invariants. Reuse the same `checkArtifacts()` function that `test/artifacts.test.ts` calls.
- Print the summary:
```
Documents: 6 | Chunks: N | Questions: 10 | Supported: X | Validation failures: Y | Downgraded: Z
```
- Exit code 0 even when Y > 0, because validation failures are expected data. Exit non-zero only when `checkArtifacts` fails, which means the pipeline itself is broken.

## Edge cases and failure modes

Rule: if the **input set** is broken, stop the run with a clear message (exit 1). If **one question** is broken, give the canonical unsupported answer for that question and finish the run.

| # | Case | Stage | Behavior |
|---|---|---|---|
| E1 | `OPENAI_API_KEY` missing | INIT | Fatal, before any artifact is written. |
| E2 | `docs/` missing, or no `.md`/`.txt` files in it | DOCUMENTS_LOADED | Fatal: `No .md or .txt files found in docs/`. |
| E3 | A doc is empty, whitespace only, or has a BOM or `\r\n` | DOCUMENTS_LOADED / CHUNKS | BOM stripped and line endings normalized. An empty doc is kept in documents.json with 0 chunks, and a warning is logged. |
| E4 | Every doc is empty, so there are 0 chunks | CHUNKS_CREATED | Fatal: there is nothing to retrieve from. |
| E5 | Fewer than 3 chunks in total | RETRIEVAL | Return all of them. The "at most 3" check still holds. |
| E6 | `questions.json` missing, not valid JSON, wrong top-level shape, item missing `id`/`question`, wrong types, duplicate ids | QUESTIONS_LOADED | Fatal. Every violation is listed with its array index. |
| E7 | `questions.json` is `[]` | QUESTIONS_LOADED | Not fatal. Artifacts are written as empty arrays, the summary shows 0, and the tests pass. |
| E8 | Question is empty, whitespace only, symbols only, or over 2000 chars | RETRIEVAL gate | `INVALID_QUESTION`. No embedding or LLM call; canonical unsupported answer. |
| E9 | Gibberish or off-topic question (`asdkjh qwerty`, `meaning of life?`) | RETRIEVAL gate | `NO_RELEVANT_CONTEXT` when the highest cosine is below 0.20. LLM skipped. |
| E10 | Real question that the docs don't answer (GraphQL, SLA) | GENERATION | Goes to the LLM, which returns supported=false. The validators then enforce the canonical form. |
| E11 | Partly answerable question ("free plan and SSO?") | GENERATION | Prompt rule 5: answer the covered part and name the gap. The validators still apply to every number in the answer. |
| E12 | Model returns invalid JSON or refuses | GENERATION | `MODEL_OUTPUT_INVALID`, then fall back to unsupported. |
| E13 | API error remains after retries | GENERATION | `LLM_CALL_FAILED` for that question; other questions continue. An embedding failure in INDEX_BUILT is fatal. |
| E14 | Model cites a fabricated or reformatted chunk id | VALIDATION | `CITATION_NOT_RETRIEVED`, then downgrade. |
| E15 | Model says supported=true but the answer says "not available" | VALIDATION | `SUPPORTED_FLAG_MISMATCH`, then downgrade. |
| E16 | Model makes up a number, or uses a stale one (300 rpm) without citing the chunk it came from | VALIDATION | `UNGROUNDED_NUMBER`, then downgrade. |
| E17 | Prompt injection in a question or doc ("ignore previous instructions…") | GENERATION | Chunks sit inside delimited `[chunk_id: …]` blocks and the question is labeled as data. Strict JSON schema plus the validators limit what a successful injection can produce. Documented as a limitation in the README. |
| E18 | Two docs have the same text, or one doc is very large | CHUNKS | Chunk ids include the doc path, so they stay unique. Large docs are hard-split at `CHUNK_SIZE`. The embedding call is batched in groups of 100 inputs. |
| E19 | Question ids mix numbers and strings | All | Ids keep their original type in every artifact. Duplicate detection compares `String(id)`. |

Test fixtures for the cases above: `test/fixtures/questions/{not-json.json, not-array.json, missing-question.json, dup-ids.json, empty.json}`. Unit-test `loadQuestions` against each one: fatal for all except `empty.json`. Unit-test `classifyQuestion` with `""`, `"   "`, `"???!!!"`, a 2001-char string, and a normal question.

## `npm test`
`node --test --import tsx test/*.test.ts`.
- **Unit tests**, which need no key: chunk offsets equal the slice, ids are stable across two runs, no chunk exceeds `CHUNK_SIZE`, and `.txt` files with no headings still chunk. There is one validator test per issue code, plus `1,000` matching `1000`.
- **Artifact checks** (`checkArtifacts`):
  - All 7 required artifacts exist and parse as JSON.
  - `llm_calls.jsonl` parses one line at a time.
  - Every question id appears exactly once in `answers.json` and in `final_answers.json`.
  - Each question has at most 3 retrieved chunks.
  - Every citation in `final_answers.json` is in that question's `retrieved_chunk_ids`.
  - Unsupported answers have no citations, and supported answers have at least one.
  - If `artifacts/` is missing, fail with a clear message: `run npm start first`.

## README
Cover setup (`npm install`, `cp .env.example .env`), `npm start`, `npm test`, the stage list and the artifact each stage writes, the retrieval and chunking choices with one line of reasoning each, the validation rules table, the downgrade behavior, and the known limitations: luna is non-deterministic because its temperature is fixed at 1, number words aren't checked, and BM25 tokenization is English-only.

## Expected results on the sample fixtures (acceptance)
| Q | Expect |
|---|---|
| 1 auth methods | supported: API keys (Bearer), OAuth 2.0 client credentials, mTLS on Enterprise |
| 2 delivery logs | supported: 30 days (distractor: API request logs, 90 days) |
| 3 startup free plan | supported: Free plan open to all; no startup-specific plan |
| 4 exceed rate limit | supported: 429 + Retry-After; blocked 1 hour after 15 minutes of sustained excess |
| 5 immediate delete | supported: Enterprise only with `purge=true`; otherwise purged within 30 days |
| 6 GraphQL subs | **unsupported**, no citations (near miss: SSE streaming in the changelog) |
| 7 Pro rpm | supported: 600 (distractor: old 300 in the changelog) |
| 8 verify webhook | supported, paraphrased question: HMAC-SHA256 `Nimbus-Signature` header |
| 9 99.99% SLA | **unsupported** (Enterprise exists, but no SLA is stated) |
| 10 retry duration | supported: up to 8 retries over 24 hours |
| 11 `asdkjh qwerty zxcv ???` | **unsupported**, gate `NO_RELEVANT_CONTEXT`, no LLM call |
| 12 `"   "` | **unsupported**, gate `INVALID_QUESTION`, `retrieved_chunks: []` |
| 13 "What is the meaning of life?" | **unsupported**, gate `NO_RELEVANT_CONTEXT` (measured cosine 0.075) |

Done when: `rm -rf artifacts && npm start && npm test` passes from a clean checkout. All 13 questions should give the expected supported/unsupported result. Allow at most one miss, because the model isn't deterministic. `llm_calls.jsonl` should hold exactly 10 `answer_generation` lines, one for each question that passed the gate.

## Build order (≈50 min)
1. Scaffold `package.json`, `tsconfig`, `config.ts`, `types.ts` and `io.ts` (5 min).
2. `load.ts` + `chunk.ts` + chunk unit tests (10 min).
3. `index.ts` + `retrieve.ts` (10 min).
4. `llm.ts` + `generate.ts` with logging (8 min).
5. `validate.ts` + validator unit tests (8 min).
6. `pipeline.ts` runner, export, `checkArtifacts`, summary (5 min).
7. README, then the clean-checkout run (4 min).

## As built (changes after review)

The implementation differs from the sections above in these places. README.md describes the current behavior.

- **Chunking:** after the per-section pass, a chunk that starts a new section is merged into the previous chunk when both fit in `CHUNK_SIZE`. Reason: Q1 retrieved only 1 of 3 auth methods because 112-char sections each took a top-3 slot. Sample docs went from 23 to 12 chunks.
- **Prompt:** each context chunk is rendered with its heading, so `RetrievedChunk` carries `heading`.
- **Models:** `src/models.ts` tries `gpt-6-luna`, `gpt-5.6-luna`, `gpt-4.1-mini` in order (`OPENAI_MODELS` overrides). 400/403/404 marks a model unavailable for the run; 429, 5xx and connection errors try the next model; 401 is fatal. `Answer` records the `model` that answered, and each attempt is logged before it is sent.
- **Runtime:** `.env` is loaded in code (`src/env.ts`); Node >= 22 because the test glob needs it. `npm run verify` runs typecheck, pipeline and tests.
- **INIT:** `questions.json` is validated before any API call.
- **Generation:** at most `GENERATION_CONCURRENCY = 5` calls at once.
- **Checks:** `checkArtifacts` also matches `citation_validation.json` ids to question ids.
