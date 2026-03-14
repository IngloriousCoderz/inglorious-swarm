import fs from "node:fs"
import path from "node:path"

// Standard locations where skills tools install skill files.
// Checked in priority order — first match wins for each skill name.
const SKILL_DIRS = [
  ".claude/skills", // Claude Code / skills.sh default
  ".agents/skills", // OpenCode and others
  ".codex/skills", // Codex
  "skills", // bare fallback (e.g. local dev)
]

/**
 * Find the first existing skills directory under projectRoot.
 * Returns the absolute path or null if none found.
 * @param {string} projectRoot
 * @returns {string|null}
 */
export function findSkillsDir(projectRoot) {
  for (const dir of SKILL_DIRS) {
    const full = path.join(projectRoot, dir)
    if (fs.existsSync(full)) return full
  }
  return null
}

/**
 * Load the root SKILL.md index from the skills directory.
 * This is the routing file — it contains names, descriptions, and file paths
 * for all available skills, but not their full content.
 * @param {string} skillsDir  Absolute path to the skills directory
 * @returns {string|null}     Raw markdown content of SKILL.md, or null
 */
export function loadSkillsIndex(skillsDir) {
  // SKILL.md can live at the root of the skills dir or one level up
  const candidates = [
    path.join(skillsDir, "SKILL.md"),
    path.join(path.dirname(skillsDir), "SKILL.md"),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8")
    }
  }
  return null
}

/**
 * Load the full content of a specific skill file.
 * @param {string} skillsDir
 * @param {string} skillFile  Relative path as referenced in SKILL.md (e.g. "skills/web.md")
 * @returns {string|null}
 */
export function loadSkillFile(skillsDir, skillFile) {
  // Try path relative to skillsDir, then relative to its parent
  const candidates = [
    path.join(skillsDir, skillFile),
    path.join(path.dirname(skillsDir), skillFile),
    path.resolve(skillFile),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf8")
    }
  }
  return null
}

/**
 * Given a list of skill file paths selected by the planner,
 * load and concatenate their full content.
 * @param {string}   skillsDir
 * @param {string[]} selectedPaths  e.g. ["skills/web.md", "skills/store.md"]
 * @returns {string}  Combined skill content, or empty string if nothing loaded
 */
export function loadSelectedSkills(skillsDir, selectedPaths) {
  const parts = []
  for (const skillPath of selectedPaths) {
    const content = loadSkillFile(skillsDir, skillPath)
    if (content) {
      parts.push(`<!-- skill: ${skillPath} -->\n${content}`)
    } else {
      console.log(`  ⚠️  Skill not found: ${skillPath}`)
    }
  }
  return parts.join("\n\n---\n\n")
}

/**
 * Parse the planner's skill selection response.
 * Expects a newline-separated list of file paths, e.g.:
 *   skills/web.md
 *   skills/store.md
 * Also handles bullet/numbered list prefixes.
 * @param {string} response
 * @returns {string[]}
 */
export function parseSelectedSkills(response) {
  return response
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.endsWith(".md") && !line.includes(" "))
}
