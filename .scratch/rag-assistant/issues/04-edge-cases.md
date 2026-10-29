# 04 Edge cases and failure modes

Type: grilling
Status: resolved
Blocked by: 01

## Question

How should the pipeline handle questions it can't answer, gibberish questions, an invalid `questions.json`, and other failures?

## Answer

- **Rule:** if the input set is broken (no key, no docs, zero chunks, malformed or duplicate-id `questions.json`, embedding failure), stop the run with exit 1 and list every problem. If a single question is broken (empty, symbols only, too long, gibberish, LLM failure, bad model output), give the canonical unsupported answer for that question and let the run finish.
- **Gibberish gate:** if the question's highest cosine against any chunk is below `MIN_RELEVANCE` = 0.20, skip the LLM. Measured on 2026-10-29 with `text-embedding-3-small` against the fixtures: gibberish and off-topic questions scored 0.08–0.18, real questions the docs can't answer scored 0.30–0.44, and answerable questions scored 0.65+. Real questions the docs can't answer still go to the LLM.
- New issue codes: `LLM_CALL_FAILED`, `SUPPORTED_FLAG_MISMATCH`, `NONCANONICAL_UNSUPPORTED`, and the info-level codes `INVALID_QUESTION` and `NO_RELEVANT_CONTEXT`.
- The full table (E1–E19) is in `spec.md` under "Edge cases and failure modes".
