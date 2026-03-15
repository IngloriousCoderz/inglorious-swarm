import { chat } from "../tools/ollama.js"
import { MODELS } from "../config.js"
import { parseSelectedSkills } from "../tools/skills.js"

const SYSTEM = `You are a senior software architect acting as a tech lead.
Your job is to analyse a codebase and a task, then produce a clear, ordered
implementation plan for a developer to follow.

Rules:
- Be specific: reference actual file names and function names from the codebase.
- Be concise: bullet points only, no padding.
- Do NOT write any code.
- If the task is ambiguous, state your assumptions explicitly.
- End with a one-line summary of the expected outcome.
- On the very last line, list ONLY the files that must be directly edited (not their imports or dependencies):
  FILES: path/to/file1.js, path/to/file2.ts
  Keep this list minimal — only files whose content will change.`

const SKILL_SELECTOR_SYSTEM = `You are a tech lead selecting the minimum set of skill
reference files needed to implement a task.

Given a task description and a skills index (SKILL.md), output ONLY the file paths
of the skills that are directly relevant — one path per line, no explanation.

Example output:
skills/web.md
skills/store.md

If no skills are relevant, reply with: NONE`

/**
 * Parse the FILES: line from the planner output.
 * @param {string} planText
 * @returns {{ plan: string, relevantFiles: string[] }}
 */
function extractPlanAndFiles(planText) {
  const lines = planText.split("\n")
  const filesLine = lines.findLast((l) =>
    l.trim().toUpperCase().startsWith("FILES:"),
  )

  if (!filesLine) return { plan: planText, relevantFiles: [] }

  const relevantFiles = filesLine
    .replace(/^FILES:/i, "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)

  // Remove the FILES: line from the plan shown to the user
  const plan = lines
    .filter((l) => l !== filesLine)
    .join("\n")
    .trimEnd()
  return { plan, relevantFiles }
}

/**
 * Given a task and project context, return an implementation plan.
 * @param {string} task
 * @param {string} projectContext
 * @param {string|null} skillsIndex
 * @returns {Promise<{ plan: string, selectedSkills: string[], relevantFiles: string[] }>}
 */
export async function plan(task, projectContext, skillsIndex = null) {
  // ── Step 1: select relevant skills ────────────────────────────────────────
  let selectedSkills = []
  if (skillsIndex) {
    console.log("🧠 Planner selecting relevant skills...")
    const selectionResponse = await chat(
      MODELS.planner,
      SKILL_SELECTOR_SYSTEM,
      `## Task\n${task}\n\n## Available Skills\n${skillsIndex}\n\nWhich skill files are needed?`,
    )
    if (!selectionResponse.trim().toUpperCase().startsWith("NONE")) {
      selectedSkills = parseSelectedSkills(selectionResponse)
      if (selectedSkills.length > 0) {
        console.log(`  ✓ Selected skills: ${selectedSkills.join(", ")}`)
      }
    } else {
      console.log("  ✓ No skills needed for this task.")
    }
  }

  // ── Step 2: produce the implementation plan ────────────────────────────────
  console.log("🧠 Planner thinking...")
  const user = `## Task\n${task}\n\n## Codebase\n${projectContext}\n\nProduce the implementation plan.`
  const raw = await chat(MODELS.planner, SYSTEM, user)
  const { plan: implementationPlan, relevantFiles } = extractPlanAndFiles(raw)

  if (relevantFiles.length > 0) {
    console.log(`  ✓ Relevant files: ${relevantFiles.join(", ")}`)
  }

  return { plan: implementationPlan, selectedSkills, relevantFiles }
}
