// Imported first in pipeline.ts so .env is loaded before config.ts reads process.env.
try {
  process.loadEnvFile();
} catch {
  // .env is optional; the key may come from the real environment.
}
