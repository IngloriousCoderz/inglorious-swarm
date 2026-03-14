import { OLLAMA_HOST } from "../config.js"

/**
 * Send a chat request to Ollama. Returns the assistant reply as a string.
 * Low temperature by default — agents need determinism, not creativity.
 */
export async function chat(model, system, user, temperature = 0.2) {
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
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  }).catch((err) => {
    throw new Error(
      `Cannot reach Ollama at ${OLLAMA_HOST}.\n` +
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
