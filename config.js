// ── Ollama ─────────────────────────────────────────────────────────────────
export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434"

// Timeout per agent call in milliseconds.
// The coder gets a separate, longer timeout since its prompt is the largest.
export const OLLAMA_TIMEOUT = parseInt(
  process.env.OLLAMA_TIMEOUT ?? "300000",
  10,
) // 5 min default
export const OLLAMA_CODER_TIMEOUT = parseInt(
  process.env.OLLAMA_CODER_TIMEOUT ?? "600000",
  10,
) // 10 min for coder

// ── Models ─────────────────────────────────────────────────────────────────
export const MODELS = {
  planner: process.env.MODEL_PLANNER ?? "qwen2.5:7b",
  coder: process.env.MODEL_CODER ?? "qwen2.5-coder:7b",
  tester: process.env.MODEL_TESTER ?? "qwen2.5-coder:7b",
  critic: process.env.MODEL_CRITIC ?? "qwen2.5:7b",
}

// ── Test command ───────────────────────────────────────────────────────────
export const TEST_COMMAND =
  process.env.TEST_COMMAND ?? "npx vitest run --reporter=verbose"

// ── Loop control ───────────────────────────────────────────────────────────
export const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS ?? "3", 10)

// ── Context tuning ─────────────────────────────────────────────────────────
// Max chars per file when building prompts. Lower = faster, less context.
export const MAX_FILE_CHARS = parseInt(process.env.MAX_FILE_CHARS ?? "8000", 10)

// Max files to include in the full project context sent to the planner.
// The coder receives only the files the planner identifies as relevant.
export const MAX_CONTEXT_FILES = parseInt(
  process.env.MAX_CONTEXT_FILES ?? "15",
  10,
)
