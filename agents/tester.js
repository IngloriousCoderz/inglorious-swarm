import { chat } from '../tools/ollama.js'
import { parseFileBlocks, applyChanges } from '../tools/files.js'
import { runTests } from '../tools/shell.js'
import { MODELS, TEST_COMMAND } from '../config.js'

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
- Keep tests focused and minimal — test behaviour, not implementation.`

/**
 * 1. Ask the tester model if new tests are needed and generate them.
 * 2. Write any new test files to disk.
 * 3. Run the test suite.
 * 4. Return { passed, output, newTests }
 * @param {string} plan
 * @param {Record<string, string>} changes
 * @param {string} projectRoot
 * @returns {Promise<{ passed: boolean, output: string, newTests: Record<string, string> }>}
 */
export async function test(plan, changes, projectRoot) {
  const changesSummary = Object.entries(changes)
    .filter(([p]) => !p.startsWith('__'))
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  const user = `## Implementation Plan\n${plan}\n\n## Changed Files\n${changesSummary}\n\nReview the changes and write any missing tests, or reply NO_NEW_TESTS.`

  console.log('🧪 Tester reviewing changes...')
  const result = await chat(MODELS.tester, SYSTEM, user)

  let newTests = {}
  if (!result.toUpperCase().includes('NO_NEW_TESTS')) {
    newTests = parseFileBlocks(result)
    if (Object.keys(newTests).length > 0) {
      console.log(`  ✓ Tester wrote ${Object.keys(newTests).length} test file(s): ${Object.keys(newTests).join(', ')}`)
      applyChanges(projectRoot, newTests)
    } else {
      console.log('  ℹ️  Tester returned no parseable test blocks.')
    }
  } else {
    console.log('  ✓ Tester: existing tests are sufficient.')
  }

  console.log(`  ▶ Running: ${TEST_COMMAND}`)
  const testResult = runTests(projectRoot)
  console.log(testResult.passed ? '  ✅ passed' : '  ❌ failed')

  return { ...testResult, newTests }
}
