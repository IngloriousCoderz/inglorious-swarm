#!/usr/bin/env node
import path from "node:path"
import readline from "node:readline"
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
import { chat } from "./tools/ollama.js"
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
    repl: { type: "boolean", short: "r", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})

if (values.help || (positionals.length === 0 && !values.repl)) {
  console.log(`
storm ⚡ — multi-agent coding orchestrator

Usage:
  storm "your task"           Run the full swarm on a task
  storm --repl                Start interactive REPL
  storm "dry-run: your task"  Plan + code but do not write files

Options:
  --project, -p   Path to the project root (default: current directory)
  --repl,    -r   Start interactive REPL mode
  --no-skills     Skip skill discovery and loading
  --help,    -h   Show this help

REPL commands:
  run: <task>      Run the full swarm (writes files)
  dry-run: <task>  Run the swarm without writing files
  Anything else    Chat directly with the model (fast, no agents)
  exit / quit      Exit the REPL

Environment variables:
  OLLAMA_HOST          e.g. http://192.168.1.50:11434
  MODEL_PLANNER / MODEL_CODER / MODEL_TESTER / MODEL_CRITIC
  TEST_COMMAND         e.g. "npx vitest run"
  MAX_ITERATIONS       default: 3
  MAX_FILE_CHARS       default: 8000
  OLLAMA_CODER_TIMEOUT default: 600000 (ms)
`)
  process.exit(0)
}

// ── helpers ───────────────────────────────────────────────────────────────────
function divider(label) {
  console.log(`\n${"─".repeat(60)}\n  ${label}\n${"─".repeat(60)}`)
}

function printSummary(writtenFiles, testResult, timings, dryRun = false) {
  console.log(`\n${"═".repeat(60)}`)
  console.log(dryRun ? "  DRY RUN SUMMARY" : "  SUMMARY")
  console.log(`${"═".repeat(60)}`)
  if (dryRun) {
    console.log(`  Files that WOULD be modified : ${writtenFiles.length}`)
  } else {
    console.log(`  Files modified : ${writtenFiles.length}`)
  }
  writtenFiles.forEach((f) => console.log(`    • ${f}`))
  if (!dryRun) {
    console.log(`  Tests : ${testResult?.passed ? "✅ passing" : "❌ failing"}`)
  }
  console.log(`\n  Timings`)
  formatTimings(timings).forEach((l) => console.log(l))
  console.log(`${"═".repeat(60)}\n`)
}

// ── core swarm loop ───────────────────────────────────────────────────────────
async function runSwarm(task, projectRoot, dryRun = false) {
  const timings = {}

  // ── Skills ─────────────────────────────────────────────────────────────────
  let skillsIndex = null,
    skillsDir = null
  if (!values["no-skills"]) {
    skillsDir = findSkillsDir(projectRoot)
    if (skillsDir) {
      skillsIndex = loadSkillsIndex(skillsDir)
      if (skillsIndex) console.log(`   Skills  : ${skillsDir}`)
    }
  }

  // ── Baseline ───────────────────────────────────────────────────────────────
  if (!dryRun) {
    const t = startTimer()
    process.stdout.write("  📊 Capturing baseline...")
    const baseline_result = runTests(projectRoot)
    timings["baseline"] = performance.now() - t
    console.log(` ${baseline_result.passed ? "✅" : "❌"}  (${elapsed(t)})`)
    runSwarm._baseline = baseline_result
  }
  const baseline = runSwarm._baseline ?? {
    passed: false,
    output: "(no baseline)",
  }

  // ── Plan ───────────────────────────────────────────────────────────────────
  divider("1 / 4  PLANNER")
  const planStart = startTimer()
  const projectContext = readProjectContext(projectRoot)
  const {
    plan: implementationPlan,
    selectedSkills,
    relevantFiles,
  } = await plan(task, projectContext, skillsIndex)
  timings["planner"] = performance.now() - planStart
  console.log(`\n${implementationPlan}\n`)
  console.log(`  ⏱  ${elapsed(planStart)}`)

  const skillContent =
    skillsDir && selectedSkills.length > 0
      ? loadSelectedSkills(skillsDir, selectedSkills)
      : ""
  if (skillContent) console.log(`  📚 Skills: ${selectedSkills.join(", ")}`)

  const focusedContext = readFocusedContext(projectRoot, relevantFiles)
  console.log(
    focusedContext
      ? `  🎯 Focused context: ${relevantFiles.join(", ")}`
      : `  📂 Full project context`,
  )

  // ── Code → Test → Review loop ──────────────────────────────────────────────
  let critiqueFeedback = "",
    lastWritten = [],
    lastTestResult = baseline

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    // CODER
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
      break
    }

    if (dryRun) {
      console.log(
        `  🔍 Would write: ${Object.keys(changes).join(", ")} (dry run — not written)`,
      )
      lastWritten = Object.keys(changes)
    } else {
      lastWritten = applyChanges(projectRoot, changes)
      console.log(`  📝 Written: ${lastWritten.join(", ")}`)
    }
    console.log(`  ⏱  ${elapsed(coderStart)}`)

    // TESTER
    let testResult
    if (dryRun || isNonSourceChange(changes)) {
      const label = dryRun
        ? "⏭️  Tester skipped (dry run)"
        : "⏭️  Tester skipped (no source changes)"
      console.log(`\n  ${label}`)
      testResult = { ...baseline, skipped: true }
    } else {
      const testerStart = startTimer()
      divider(`3 / 4  TESTER  (iteration ${i}/${MAX_ITERATIONS})`)
      testResult = await test(
        implementationPlan,
        changes,
        projectRoot,
        skillContent,
        false,
      )
      timings[`tester-${i}`] = performance.now() - testerStart
      console.log(`  ⏱  ${elapsed(testerStart)}`)
    }

    // CRITIC
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

    lastTestResult = testResult

    if (review.approved) {
      const msg = dryRun
        ? `\n✅ Dry run complete. No files were written.`
        : `\n🎉 Storm complete in ${i} iteration(s). Review the diff in VS Code and commit when ready.`
      console.log(msg)
      printSummary(lastWritten, testResult, timings, dryRun)
      return
    }

    critiqueFeedback = review.feedback
    console.log(`\n  Critique:\n${critiqueFeedback}\n`)
    if (i < MAX_ITERATIONS) console.log("  ↩️  Sending back to coder...")
  }

  console.log(
    `\n⚠️  Reached maximum iterations (${MAX_ITERATIONS}) without approval.`,
  )
  if (!dryRun)
    console.log(
      "   The last attempt is on disk. Review carefully before committing.",
    )
  printSummary(lastWritten, lastTestResult, timings, dryRun)
}

