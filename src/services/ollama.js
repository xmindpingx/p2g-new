// places2go — Ollama chat helper (JSON answers)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Used by the partner finder (ranking + first-contact drafts). Runs from an
// administrator's device against the Ollama server in Admin Settings.

export class OllamaError extends Error {
  constructor(message, { cause = null } = {}) { super(message); this.name = 'OllamaError'; this.cause = cause; }
}

/** Model for partner work: the outreach model, else the text moderation model. */
export const outreachModel = (settings) => (settings.ollamaOutreachModel || settings.ollamaTextModerationModel || '').trim();

export const isOllamaReady = (settings) => !!settings.ollamaBaseUrl?.trim() && !!outreachModel(settings);

/** Parse a JSON object out of a model answer (tolerates wrapping text). */
export function parseJsonAnswer(content) {
  try { return JSON.parse(content); } catch (err) { /* fall through */ }
  const m = String(content).match(/[\[{][\s\S]*[\]}]/);
  if (!m) throw new OllamaError(`Model answer was not JSON: ${String(content).slice(0, 120)}`);
  try { return JSON.parse(m[0]); } catch (err) { throw new OllamaError(`Model answer was not valid JSON: ${String(content).slice(0, 120)}`); }
}

/**
 * ollamaJson(settings, { system, prompt, temperature, maxTokens, timeoutMs })
 * → parsed JSON. Throws OllamaError with a readable message.
 */
export async function ollamaJson(settings, { system, prompt, temperature = 0.4, maxTokens = 900, timeoutMs = 90000 }) {
  const model = outreachModel(settings);
  if (!settings.ollamaBaseUrl?.trim()) throw new OllamaError('Ollama server URL is not set (Admin Settings)');
  if (!model) throw new OllamaError('No Ollama model set — enter a Partner Outreach Model or Text Moderation Model in Admin Settings');
  const url = `${settings.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  const headers = { 'Content-Type': 'application/json', ...(settings.ollamaApiKey ? { Authorization: `Bearer ${settings.ollamaApiKey}` } : {}) };
  const body = {
    model, stream: false, format: 'json',
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    options: { temperature, top_p: settings.ollamaTopP, top_k: settings.ollamaTopK, num_ctx: Math.max(settings.ollamaNumCtx || 2048, 4096), num_predict: maxTokens },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await res.text();
    if (!res.ok) throw new OllamaError(`Ollama responded with status ${res.status}: ${raw.slice(0, 160)}`);
    let data; try { data = JSON.parse(raw); } catch (err) { throw new OllamaError('Ollama returned a non-JSON response'); }
    if (typeof data?.message?.content !== 'string') throw new OllamaError('Ollama response had no message content');
    return parseJsonAnswer(data.message.content);
  } catch (err) {
    if (err instanceof OllamaError) throw err;
    if (err.name === 'AbortError') throw new OllamaError(`Ollama did not answer within ${Math.round(timeoutMs / 1000)} s`);
    throw new OllamaError(`Could not reach Ollama: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}
