import { readFile, stat } from "node:fs/promises";
import { ARTIFACTS_DIR, QUESTIONS_PATH, TOP_K } from "./config.ts";
import { ARTIFACTS, readText } from "./io.ts";
import type { Answer, FinalAnswer, Question, RetrievalResult, ValidationResult } from "./types.ts";

async function readJson(file: string, errors: string[]): Promise<unknown> {
  let raw: string;
  try {
    raw = await readText(file);
  } catch {
    errors.push(`${file}: missing`);
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    errors.push(`${file}: invalid JSON`);
    return undefined;
  }
}

/** Returns human-readable problems; an empty array means every artifact invariant holds. */
export async function checkArtifacts(): Promise<string[]> {
  if (!(await stat(ARTIFACTS_DIR).catch(() => null))) return [`${ARTIFACTS_DIR}/ not found: run npm start first`];

  const errors: string[] = [];
  const files = [ARTIFACTS.documents, ARTIFACTS.chunks, ARTIFACTS.retrieval, ARTIFACTS.answers, ARTIFACTS.validation, ARTIFACTS.final];
  const parsed = await Promise.all(files.map((f) => readJson(f, errors)));
  files.forEach((f, i) => {
    if (parsed[i] !== undefined && !Array.isArray(parsed[i])) errors.push(`${f}: expected a JSON array`);
  });

  try {
    (await readFile(ARTIFACTS.llmCalls, "utf8")).split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      try {
        JSON.parse(line);
      } catch {
        errors.push(`${ARTIFACTS.llmCalls}: line ${i + 1} is not valid JSON`);
      }
    });
  } catch {
    errors.push(`${ARTIFACTS.llmCalls}: missing`);
  }

  const [, , retrieval, answers, validation, final] = parsed;
  const questions = await readJson(QUESTIONS_PATH, errors);
  if (![retrieval, answers, validation, final].every(Array.isArray) || !Array.isArray(questions)) return errors;
  return errors.concat(checkInvariants(
    questions as Question[],
    retrieval as RetrievalResult[],
    answers as Answer[],
    validation as ValidationResult[],
    final as FinalAnswer[],
  ));
}

function checkInvariants(
  questions: Question[],
  retrieval: RetrievalResult[],
  answers: Answer[],
  validation: ValidationResult[],
  final: FinalAnswer[],
): string[] {
  const errors: string[] = [];
  const ids = questions.map((q) => String(q.id));
  for (const id of ids) {
    for (const [name, rows] of [["answers.json", answers], ["final_answers.json", final]] as const) {
      const n = rows.filter((r) => String(r.id) === id).length;
      if (n !== 1) errors.push(`question ${id} appears ${n} times in ${name}, expected 1`);
    }
  }
  if (validation.length !== ids.length) {
    errors.push(`citation_validation.json has ${validation.length} entries, expected ${ids.length}`);
  } else {
    validation.forEach((v, i) => {
      if (String(v.id) !== ids[i]) errors.push(`citation_validation.json entry ${i + 1} has id ${v.id}, expected ${ids[i]}`);
    });
  }

  const retrievedById = new Map<string, Set<string>>();
  for (const r of retrieval) {
    const got = r.retrieved_chunks ?? [];
    if (got.length > TOP_K) errors.push(`question ${r.id} has ${got.length} retrieved chunks, max ${TOP_K}`);
    retrievedById.set(String(r.id), new Set(got.map((c) => c.chunk_id)));
  }

  for (const f of final) {
    const citations = f.citations ?? [];
    const own = new Set(f.retrieved_chunk_ids ?? []);
    for (const c of citations) {
      if (!own.has(c)) errors.push(`question ${f.id} cites ${c}, not in its retrieved_chunk_ids`);
      if (!retrievedById.get(String(f.id))?.has(c)) errors.push(`question ${f.id} cites ${c}, not in retrieval_results.json`);
    }
    if (f.supported === false && citations.length) errors.push(`question ${f.id} is unsupported but has citations`);
    if (f.supported === true && !citations.length) errors.push(`question ${f.id} is supported but has no citations`);
  }
  return errors;
}
