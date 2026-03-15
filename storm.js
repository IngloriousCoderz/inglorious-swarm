#!/usr/bin/env node
import path from "node:path"
import { parseArgs } from "node:util"
import { MODELS, OLLAMA_HOST, TEST_COMMAND, MAX_ITERATIONS } from "./config.js"
import {
  readProjectContext,
  readFocusedContext,
  applyChanges,
  isNonSourceChange,
} from "./tools/files.js"
import {
  findSkillsDir,
  loadSkillsIndex,
  loadSelectedSkills,
} from "./tools/skills.js"
import { runTests } from "./tools/shell.js"
import { startTimer, elapsed, formatTimings } from "./tools/timer.js"
import { plan } from "./agents/planner.js"
import { code } from "./agents/coder.js"
import { test } from "./agents/tester.js"
import { critique } from "./agents/critic.js"

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    project: { type: "string", short: "p", default: "." },
    "no-skills": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help || positionals.length === 0) {
  console.log(`
storm ⚡ — multi-agent coding orchestrator

Usage:
  storm "your task" [--project /path/to/project] [--no-skills]

Options:
  --project, -p   Path to the project root (default: current directory)
  --no-skills     Skip skill discovery and loading
  --help,    -h   Show this help

Environment variables:
  OLLAMA_HOST     e.g. http://192.168.1.50:11434  (default: localhost)
  MODEL_PLANNER   Override individual models
  MODEL_CODER
  MODEL_TESTER
  MODEL_CRITIC
  TEST_COMMAND    e.g. "npx vitest run"
  MAX_ITERATIONS  default: 3
  MAX_FILE_CHARS  default: 12000
`)
  process.exit(0)
}

// ── helpers ───────────────────────────────────────────────────────────────────
function divider(label, sinceMs) {
  const time = sinceMs !== undefined ? `  ${elapsed(sinceMs)}` : ""
  console.log(`\n${"─".repeat(60)}\n  ${label}${time}\n${"─".repeat(60)}`)
}

function printSummary(writtenFiles, testResult, timings) {
  console.log(`\n${"═".repeat(60)}`)
  console.log("  SUMMARY")
  console.log(`${"═".repeat(60)}`)
  console.log(`  Files modified : ${writtenFiles.length}`)
  writtenFiles.forEach((f) => console.log(`    • ${f}`))
  console.log(
    `  Tests          : ${testResult?.passed ? "✅ passing" : "❌ failing"}`,
  )
  console.log(`\n  Timings`)
  formatTimings(timings).forEach((line) => console.log(line))
  console.log(`${"═".repeat(60)}\n`)
}

