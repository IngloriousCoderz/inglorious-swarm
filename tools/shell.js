import { execSync } from "child_process"
import { TEST_COMMAND } from "../config.js"

/** Run the test suite in projectRoot. Returns { passed, output }. */
export function runTests(projectRoot, command = TEST_COMMAND) {
  try {
    const output = execSync(command, {
      cwd: projectRoot,
      timeout: 120_000,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { passed: true, output: output.slice(0, 6000) }
  } catch (err) {
    // execSync throws on non-zero exit — that's a test failure, not a crash
    const output = ((err.stdout ?? "") + (err.stderr ?? "")).slice(0, 6000)
    if (err.signal === "SIGTERM") {
      return { passed: false, output: "Test run timed out after 120s." }
    }
    return { passed: false, output: output || err.message }
  }
}

/** Run an arbitrary shell command. Returns { ok, output }. */
export function runCommand(command, cwd) {
  try {
    const output = execSync(command, {
      cwd,
      timeout: 60_000,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { ok: true, output: output.slice(0, 4000) }
  } catch (err) {
    return { ok: false, output: (err.stdout + err.stderr).slice(0, 4000) }
  }
}
