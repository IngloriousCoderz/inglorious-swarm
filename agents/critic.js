import { chat } from "../tools/ollama.js"
import { MODELS } from "../config.js"

const SYSTEM = `You are a senior code reviewer. You will receive:
- The original implementation plan
- The code changes produced by the developer
- The baseline test results (before the change)
- The current test results (after the change)

Your job is to decide: APPROVE or REJECT.

If APPROVE: reply with exactly this on the first line:
APPROVED
Then optionally add a short note (1-3 lines max).

If REJECT: reply with exactly this on the first line:
REJECTED
Then provide a concise, actionable critique — specific issues only, no padding.
The developer will use your critique to fix the code, so be precise.

Rejection criteria (reject if ANY of these are true):
- Tests that were PASSING before are now FAILING due to the new code
- The implementation does not match the plan
- The code introduces obvious bugs or security issues
- The code style deviates significantly from the existing codebase

Do NOT reject for:
- Minor style preferences
- Test failures that were already present in the baseline (before the change)
- Missing documentation (unless the plan required it)
- No test files found, if that was already the case in the baseline`

/**
 * Review the implementation and test results.
 * @param {string} plan
 * @param {Record<string, string>} changes
 * @param {{ passed: boolean, output: string }} testResult   After the change
 * @param {{ passed: boolean, output: string }} baseline     Before the change
 * @returns {Promise<{ approved: boolean, feedback: string }>}
 */
export async function critique(plan, changes, testResult, baseline) {
  const changesSummary = Object.entries(changes)
    .filter(([p]) => !p.startsWith("__"))
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n")

  const baselineSection = baseline
    ? `## Baseline Test Results (before this change)\nStatus: ${baseline.passed ? "PASSED ✅" : "FAILED ❌"}\n\`\`\`\n${baseline.output}\n\`\`\`\n\n`
    : ""

  const user =
    `## Plan\n${plan}\n\n` +
    `## Code Changes\n${changesSummary}\n\n` +
    baselineSection +
    `## Current Test Results (after this change)\nStatus: ${testResult.passed ? "PASSED ✅" : "FAILED ❌"}\n\`\`\`\n${testResult.output}\n\`\`\`\n\n` +
    `Review the implementation and decide: APPROVE or REJECT.`

  console.log("🔍 Critic reviewing...")
  const result = await chat(MODELS.critic, SYSTEM, user)

  const firstLine = result.trim().split("\n")[0].toUpperCase()
  const approved = firstLine.includes("APPROVED")
  console.log(approved ? "  ✅ Approved" : "  ❌ Rejected")

  return { approved, feedback: result }
}