// ── main ──────────────────────────────────────────────────────────────────────
async function run(task, projectRoot) {
  projectRoot = path.resolve(projectRoot)
  const totalStart = startTimer()
  const timings = {}

  console.log(`\n⚡ STORM starting`)
  console.log(`   Task    : ${task}`)
  console.log(`   Project : ${projectRoot}`)
  console.log(`   Ollama  : ${OLLAMA_HOST}`)
  console.log(`   Models  : planner=${MODELS.planner}  coder=${MODELS.coder}`)
  console.log(`             tester=${MODELS.tester}  critic=${MODELS.critic}`)
  console.log(`   Tests   : ${TEST_COMMAND}`)
  console.log(`   Max iter: ${MAX_ITERATIONS}`)

  // ── 0. SKILLS discovery ───────────────────────────────────────────────────
  let skillsIndex = null
  let skillsDir = null

  if (!values["no-skills"]) {
    skillsDir = findSkillsDir(projectRoot)
    if (skillsDir) {
      skillsIndex = loadSkillsIndex(skillsDir)
      if (skillsIndex) console.log(`   Skills  : ${skillsDir}`)
    } else {
      console.log(
        `   Skills  : none found (run 'npx skills add <url>' to install)`,
      )
    }
  } else {
    console.log(`   Skills  : disabled`)
  }

  // ── Baseline tests — run once before anything changes ─────────────────────
  console.log(`\n  📊 Capturing baseline test results...`)
  const baselineStart = startTimer()
  const baseline = runTests(projectRoot)
  timings["baseline"] = performance.now() - baselineStart
  console.log(
    `  Baseline: ${baseline.passed ? "✅ passing" : "❌ failing"}  (${elapsed(baselineStart)})`,
  )

  // ── 1. PLAN ───────────────────────────────────────────────────────────────
  const planStart = startTimer()
  divider("1 / 4  PLANNER")
  const projectContext = readProjectContext(projectRoot)
  const {
    plan: implementationPlan,
    selectedSkills,
    relevantFiles,
  } = await plan(task, projectContext, skillsIndex)
  timings["planner"] = performance.now() - planStart
  console.log(`\n${implementationPlan}\n`)
  console.log(`  ⏱  ${elapsed(planStart)}`)

  // Load full content of selected skills for coder and tester
  const skillContent =
    skillsDir && selectedSkills.length > 0
      ? loadSelectedSkills(skillsDir, selectedSkills)
      : ""
  if (skillContent)
    console.log(`  📚 Loaded skills: ${selectedSkills.join(", ")}`)

  const focusedContext = readFocusedContext(projectRoot, relevantFiles)
  if (focusedContext) {
    console.log(`  🎯 Focused context: ${relevantFiles.join(", ")}`)
  } else {
    console.log(
      `  📂 Using full project context (planner identified no specific files)`,
    )
  }

  // ── 2-4. CODE → TEST → REVIEW loop ────────────────────────────────────────
  let critiqueFeedback = ""
  let finalChanges = {}
  let lastTestResult = baseline
  let lastWritten = []

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    // ── CODER ────────────────────────────────────────────────────────────────
    const coderStart = startTimer()
    divider(`2 / 4  CODER  (iteration ${i}/${MAX_ITERATIONS})`)
    const changes = await code(
      implementationPlan,
      projectContext,
      critiqueFeedback,
      skillContent,
      focusedContext,
    )
    timings[`coder-${i}`] = performance.now() - coderStart

    if (changes.__raw__) {
      console.log("\n⚠️  Coder output could not be parsed. Stopping.")
      console.log(changes.__raw__)
      break
    }

    const written = applyChanges(projectRoot, changes)
    console.log(`  📝 Written: ${written.join(", ")}`)
    console.log(`  ⏱  ${elapsed(coderStart)}`)
    lastWritten = written

    // ── TESTER ───────────────────────────────────────────────────────────────
    let testResult

    if (isNonSourceChange(changes)) {
      console.log(`\n  ⏭️  Tester skipped — no source files changed.`)
      // Non-source changes can't break tests, so inherit baseline
      testResult = { ...baseline, skipped: true }
    } else {
      const testerStart = startTimer()
      divider(`3 / 4  TESTER  (iteration ${i}/${MAX_ITERATIONS})`)
      testResult = await test(
        implementationPlan,
        changes,
        projectRoot,
        skillContent,
      )
      timings[`tester-${i}`] = performance.now() - testerStart
      console.log(`  ⏱  ${elapsed(testerStart)}`)
    }

    // ── CRITIC ───────────────────────────────────────────────────────────────
    const criticStart = startTimer()
    divider(`4 / 4  CRITIC  (iteration ${i}/${MAX_ITERATIONS})`)
    const review = await critique(
      implementationPlan,
      changes,
      testResult,
      baseline,
    )
    timings[`critic-${i}`] = performance.now() - criticStart
    console.log(`  ⏱  ${elapsed(criticStart)}`)

    finalChanges = changes
    lastTestResult = testResult

    if (review.approved) {
      console.log(`\n🎉 Storm complete in ${i} iteration(s).`)
      console.log(
        "   Files are on disk. Review the diff in VS Code and commit when ready.",
      )
      printSummary(written, testResult, timings)
      return
    }

    critiqueFeedback = review.feedback
    console.log(`\n  Critique:\n${critiqueFeedback}\n`)
    if (i < MAX_ITERATIONS) console.log("  ↩️  Sending back to coder...")
  }

  // ── Exhausted iterations ──────────────────────────────────────────────────
  console.log(
    `\n⚠️  Reached maximum iterations (${MAX_ITERATIONS}) without approval.`,
  )
  console.log(
    "   The last attempt is on disk. Review carefully before committing.",
  )
  printSummary(lastWritten, lastTestResult, timings)
}

run(positionals.join(" "), values.project).catch((err) => {
  console.error(`\n💥 ${err.message}`)
  process.exit(1)
})
