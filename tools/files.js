import fs from "fs"
import path from "path"
import { MAX_FILE_CHARS } from "../config.js"

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".cache",
  "__pycache__",
  ".vite",
])

const CODE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".scss",
  ".py",
  ".md",
])

/** Recursively list all relevant source files relative to projectRoot. */
export function listFiles(projectRoot) {
  const results = []

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(path.relative(projectRoot, full))
      }
    }
  }

  walk(projectRoot)
  return results.sort()
}

/** Read a list of relative paths and return { path: content }. */
export function readFiles(projectRoot, paths) {
  return Object.fromEntries(
    paths
      .map((rel) => {
        const full = path.join(projectRoot, rel)
        if (!fs.existsSync(full)) return null
        const content = fs.readFileSync(full, "utf8")
        return [rel, content.slice(0, MAX_FILE_CHARS)]
      })
      .filter(Boolean),
  )
}

/** Build a compact project context string for prompts. */
export function readProjectContext(projectRoot, maxFiles = 20) {
  const files = listFiles(projectRoot).slice(0, maxFiles)
  const contents = readFiles(projectRoot, files)
  return Object.entries(contents)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n")
}

/**
 * Write { relativePath: content } to disk.
 * Returns the list of written paths.
 */
export function applyChanges(projectRoot, changes) {
  return Object.entries(changes).map(([rel, content]) => {
    const full = path.join(projectRoot, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, "utf8")
    return rel
  })
}

/**
 * Extract file blocks from LLM output.
 * Expects:
 *   ### path/to/file.ts
 *   ```
 *   ...content...
 *   ```
 * Returns { path: content }.
 */
export function parseFileBlocks(text) {
  const pattern = /###\s+(\S+)\s*\n```(?:\w+)?\n([\s\S]*?)```/g
  const result = {}
  for (const match of text.matchAll(pattern)) {
    result[match[1]] = match[2]
  }
  return result
}

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
])

/**
 * Returns true if ALL changed files are non-source (docs, config, assets).
 * Used to skip the tester when there's nothing testable to validate.
 * @param {Record<string, string>} changes
 * @returns {boolean}
 */
export function isNonSourceChange(changes) {
  return Object.keys(changes)
    .filter((p) => !p.startsWith("__"))
    .every((p) => !SOURCE_EXTENSIONS.has(path.extname(p)))
}

/**
 * Build a focused context string containing only the files relevant to the plan.
 * Falls back to full project context if no relevant files were identified.
 * @param {string}   root
 * @param {string[]} relevantFiles  Paths identified by the planner
 * @returns {string}
 */
export function readFocusedContext(root, relevantFiles) {
  if (!relevantFiles || relevantFiles.length === 0) return null

  // Normalise separators — planner may use / or \ depending on OS
  const normalised = relevantFiles.map((f) => f.replaceAll("\\", "/"))
  const allFiles = listFiles(root).map((f) => f.replaceAll("\\", "/"))

  // Fuzzy match: accept if the file path ends with the relevant path
  // e.g. "storm.js" matches "src/storm.js" and "storm.js"
  const matched = allFiles.filter((f) =>
    normalised.some(
      (rel) => f === rel || f.endsWith("/" + rel) || rel.endsWith("/" + f),
    ),
  )

  if (matched.length === 0) return null

  const contents = readFiles(root, matched)
  return Object.entries(contents)
    .map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join("\n\n")
}
