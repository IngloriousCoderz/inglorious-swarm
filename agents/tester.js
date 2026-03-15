import { chat } from "../tools/ollama.js"
import { parseFileBlocks, applyChanges } from "../tools/files.js"
import { runTests } from "../tools/shell.js"
import { MODELS, TEST_COMMAND } from "../config.js"

const SYSTEM = `You are a QA engineer. You will receive:
- An implementation plan
- The new/modified files after implementation

Your job:
1. Check if existing test files cover the changed code.
2. If tests are missing or insufficient, write new test files.
3. Output test files using the same format as the coder:

### path/to/file.test.ts
\`\`\`ts
...full test file content...
\`\`\`

If existing tests are sufficient, output nothing — just reply: NO_NEW_TESTS

Rules:
- Use Vitest syntax (describe, it, expect).
- Import only from paths that exist in the codebase.
- Do not modify non-test files.
- Keep tests focused and minimal — test behaviour, not implementation.
- If skill references are provided, follow their testing patterns precisely.`

/**
 * @param {string} plan
 * @param {Record<string, string>} changes
 * @param {string} projectRoot
 * @param {string} skillContent
 * @param {boolean} dryRun  If true, generate tests but do not write them
 * @returns {Promise<{ passed: boolean, output: string, newTests: Record<string, string> }>}
 */
export async function test(
  plan,
  changes,
  projectRoot,
  skillContent = "",
  dryRun = false,
) {
  const changesSummary = Object.entries(changes)
    .filter(([p]) => !p.startsWith("__"))
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n")

  const skillSection = skillContent
    ? `\n## Skill References\n${skillContent}\n`
    : ""

  const user = `## Implementation Plan\n${plan}\n${skillSection}\n## Changed Files\n${changesSummary}\n\nReview the changes and write any missing tests, or reply NO_NEW_TESTS.`

  console.log("🧪 Tester reviewing changes...")
  const result = await chat(MODELS.tester, SYSTEM, user)

  let newTests = {}
  if (!result.toUpperCase().includes("NO_NEW_TESTS")) {
    newTests = parseFileBlocks(result)
    if (Object.keys(newTests).length > 0) {
      if (dryRun) {
        console.log(
          `  ✓ Tester would write ${Object.keys(newTests).length} test file(s): ${Object.keys(newTests).join(", ")} (dry run — not written)`,
        )
      } else {
        console.log(
          `  ✓ Tester wrote ${Object.keys(newTests).length} test file(s): ${Object.keys(newTests).join(", ")}`,
        )
        applyChanges(projectRoot, newTests)
      }
    }
  } else {
    console.log("  ✓ Tester: existing tests are sufficient.")
  }

  if (dryRun) {
    return { passed: true, output: "(dry run — tests not executed)", newTests }
  }

  console.log(`  ▶ Running: ${TEST_COMMAND}`)
  const testResult = runTests(projectRoot)
  console.log(testResult.passed ? "  ✅ passed" : "  ❌ failed")
  return { ...testResult, newTests }
}
