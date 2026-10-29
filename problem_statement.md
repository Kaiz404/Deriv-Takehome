## BUILD

Build a small AI assistant that answers user questions from a local knowledge base and returns grounded answers with citations.

This is not just a chatbot prompt. The evaluator will run your project from a clean checkout, may replace the knowledge base and questions with equivalent files, and will check that your pipeline actually performs document loading, chunking, retrieval, answer generation, and citation validation.

The goal is to show practical AI engineering basics at L1 level:

- structure a simple RAG pipeline
- keep outputs machine-readable
- avoid unsupported answers
- add lightweight validation
- make the project easy to run

Your solution should favor clarity and correctness over complexity.

---

## SCENARIO

You are given a small product knowledge base for a fictional developer platform. Users ask questions about pricing, API limits, auth, webhooks, and data retention.

Your assistant must answer only from the provided documents.

If the answer is not supported by the documents, it must say that the information is not available in the knowledge base.

---

## INPUT FILES

Your pipeline must read from disk:

- `docs/` containing `.md` or `.txt` files
- `questions.json`

The evaluator may replace these files with equivalent content using the same schema.

Your implementation must not depend on exact filenames, question order, or hardcoded answers.

---

## SAMPLE `questions.json`

```json
[
  { "id": 1, "question": "What authentication methods does the API support?" },
  { "id": 2, "question": "How long are webhook delivery logs retained?" },
  { "id": 3, "question": "Is there a free plan for startups?" },
  { "id": 4, "question": "What happens if I exceed the rate limit?" },
  { "id": 5, "question": "Can I delete customer data immediately on request?" },
  { "id": 6, "question": "Does the platform support GraphQL subscriptions?" }
]
```

---

## REQUIRED PIPELINE STAGES

Your implementation must separate these stages in code:

```text
INIT
 -> DOCUMENTS_LOADED
 -> CHUNKS_CREATED
 -> INDEX_BUILT
 -> QUESTIONS_LOADED
 -> RETRIEVAL_COMPLETE
 -> ANSWERS_GENERATED
 -> CITATIONS_VALIDATED
 -> RESULTS_EXPORTED
 -> VALIDATION_COMPLETE
```

Do not collapse retrieval and answer generation into one hidden step without saving intermediate outputs.

---

## MUST COMPLETE

### 1. Document Ingestion

Load all files from `docs/`.

For each source document, capture at least:

```json
{
  "doc_id": "string",
  "path": "string",
  "text": "string"
}
```

Save to `artifacts/documents.json`.

---

### 2. Chunking

Split documents into chunks suitable for retrieval.

Requirements:

- chunk size must be defined in code
- chunks must keep source attribution
- each chunk must have a stable ID

Each chunk must include:

```json
{
  "chunk_id": "string",
  "doc_id": "string",
  "text": "string",
  "start_char": 0,
  "end_char": 200
}
```

Save to `artifacts/chunks.json`.

---

### 3. Retrieval

For each question, retrieve the top 3 most relevant chunks.

You may use:

- embeddings + vector similarity, or
- BM25 / TF-IDF / other simple local retrieval

Your retrieval must be generated at runtime from the provided docs.

Each retrieval result must include:

```json
{
  "id": 1,
  "question": "string",
  "retrieved_chunks": [
    {
      "chunk_id": "string",
      "doc_id": "string",
      "score": 0.82,
      "text": "string"
    }
  ]
}
```

Save to `artifacts/retrieval_results.json`.

---

### 4. Answer Generation

Generate one answer per question using only the retrieved chunks.

The prompt must explicitly instruct the model to:

- answer only from the provided context
- say when the answer is not supported
- include citations using returned chunk IDs
- avoid making up product features or policies

Each answer record must include:

```json
{
  "id": 1,
  "question": "string",
  "answer": "string",
  "supported": true,
  "citations": ["chunk_3", "chunk_7"]
}
```

Save to `artifacts/answers.json`.

If the question is unsupported, expected output should look like:

```json
{
  "id": 6,
  "answer": "The knowledge base does not provide enough information to answer this.",
  "supported": false,
  "citations": []
}
```

---

### 5. Citation Validation

Implement a deterministic validation pass after answer generation.

For each answer:

- every cited chunk ID must exist in retrieved chunks for that question
- if `supported` is `true`, there must be at least one citation
- if `supported` is `false`, citations must be empty

Also add one lightweight grounding check in code. For example:

- verify that key answer terms appear in cited text, or
- flag answers that contain numeric claims not present in cited chunks

Each validation result must include:

```json
{
  "id": 1,
  "passed": true,
  "issues": []
}
```

Save to `artifacts/citation_validation.json`.

---

### 6. Final Output

Produce `artifacts/final_answers.json` combining:

- question
- answer
- supported flag
- citations
- retrieved chunk IDs
- validation result

---

## SHOULD ATTEMPT

### 7. Simple CLI

Add a command such as:

```bash
python run.py
```

or:

```bash
npm run start
```

It should run the full pipeline and print a short summary:

- number of documents
- number of chunks
- number of questions
- number of supported answers
- number of validation failures

---

### 8. LLM Call Logging

If you use an LLM, log calls to `artifacts/llm_calls.jsonl`.

Each record should include:

```json
{
  "stage": "answer_generation",
  "timestamp": "ISO-8601 timestamp",
  "provider": "string",
  "model": "string",
  "question_id": 1,
  "prompt_hash": "string",
  "input_artifacts": ["artifacts/retrieval_results.json"],
  "output_artifact": "artifacts/answers.json"
}
```

If you do not use an LLM, document your rule-based answer generation clearly in `README.md`.

---

### 9. Tests or Validation Script

Include a validation command, for example:

```bash
python validate.py
```

or:

```bash
npm test
```

It should check:

- required artifact files exist
- JSON is valid
- every question has exactly one answer
- each question has at most 3 retrieved chunks
- cited chunk IDs are valid
- unsupported answers have no citations
- supported answers have citations

---

## REQUIRED ARTIFACTS

Your repository must produce:

- `questions.json`
- `artifacts/documents.json`
- `artifacts/chunks.json`
- `artifacts/retrieval_results.json`
- `artifacts/answers.json`
- `artifacts/citation_validation.json`
- `artifacts/final_answers.json`

If attempted:

- `artifacts/llm_calls.jsonl`
- `README.md`
- `validate.py` or equivalent test command

---

## EXECUTION REQUIREMENTS

The evaluator will run the project from a clean checkout.

Generated artifacts may be deleted before evaluation.

The evaluator may replace `docs/` and `questions.json` with equivalent fixtures.

Static precomputed outputs are not sufficient.

Your code must regenerate outputs from the input files.

---

## TOOLS

Use Python or TypeScript.

Any local library or LLM provider is acceptable.

Do not require private data, paid credentials in code, or external scraping.

If an API key is needed, read it from environment variables and make the project still understandable without it.

---

## TECHNICAL CONSTRAINTS

- Keep the solution small and runnable in 60 minutes.
- Retrieval must be implemented in code, not hardcoded.
- Source citations must be attached to answers.
- A deterministic validation step must run after generation.
- The pipeline must tolerate unsupported questions.
- Prefer simple, readable engineering choices over framework-heavy setup.

---

## WHAT TO SUBMIT

Submit a runnable repository with:

- source code
- sample input files
- generated artifacts
- short README with setup and run steps

The evaluator will look for a clean end-to-end implementation, not a perfect model.
