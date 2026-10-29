import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_QUESTION_CHARS } from "../config.ts";
import { readText } from "../io.ts";
import { PipelineError, QuestionSchema } from "../types.ts";
import type { Doc, Question } from "../types.ts";

/** Reads every .md/.txt under `dir` (recursive, sorted). Throws PipelineError if none. */
export async function loadDocuments(dir: string): Promise<Doc[]> {
  const root = dir.replaceAll("\\", "/").replace(/\/+$/, "");
  let entries: string[] = [];
  try {
    entries = await readdir(dir, { recursive: true });
  } catch {
    // missing dir is reported below as "no files"
  }
  const ids: string[] = [];
  for (const entry of entries) {
    const id = entry.replaceAll("\\", "/");
    if (/\.(md|txt)$/i.test(id) && !(await isDirectory(path.join(dir, entry)))) ids.push(id);
  }
  if (ids.length === 0) throw new PipelineError([`No .md or .txt files found in ${path.posix.basename(root)}/`]);
  ids.sort();
  return Promise.all(ids.map(async (doc_id) => ({ doc_id, path: `${root}/${doc_id}`, text: await readText(path.join(dir, doc_id)) })));
}

async function isDirectory(p: string): Promise<boolean> {
  return (await stat(p)).isDirectory();
}

/** Parses and validates questions.json. Throws PipelineError listing every file-level problem. */
export async function loadQuestions(file: string): Promise<Question[]> {
  let raw: string;
  try {
    raw = await readText(file);
  } catch {
    throw new PipelineError([`${file} not found`]);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new PipelineError([`${file} is not valid JSON: ${(e as Error).message}`]);
  }
  if (!Array.isArray(data)) throw new PipelineError([`${file} must be a JSON array of questions`]);

  const problems: string[] = [];
  const questions: Question[] = [];
  const seen = new Map<string, number>();
  data.forEach((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      problems.push(`[${i}] must be an object`);
      return;
    }
    const parsed = QuestionSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push(`[${i}] ${issue.path.join(".") || "item"}: ${issue.message}`);
      return;
    }
    const key = String(parsed.data.id);
    if (seen.has(key)) problems.push(`[${i}] duplicate id ${JSON.stringify(parsed.data.id)} (first used at [${seen.get(key)}])`);
    else seen.set(key, i);
    questions.push(parsed.data);
  });
  if (problems.length) throw new PipelineError(problems);
  return questions;
}

/** Per-question gate: INVALID_QUESTION for empty, symbol-only, or over-long questions. */
export function classifyQuestion(text: string): "INVALID_QUESTION" | null {
  if (text.length > MAX_QUESTION_CHARS || !/[\p{L}\p{N}]{2,}/u.test(text)) return "INVALID_QUESTION";
  return null;
}
