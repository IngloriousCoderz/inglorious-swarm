/**
 * Lightweight step timer.
 * Usage:
 *   const t = startTimer()
 *   // ... do work ...
 *   console.log(elapsed(t))  // "12.3s"
 */

export function startTimer() {
  return performance.now()
}

export function elapsed(since) {
  const ms = performance.now() - since
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Format a total duration breakdown for the summary.
 * @param {Record<string, number>} timings  { stepName: ms }
 * @returns {string[]}
 */
export function formatTimings(timings) {
  const total = Object.values(timings).reduce((a, b) => a + b, 0)
  return [
    ...Object.entries(timings).map(([name, ms]) => {
      const s = (ms / 1000).toFixed(1)
      const pct = Math.round((ms / total) * 100)
      return `    ${name.padEnd(12)}: ${s.padStart(6)}s  (${pct}%)`
    }),
    `    ${"total".padEnd(12)}: ${(total / 1000).toFixed(1).padStart(6)}s`,
  ]
}
