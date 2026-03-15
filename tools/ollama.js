import { OLLAMA_HOST, OLLAMA_TIMEOUT } from "../config.js"

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 5000

/**
 * Send a request to Ollama.
 *
 * Single-turn:  chat(model, system, user)
 * Multi-turn:   chat(model, system, null, { messages: [...], stream: true })
 *
 * @param {string} model
 * @param {string} system
 * @param {string|null} user          Single user message (ignored if opts.messages provided)
 * @param {object} opts
 * @param {number}   opts.temperature  default 0.2
 * @param {number}   opts.timeout      override default timeout
 * @param {Array}    opts.messages     full conversation history (multi-turn)
 * @param {boolean}  opts.stream       stream tokens to stdout, returns full reply string
 * @returns {Promise<string>}
 */
export async function chat(model, system, user, opts = {}) {
  const {
    temperature = 0.2,
    timeout = OLLAMA_TIMEOUT,
    messages = null,
    stream = false,
  } = typeof opts === "number" ? { timeout: opts } : opts
  // ^ backwards compat: old callers passed timeout as 4th arg directly

  const body = {
    model,
    stream,
    options: { temperature },
    messages: [
      { role: "system", content: system },
      ...(messages ?? [{ role: "user", content: user }]),
    ],
  }

  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Ollama returned ${response.status}: ${text}`)
      }

      if (stream) {
        return await readStream(response)
      }

      const data = await response.json()
      return data.message.content
    } catch (err) {
      lastError = err
      const isTimeout = err.name === "TimeoutError" || err.name === "AbortError"
      const isConnError =
        err.message.includes("fetch failed") ||
        err.message.includes("ECONNREFUSED")

      if (isTimeout) {
        throw new Error(
          `Ollama timed out after ${Math.round(timeout / 1000)}s for model "${model}".\n` +
            `Try a smaller model or raise OLLAMA_CODER_TIMEOUT.`,
        )
      }
      if (isConnError && attempt <= MAX_RETRIES) {
        console.log(
          `  ⚠️  Ollama connection lost (attempt ${attempt}/${MAX_RETRIES + 1}). Retrying in ${RETRY_DELAY_MS / 1000}s...`,
        )
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      throw new Error(
        `Cannot reach Ollama at ${OLLAMA_HOST}.\n` +
          `Make sure it's running and OLLAMA_HOST is set correctly.\n` +
          `Error: ${err.message}`,
      )
    }
  }
  throw lastError
}

/**
 * Read a streaming Ollama response, printing tokens to stdout as they arrive.
 * Returns the full reply string.
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readStream(response) {
  let fullReply = ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split("\n").filter(Boolean)) {
      try {
        const chunk = JSON.parse(line)
        const token = chunk.message?.content ?? ""
        process.stdout.write(token)
        fullReply += token
        if (chunk.done) break
      } catch {}
    }
  }
  return fullReply
}
