import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import OpenAI from "openai";
import { EMBED_BATCH, EMBED_MODEL } from "./config.ts";
import { ARTIFACTS } from "./io.ts";
import type { QuestionId } from "./types.ts";

let client: OpenAI | undefined;
export const openai = () => (client ??= new OpenAI());

export type CallLog = {
  stage: string;
  model: string;
  question_id: QuestionId | null;
  prompt: unknown;
  input_artifacts: string[];
  output_artifact: string;
};

export async function logCall(c: CallLog): Promise<void> {
  const record = {
    stage: c.stage,
    timestamp: new Date().toISOString(),
    provider: "openai",
    model: c.model,
    question_id: c.question_id,
    prompt_hash: createHash("sha256").update(JSON.stringify(c.prompt)).digest("hex"),
    input_artifacts: c.input_artifacts,
    output_artifact: c.output_artifact,
  };
  await appendFile(ARTIFACTS.llmCalls, JSON.stringify(record) + "\n", "utf8");
}

export async function embed(texts: string[], log: Omit<CallLog, "model" | "prompt">): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const input = texts.slice(i, i + EMBED_BATCH);
    const res = await openai().embeddings.create({ model: EMBED_MODEL, input });
    out.push(...res.data.map((d) => d.embedding));
    await logCall({ ...log, model: EMBED_MODEL, prompt: input });
  }
  return out;
}
