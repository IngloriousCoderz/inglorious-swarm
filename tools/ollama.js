import { OLLAMA_HOST, OLLAMA_TIMEOUT } from "../config.js"

/**
 * Send a chat request to Ollama. Returns the assistant reply as a string.
 * Low temperature by default — agents need determinism, not creativity.
 * @param {string} model
 * @param {string} system
 * @param {string} user
 * @param {number} temperature
 * @param {number} timeout  Override default timeout in ms
 */
export async function chat(
  model,
  system,
  user,
  temperature = 0.2,
  timeout = OLLAMA_TIMEOUT,
) {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeout),
  }).catch((err) => {
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError"
    throw new Error(
      isTimeout
        ? `Ollama timed out after ${Math.round(timeout / 1000)}s for model "${model}".\n` +
            `Try a smaller model (MODEL_CODER=qwen2.5-coder:7b) or raise OLLAMA_CODER_TIMEOUT.`
        : `Cannot reach Ollama at ${OLLAMA_HOST}.\n` +
            `Make sure it's running and OLLAMA_HOST is set correctly.\n` +
            `Error: ${err.message}`,
    )
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Ollama returned ${response.status}: ${body}`)
  }

  const data = await response.json()
  return data.message.content
}
