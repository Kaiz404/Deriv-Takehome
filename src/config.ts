export const CHUNK_SIZE = 800;
export const TOP_K = 3;
export const RRF_K = 60;
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;
export const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
export const GENERATION_CONCURRENCY = 5;
export const EMBED_BATCH = 100;
export const SEED = 7;
export const UNSUPPORTED_ANSWER = "The knowledge base does not provide enough information to answer this.";
export const MIN_TERM_OVERLAP = 0.5;
// Measured 2026-10-29 on the sample fixtures: gibberish/off-topic max cosine 0.08-0.18,
// real-but-unsupported 0.30-0.44, answerable 0.65+.
export const MIN_RELEVANCE = 0.2;
export const MAX_QUESTION_CHARS = 2000;
export const DOCS_DIR = "docs";
export const QUESTIONS_PATH = "questions.json";
export const ARTIFACTS_DIR = "artifacts";
