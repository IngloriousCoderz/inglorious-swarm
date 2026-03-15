import { chat } from "../tools/ollama.js"
import { MODELS } from "../config.js"

const SYSTEM = `You are a senior code reviewer deciding whether to APPROVE or REJECT a code change.

Reply with APPROVED or REJECTED on the very first line, nothing before it.

APPROVE if:
- The implementation matches the plan
- No new test failures were introduced (tests that failed before may still fail)
- No obvious bugs or security issues

REJECT only if:
- A test that was PASSING in the baseline is now FAILING
- The implementation clearly does not match the plan
- The code introduces an obvious bug or security issue

Do NOT reject for style, missing docs, or pre-existing failures.`

/**
 * @param {string} plan
 * @param {Record<string, string>} changes
 * @param {{ passed: boolean, output: string }} testResult
 * @param {{ passed: boolean, output: string }} baseline
 * @returns {Promise<{ approved: boolean, feedback: string }>}
 */
export async function critique(plan, changes, testResult, baseline) {
  const changesSummary = Object.entries(changes)
    .filter(([p]) => !p.startsWith("__"))
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n")

  // Pre-compute the test status delta so the model doesn't have to reason about it
  const baselinePassed = baseline?.passed ?? false
  const nowPassed = testResult.passed
  let testDelta
  if (!baselinePassed && !nowPassed) {
    testDelta = `⚠️  Tests were already failing before this change and are still failing. This is a PRE-EXISTING issue — do NOT reject for this.`
  } else if (baselinePassed && nowPassed) {
    testDelta = `✅ Tests were passing before and are still passing.`
  } else if (!baselinePassed && nowPassed) {
    testDelta = `✅ Tests were failing before and are now passing. Improvement.`
  } else {
    testDelta = `❌ Tests were passing before but are now failing. This was caused by the change.`
  }

  const user =
    `## Plan\n${plan}\n\n` +
    `## Code Changes\n${changesSummary}\n\n` +
    `## Test Status\n${testDelta}\n\n` +
    `## Test Output\n\`\`\`\n${testResult.output.slice(0, 2000)}\n\`\`\`\n\n` +
    `APPROVE or REJECT?`

  console.log("🔍 Critic reviewing...")
  const result = await chat(MODELS.critic, SYSTEM, user)

  const firstLine = result.trim().split("\n")[0].toUpperCase()
  const approved = firstLine.includes("APPROVED")
  console.log(approved ? "  ✅ Approved" : "  ❌ Rejected")

  return { approved, feedback: result }
}
