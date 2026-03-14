#!/usr/bin/env node
import path from "node:path"
import { parseArgs } from "node:util"
import { MODELS, OLLAMA_HOST, TEST_COMMAND, MAX_ITERATIONS } from "./config.js"
import { readProjectContext, applyChanges } from "./tools/files.js"
import {
  findSkillsDir,
  loadSkillsIndex,
  loadSelectedSkills,
} from "./tools/skills.js"
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
swarm 🐝 — multi-agent coding orchestrator

Usage:
  swarm "your task" [--project /path/to/project] [--no-skills]

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
function divider(label) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`)
}

function printSummary(writtenFiles, testResult) {
  console.log(`\n${"═".repeat(60)}`)
  console.log("  SUMMARY")
  console.log(`${"═".repeat(60)}`)
  console.log(`  Files modified : ${writtenFiles.length}`)
  writtenFiles.forEach((f) => console.log(`    • ${f}`))
  console.log(
    `  Tests          : ${testResult?.passed ? "✅ passing" : "❌ failing"}`,
  )
  console.log(`${"═".repeat(60)}\n`)
}

// ── main ──────────────────────────────────────────────────────────────────────
async function run(task, projectRoot) {
  projectRoot = path.resolve(projectRoot)

  console.log(`\n🐝 SWARM starting`)
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
      if (skillsIndex) {
        console.log(`   Skills  : ${skillsDir}`)
      }
    } else {
      console.log(
        `   Skills  : none found (run 'npx skills add <url>' to install)`,
      )
    }
  } else {
    console.log(`   Skills  : disabled`)
  }

  // ── 1. PLAN ───────────────────────────────────────────────────────────────
  divider("1 / 4  PLANNER")
  const projectContext = readProjectContext(projectRoot)
  const { plan: implementationPlan, selectedSkills } = await plan(
    task,
    projectContext,
    skillsIndex,
  )
  console.log(`\n${implementationPlan}\n`)

  // Load full content of selected skills for coder and tester
  const skillContent =
    skillsDir && selectedSkills.length > 0
      ? loadSelectedSkills(skillsDir, selectedSkills)
      : ""

  if (skillContent) {
    console.log(`  📚 Loaded skill content for: ${selectedSkills.join(", ")}`)
  }

  // ── 2-4. CODE → TEST → REVIEW loop ────────────────────────────────────────
  let critiqueFeedback = ""
  let finalChanges = {}
  let lastTestResult = {}

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    divider(`2 / 4  CODER  (iteration ${i}/${MAX_ITERATIONS})`)
    const changes = await code(
      implementationPlan,
      projectContext,
      critiqueFeedback,
      skillContent,
    )

    if (changes.__raw__) {
      console.log("\n⚠️  Coder output could not be parsed. Stopping.")
      console.log(changes.__raw__)
      break
    }

    const written = applyChanges(projectRoot, changes)
    console.log(`  📝 Written: ${written.join(", ")}`)

    divider(`3 / 4  TESTER  (iteration ${i}/${MAX_ITERATIONS})`)
    const testResult = await test(
      implementationPlan,
      changes,
      projectRoot,
      skillContent,
    )

    divider(`4 / 4  CRITIC  (iteration ${i}/${MAX_ITERATIONS})`)
    const review = await critique(implementationPlan, changes, testResult)

    finalChanges = changes
    lastTestResult = testResult

    if (review.approved) {
      console.log(`\n🎉 Swarm complete in ${i} iteration(s).`)
      console.log(
        "   Files are on disk. Review the diff in VS Code and commit when ready.",
      )
      printSummary(written, testResult)
      return
    }

    critiqueFeedback = review.feedback
    console.log(`\n  Critique:\n${critiqueFeedback}\n`)

    if (i < MAX_ITERATIONS) {
      console.log("  ↩️  Sending back to coder...")
    }
  }

  // ── Exhausted iterations ──────────────────────────────────────────────────
  console.log(
    `\n⚠️  Reached maximum iterations (${MAX_ITERATIONS}) without approval.`,
  )
  console.log(
    "   The last attempt is on disk. Review carefully before committing.",
  )
  printSummary(Object.keys(finalChanges), lastTestResult)
}

run(positionals.join(" "), values.project).catch((err) => {
  console.error(`\n💥 ${err.message}`)
  process.exit(1)
})
