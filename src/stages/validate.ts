import { MIN_TERM_OVERLAP, UNSUPPORTED_ANSWER } from "../config.ts";
import { tokenize } from "../text.ts";
import type { Answer, FinalAnswer, Issue, RetrievalResult, ValidationResult } from "../types.ts";

/** Normalized numeric tokens: "1,000" -> "1000", "$0.50" -> "0.50". */
export function extractNumbers(text: string): Set<string> {
  const found = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  // A comma is a thousands separator only when followed by exactly three digits.
  return new Set(found.map((n) => n.replace(/,(?=\d{3}(?!\d))/g, "")));
}

const prefix = (t: string) => t.slice(0, 5);

/** Pure, deterministic. passed = no error-severity issues. */
export function validateAnswer(a: Answer, r: RetrievalResult): ValidationResult {
  const issues: Issue[] = [];
  const add = (code: Issue["code"], severity: Issue["severity"], detail: string) => issues.push({ code, severity, detail });
  if (a.generation_issue) issues.push(a.generation_issue);

  const retrieved = new Map(r.retrieved_chunks.map((c) => [c.chunk_id, c]));
  for (const id of a.citations) {
    if (!retrieved.has(id)) add("CITATION_NOT_RETRIEVED", "error", `Cited chunk_id not retrieved: ${id}`);
  }
  if (a.supported && a.citations.length === 0) add("SUPPORTED_WITHOUT_CITATION", "error", "supported=true but citations is empty");
  if (!a.supported && a.citations.length > 0) add("UNSUPPORTED_WITH_CITATION", "error", "supported=false but citations is not empty");

  if (a.supported) {
    const citedText = a.citations.flatMap((id) => retrieved.get(id)?.text ?? []).join("\n");
    const known = extractNumbers(citedText);
    for (const n of extractNumbers(a.answer)) {
      if (!known.has(n)) add("UNGROUNDED_NUMBER", "error", `Number ${n} not found in cited chunks`);
    }

    const terms = tokenize(a.answer).filter((t) => t.length >= 4);
    if (terms.length > 0) {
      const citedPrefixes = new Set(tokenize(citedText).map(prefix));
      const ratio = terms.filter((t) => citedPrefixes.has(prefix(t))).length / terms.length;
      if (ratio < MIN_TERM_OVERLAP) {
        add("LOW_TERM_OVERLAP", "warning", `Only ${(ratio * 100).toFixed(0)}% of answer terms appear in cited text`);
      }
    }

    if (a.answer.trim() === UNSUPPORTED_ANSWER || /knowledge base does not/i.test(a.answer)) {
      add("SUPPORTED_FLAG_MISMATCH", "error", "supported=true but the answer says the knowledge base does not cover it");
    }
  } else if (a.answer !== UNSUPPORTED_ANSWER) {
    add("NONCANONICAL_UNSUPPORTED", "warning", "supported=false but the answer is not the canonical sentence");
  }

  return { id: a.id, passed: !issues.some((i) => i.severity === "error"), issues };
}

/** Pure. Downgrades to the canonical unsupported answer when validation failed. */
export function enforce(a: Answer, v: ValidationResult, r: RetrievalResult): FinalAnswer {
  const unsupported = !v.passed || !a.supported;
  return {
    id: a.id,
    question: a.question,
    answer: unsupported ? UNSUPPORTED_ANSWER : a.answer,
    supported: !unsupported,
    citations: unsupported ? [] : a.citations,
    retrieved_chunk_ids: r.retrieved_chunks.map((c) => c.chunk_id),
    validation: { passed: v.passed, issues: v.issues },
    downgraded: !v.passed,
  };
}
