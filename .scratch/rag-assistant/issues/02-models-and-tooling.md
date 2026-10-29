# 02 Models and tooling

Type: grilling
Status: resolved
Blocked by: 01

## Question

Which models and which TS tooling?

## Answer

- Chat model: `gpt-6-luna`, chosen by the user for cost and speed. Checked against the API on 2026-10-29:
  - The model is listed for the key.
  - It **rejects `temperature: 0`**; only the default value of 1 is allowed.
  - Strict `json_schema` response_format works, with about 2.4s latency.
  - It rewrote `1000` as `1,000`, so number grounding must normalize separators.
- Embeddings: `text-embedding-3-small`. Luna is a chat model, so it can't produce embeddings.
- Tooling: `tsx` + `node:test`, with env loaded via Node 22 `--env-file`. Dependencies are `openai` and `zod`.
