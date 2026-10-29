# 03 Author sample fixtures

Type: task
Status: resolved
Blocked by: 01

## Question

Write sample `docs/` and `questions.json` that exercise ingestion, chunking and unsupported-answer handling.

## Answer

Done. Files written:
- `docs/`: `pricing.md`, `rate-limits.md`, `authentication.md`, `webhooks.md`, `data-retention.md` and `changelog.txt`. The changelog is plain text with no headings, to exercise the paragraph fallback.
- `questions.json`: the 6 sample questions plus 4 traps:
  - Q7 is numeric, with a stale-number distractor in the changelog (300 vs 600).
  - Q8 is a paraphrase ("check it came from" → HMAC signature).
  - Q9 is a near-miss unsupported question (Enterprise exists, but there's no SLA).
  - Q10 is numeric (8 retries / 24 hours).
- Q11–13 were added later for ticket 04: gibberish, whitespace only, and off-topic.
- Expected results per question are in the acceptance table in `spec.md`.
