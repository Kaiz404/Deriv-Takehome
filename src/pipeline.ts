import { DOCS_DIR, QUESTIONS_PATH } from "./config.ts";
import { checkArtifacts } from "./check.ts";
import { ARTIFACTS, resetArtifacts, writeJson } from "./io.ts";
import { embed } from "./llm.ts";
import { chunkDocument } from "./stages/chunk.ts";
import { generateAnswer } from "./stages/generate.ts";
import { buildIndex } from "./stages/index.ts";
import { classifyQuestion, loadDocuments, loadQuestions } from "./stages/load.ts";
import { retrieve } from "./stages/retrieve.ts";
import { enforce, validateAnswer } from "./stages/validate.ts";
import { PipelineError } from "./types.ts";

const STAGES = [
  "INIT",
  "DOCUMENTS_LOADED",
  "CHUNKS_CREATED",
  "INDEX_BUILT",
  "QUESTIONS_LOADED",
  "RETRIEVAL_COMPLETE",
  "ANSWERS_GENERATED",
  "CITATIONS_VALIDATED",
  "RESULTS_EXPORTED",
  "VALIDATION_COMPLETE",
] as const;
type Stage = (typeof STAGES)[number];

const stage = (name: Stage, note = "") => console.log(`[STAGE] ${name}${note ? ` (${note})` : ""}`);

async function run(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required. Copy .env.example to .env.");
    process.exit(1);
  }
  await resetArtifacts();
  stage("INIT");

  const docs = await loadDocuments(DOCS_DIR);
  await writeJson(ARTIFACTS.documents, docs);
  stage("DOCUMENTS_LOADED", `${docs.length} documents`);

  const chunks = docs.flatMap(chunkDocument);
  for (const d of docs) {
    if (!chunks.some((c) => c.doc_id === d.doc_id)) console.warn(`warning: ${d.doc_id} produced 0 chunks`);
  }
  if (chunks.length === 0) throw new PipelineError(["No chunks were created: all documents are empty."]);
  await writeJson(ARTIFACTS.chunks, chunks);
  stage("CHUNKS_CREATED", `${chunks.length} chunks`);

  const index = await buildIndex(chunks, (texts) =>
    embed(texts, {
      stage: "index_build",
      question_id: null,
      input_artifacts: [ARTIFACTS.chunks],
      output_artifact: ARTIFACTS.index,
    }),
  );
  await writeJson(ARTIFACTS.index, index);
  stage("INDEX_BUILT", `${index.chunk_ids.length} embeddings`);

  const questions = await loadQuestions(QUESTIONS_PATH);
  const valid = questions.filter((q) => classifyQuestion(q.question) === null);
  const vectors = valid.length
    ? await embed(
        valid.map((q) => q.question),
        {
          stage: "query_embedding",
          question_id: null,
          input_artifacts: [QUESTIONS_PATH],
          output_artifact: ARTIFACTS.retrieval,
        },
      )
    : [];
  const embeddingByQuestion = new Map(valid.map((q, i) => [q, vectors[i]]));
  stage("QUESTIONS_LOADED", `${questions.length} questions, ${valid.length} valid`);

  const retrievals = questions.map((q) => retrieve(q, embeddingByQuestion.get(q) ?? null, index, chunks));
  await writeJson(ARTIFACTS.retrieval, retrievals);
  stage("RETRIEVAL_COMPLETE");

  const answers = await Promise.all(retrievals.map(generateAnswer));
  await writeJson(ARTIFACTS.answers, answers);
  stage("ANSWERS_GENERATED");

  const validations = answers.map((a, i) => validateAnswer(a, retrievals[i]));
  await writeJson(ARTIFACTS.validation, validations);
  stage("CITATIONS_VALIDATED");

  const finals = answers.map((a, i) => enforce(a, validations[i], retrievals[i]));
  await writeJson(ARTIFACTS.final, finals);
  stage("RESULTS_EXPORTED");

  const errors = await checkArtifacts();
  if (errors.length) {
    console.error("Artifact checks failed:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  stage("VALIDATION_COMPLETE");
  console.log(
    `Documents: ${docs.length} | Chunks: ${chunks.length} | Questions: ${questions.length} | ` +
      `Supported: ${finals.filter((f) => f.supported).length} | ` +
      `Validation failures: ${validations.filter((v) => !v.passed).length} | ` +
      `Downgraded: ${finals.filter((f) => f.downgraded).length}`,
  );
}

try {
  await run();
} catch (err) {
  if (err instanceof PipelineError) {
    console.error("Pipeline failed:");
    for (const p of err.problems) console.error(p);
  } else {
    console.error("Pipeline failed:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
}
