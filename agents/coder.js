import { chat } from "../tools/ollama.js"
import { parseFileBlocks } from "../tools/files.js"
import { MODELS } from "../config.js"

const SYSTEM = `You are a senior developer implementing code changes.
You will receive a plan and the current codebase. Output ONLY the files that
need to be created or modified.

Output format — strictly follow this for every file:
### path/to/file.ts
\`\`\`ts
...full file content...
\`\`\`

Rules:
- Output the FULL content of each file, not just the changed lines.
- Only output files that actually need to change.
- Do not add explanations outside the file blocks.
- Do not add comments that weren't in the original unless they clarify the change.
- Follow the existing code style exactly.
- If skill references are provided, follow their patterns and conventions precisely.`

/**
 * Given a plan and project context, return { path: content } of changed files.
 * @param {string} plan
 * @param {string} projectContext
 * @param {string} critique       Optional feedback from a previous iteration
 * @param {string} skillContent   Optional concatenated skill file content
 * @returns {Promise<Record<string, string>>}
 */
export async function code(
  plan,
  projectContext,
  critique = "",
  skillContent = "",
) {
  const critiqueSection = critique
    ? `\n## Previous attempt was rejected — Critique\n${critique}\n`
    : ""

  const skillSection = skillContent
    ? `\n## Skill References\nFollow these patterns and conventions:\n\n${skillContent}\n`
    : ""

  const user = `## Implementation Plan\n${plan}\n${critiqueSection}${skillSection}\n## Codebase\n${projectContext}\n\nImplement the changes now.`

  const label = critique
    ? "🔄 Coder iterating (critique applied)..."
    : "💻 Coder implementing..."
  console.log(label)

  const result = await chat(MODELS.coder, SYSTEM, user)
  const changes = parseFileBlocks(result)

  if (Object.keys(changes).length === 0) {
    console.log(
      "  ⚠️  Coder returned no parseable file blocks. Raw output saved.",
    )
    return { __raw__: result }
  }

  console.log(
    `  ✓ ${Object.keys(changes).length} file(s) to write: ${Object.keys(changes).join(", ")}`,
  )
  return changes
}
