import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ARTIFACTS_DIR } from "./config.ts";

const artifact = (name: string) => path.posix.join(ARTIFACTS_DIR, name);

export const ARTIFACTS = {
  documents: artifact("documents.json"),
  chunks: artifact("chunks.json"),
  index: artifact("index.json"),
  retrieval: artifact("retrieval_results.json"),
  answers: artifact("answers.json"),
  validation: artifact("citation_validation.json"),
  final: artifact("final_answers.json"),
  llmCalls: artifact("llm_calls.jsonl"),
} as const;

export async function resetArtifacts(): Promise<void> {
  await rm(ARTIFACTS_DIR, { recursive: true, force: true });
  await mkdir(ARTIFACTS_DIR, { recursive: true });
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Reads UTF-8, strips a BOM, normalizes CRLF to LF. */
export async function readText(file: string): Promise<string> {
  return (await readFile(file, "utf8")).replace(/^﻿/, "").replace(/\r\n/g, "\n");
}
