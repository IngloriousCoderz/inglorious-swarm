// ── Ollama ─────────────────────────────────────────────────────────────────
export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

// ── Models ─────────────────────────────────────────────────────────────────
export const MODELS = {
  planner: process.env.MODEL_PLANNER ?? 'qwen2.5:7b',
  coder:   process.env.MODEL_CODER   ?? 'qwen2.5-coder:14b',
  tester:  process.env.MODEL_TESTER  ?? 'qwen2.5-coder:7b',
  critic:  process.env.MODEL_CRITIC  ?? 'qwen2.5:7b',
}

// ── Test command ───────────────────────────────────────────────────────────
export const TEST_COMMAND = process.env.TEST_COMMAND ?? 'npx vitest run --reporter=verbose'

// ── Loop control ───────────────────────────────────────────────────────────
export const MAX_ITERATIONS = parseInt(process.env.MAX_ITERATIONS ?? '3', 10)

// ── Context window ─────────────────────────────────────────────────────────
export const MAX_FILE_CHARS = parseInt(process.env.MAX_FILE_CHARS ?? '12000', 10)
