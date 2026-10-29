# Map: Grounded RAG assistant (TypeScript)

Label: wayfinder:map

## Destination

A hand-off-ready implementation spec ([spec.md](spec.md)) for the TypeScript RAG pipeline in `problem_statement.md`, plus sample `docs/` + `questions.json` fixtures, buildable in ~50 minutes.

## Notes

- Domain: L1 AI-engineering take-home; evaluator swaps fixtures and reruns from clean checkout.
- Standing preference: determinism wherever possible; no frameworks, no vector DB.
- Budget: at most 2 grill sessions (both used during charting).
- Implementation was done in this repo after charting; `README.md` and `AGENTS.md` describe the result.

## Decisions so far

- [01 Retrieval, chunking, validation, no-key mode](issues/01-retrieval-chunking-validation.md) — hybrid BM25+embedding RRF in memory; structural heading/paragraph chunking; deterministic validators that downgrade on hard failure; no key = refuse at INIT.
- [02 Models and tooling](issues/02-models-and-tooling.md) — `gpt-6-luna` (no temperature param, strict JSON schema verified) + `text-embedding-3-small`; tsx + node:test.
- [03 Author sample fixtures](issues/03-sample-fixtures.md) — 6 docs (5 md + 1 headingless txt) and 13 questions: 2 the docs don't cover, 3 gibberish or blank, and stale-number distractors.
- [04 Edge cases and failure modes](issues/04-edge-cases.md) — a broken input set stops the run; a broken question falls back for that question only. Gibberish is caught by a cosine gate at 0.20, a measured value. 19 cases in the spec's edge-case table.
- Implementation: built and reviewed (code quality + spec adherence). Post-review changes are listed in [spec.md](spec.md) under "As built".

## Not yet specified

- None. The first real run settled chunking (small sections now merge; see spec "As built"). `MIN_TERM_OVERLAP` produced no false warnings on the sample run, so it stays at 0.5.

## Out of scope

- Vector database (LanceDB / sqlite-vec) — corpus is ~20 chunks; in-memory cosine is sufficient.
- LLM-judge grounding subagent — non-deterministic; deterministic validators chosen instead.
- No-key extractive fallback — user ruled the key always present.