// ── direct chat (REPL non-swarm messages) ─────────────────────────────────────
async function chatWithContext(message, projectRoot, history) {
  const context = readProjectContext(projectRoot)
  const system =
    `You are a helpful coding assistant. The user is asking about their codebase.\n\n` +
    `## Project files\n${context}`

  const messages = [...history, { role: "user", content: message }]

  process.stdout.write("\n⚡ ")
  const reply = await chat(MODELS.planner, system, null, {
    temperature: 0.4,
    timeout: 120_000,
    messages,
    stream: true,
  })
  console.log("\n")
  return reply
}
// ── REPL ──────────────────────────────────────────────────────────────────────
async function startRepl(projectRoot) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "\n> ",
  })

  console.log(`\n⚡ STORM REPL`)
  console.log(`   Project : ${projectRoot}`)
  console.log(`   Model   : ${MODELS.planner} (chat) / ${MODELS.coder} (swarm)`)
  console.log(`\n   run: <task>       — run full swarm (writes files)`)
  console.log(`   dry-run: <task>   — plan + code, no file writes`)
  console.log(`   anything else     — chat directly (fast)`)
  console.log(`   exit              — quit\n`)

  const history = [] // conversation history for multi-turn chat
  rl.prompt()

  rl.on("line", async (input) => {
    const line = input.trim()
    if (!line) {
      rl.prompt()
      return
    }
    if (line === "exit" || line === "quit") {
      console.log("👋")
      process.exit(0)
    }

    rl.pause()

    try {
      if (line.toLowerCase().startsWith("run:")) {
        const task = line.slice(4).trim()
        console.log(`\n⚡ Running swarm: "${task}"`)
        await runSwarm(task, projectRoot, false)
        history.length = 0 // clear chat history after a swarm run
      } else if (line.toLowerCase().startsWith("dry-run:")) {
        const task = line.slice(8).trim()
        console.log(`\n⚡ Dry run: "${task}"`)
        await runSwarm(task, projectRoot, true)
      } else {
        // Plain chat — fast, streamed, multi-turn
        const reply = await chatWithContext(line, projectRoot, history)
        history.push({ role: "user", content: line })
        history.push({ role: "assistant", content: reply })
        // Keep history bounded to last 10 exchanges
        if (history.length > 20) history.splice(0, 2)
      }
    } catch (err) {
      console.error(`\n💥 ${err.message}`)
    }

    rl.resume()
    rl.prompt()
  })

  rl.on("close", () => {
    console.log("👋")
    process.exit(0)
  })
}

// ── entry point ───────────────────────────────────────────────────────────────
const projectRoot = path.resolve(values.project)

if (values.repl) {
  startRepl(projectRoot)
} else {
  const task = positionals.join(" ")
  const dryRun = task.toLowerCase().startsWith("dry-run:")
  const cleanTask = dryRun ? task.slice(8).trim() : task

  console.log(`\n⚡ STORM starting`)
  console.log(`   Task    : ${cleanTask}${dryRun ? " (dry run)" : ""}`)
  console.log(`   Project : ${projectRoot}`)
  console.log(`   Ollama  : ${OLLAMA_HOST}`)
  console.log(`   Models  : planner=${MODELS.planner}  coder=${MODELS.coder}`)
  console.log(`             tester=${MODELS.tester}  critic=${MODELS.critic}`)
  console.log(`   Tests   : ${TEST_COMMAND}`)
  console.log(`   Max iter: ${MAX_ITERATIONS}`)

  runSwarm(cleanTask, projectRoot, dryRun).catch((err) => {
    console.error(`\n💥 ${err.message}`)
    process.exit(1)
  })
}
