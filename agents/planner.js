import { chat } from '../tools/ollama.js'
import { MODELS } from '../config.js'

const SYSTEM = `You are a senior software architect acting as a tech lead.
Your job is to analyse a codebase and a task, then produce a clear, ordered
implementation plan for a developer to follow.

Rules:
- Be specific: reference actual file names and function names from the codebase.
- Be concise: bullet points only, no padding.
- Do NOT write any code.
- If the task is ambiguous, state your assumptions explicitly.
- End with a one-line summary of the expected outcome.`

export async function plan(task, projectContext) {
  const user = `## Task\n${task}\n\n## Codebase\n${projectContext}\n\nProduce the implementation plan.`
  console.log('🧠 Planner thinking...')
  return chat(MODELS.planner, SYSTEM, user)
}
