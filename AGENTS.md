# Agent guide

TypeScript RAG pipeline. Read `README.md` for what it does; this file is how to run and verify it.

## Run and verify

1. `npm install`. Needs Node >= 22.
2. Make sure `.env` has `OPENAI_API_KEY` (copy `.env.example`). If no key is available, run only `npm test`: unit tests need no network, and the artifact checks read the committed `artifacts/`.
3. `npm run verify` runs `tsc`, the full pipeline, then all tests. It must end with `# fail 0`.

A healthy run prints a summary like:

```
Documents: 6 | Chunks: 12 | Questions: 14 | Supported: 9 | Validation failures: 0 | Downgraded: 0
```

Counts change with `docs/` and `questions.json`. `npm start` exits 0 even when some answers fail validation (that is data); it exits 1 only when the inputs are broken or an artifact invariant fails.

## Checking results

- `artifacts/final_answers.json` is the answer of record. Confirm each `supported: true` answer is backed by the text of its cited chunks in `artifacts/retrieval_results.json`.
- `artifacts/citation_validation.json` lists issues per question; `error` issues cause a downgrade.
- `artifacts/answers.json` holds the raw model output and the `model` that answered.

## Rules for changes

- `npm start` calls the OpenAI API and costs money; run it once per change, not in loops.
- Unit tests must not hit the network and must not depend on the specific files in `docs/` (evaluators swap them).
- Commit regenerated `artifacts/` together with any change to `docs/` or `questions.json`, or `npm test` fails on a stale question count.
- Constants live in `src/config.ts`; the model chain in `src/models.ts`.
- Design decisions and edge cases: `.scratch/rag-assistant/spec.md`. The brief: `problem_statement.md`.
