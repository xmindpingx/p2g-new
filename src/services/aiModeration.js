// places2go — AI content screening (Ollama)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Runs the moderation queue against the admin's own Ollama server. It is
// started from the Admin panel on a moderator's or administrator's device
// (the same device that runs the "Connected" check), never from an ordinary
// user's device. When a backend takes over this job, have it call the same
// store action (processModerationDecision) and stop calling runAiModeration.
//
// Request: POST {ollamaBaseUrl}/api/chat   (stream: false, format: "json")
//   text  → ollamaTextModerationModel
//   photo → ollamaVisionModerationModel with images: [<base64>]
// The model must answer with JSON:
//   { "violation": true|false, "confidence": 0.0–1.0, "reason": "<FLAG_REASON key>", "note": "<short>" }
// confidence is the model's probability that the content violates the rules.
//
// Result handling (matches processModerationDecision):
//   confidence >= nsfwFlagThreshold → FLAGGED (+ reason) → mods review it
//   otherwise                        → CLEAN → content becomes visible
//   unreachable / bad JSON / no model configured → ERROR → "under review"
//   (an ERROR entry is shown in the queue for a human to decide)

import useStore from '../store/useStore';
import { AI_STATUS, CONTENT_TYPE, FLAG_REASON } from '../constants/moderation';

const REASON_KEYS = Object.keys(FLAG_REASON);            // e.g. 'NSFW_EXPLICIT'
const REASON_VALUES = new Set(Object.values(FLAG_REASON)); // e.g. 'nsfw_explicit'

const RULES = `You are the content-safety screener for places2go, a public app where people add restrooms (places), write reviews, and attach photos.
Decide whether the submitted content violates the rules. Violations, with the reason code to use:
  NSFW_EXPLICIT   sexual or explicit nudity
  NSFW_SUGGESTIVE sexually suggestive content
  VIOLENCE        gore, threats, or violent content
  HATE_SPEECH     slurs or attacks on a protected group
  SPAM            advertising, scams, links unrelated to the place
  PERSONAL_INFO   phone numbers, home addresses, full names of private people, licence plates, faces of identifiable people in photos
  MISINFORMATION  claims about the place that are plainly false or dangerous
  INAPPROPRIATE   anything else unsuitable for a general audience
Ordinary descriptions of restrooms, cleanliness, smells, plumbing, and blunt or negative opinions are NOT violations.
Answer with JSON only, no prose, exactly in this shape:
{"violation": true or false, "confidence": number from 0 to 1 giving the probability that the content violates the rules, "reason": one of the reason codes above or null, "note": "one short sentence"}`;

const TEXT_PROMPT  = (kind, text) => `Content type: ${kind}\n\nContent:\n"""\n${text}\n"""`;
const PHOTO_PROMPT = 'Content type: photo attached to a place or review. Screen the attached image.';

export class AiModerationError extends Error {
  constructor(message, { cause = null } = {}) { super(message); this.name = 'AiModerationError'; this.cause = cause; }
}

// ---------------------------------------------------------------------------
// Ollama request
// ---------------------------------------------------------------------------
async function chat(appSettings, { model, prompt, images = null }) {
  const { ollamaBaseUrl, ollamaApiKey, ollamaTimeoutMs } = appSettings;
  const url = `${ollamaBaseUrl.replace(/\/$/, '')}/api/chat`;
  const headers = { 'Content-Type': 'application/json', ...(ollamaApiKey ? { Authorization: `Bearer ${ollamaApiKey}` } : {}) };
  const body = {
    model,
    stream: false,
    format: 'json',
    messages: [
      { role: 'system', content: RULES },
      { role: 'user', content: prompt, ...(images ? { images } : {}) },
    ],
    options: {
      temperature: appSettings.ollamaTemperature,
      top_p:       appSettings.ollamaTopP,
      top_k:       appSettings.ollamaTopK,
      num_ctx:     appSettings.ollamaNumCtx,
      num_predict: appSettings.ollamaMaxTokens,
    },
  };

  const controller = new AbortController();
  // Vision models take longer than the connectivity ping; allow 6x the ping timeout.
  const timeoutId = setTimeout(() => controller.abort(), (ollamaTimeoutMs || 10000) * 6);
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) throw new AiModerationError(`Ollama responded with status ${response.status}: ${raw.slice(0, 200)}`);
    let data;
    try { data = JSON.parse(raw); } catch (err) { throw new AiModerationError('Ollama returned a non-JSON response', { cause: err }); }
    const content = data?.message?.content;
    if (typeof content !== 'string') throw new AiModerationError('Ollama response had no message content');
    return content;
  } catch (err) {
    if (err instanceof AiModerationError) throw err;
    if (err.name === 'AbortError') throw new AiModerationError(`Ollama did not answer within ${(ollamaTimeoutMs || 10000) * 6} ms`, { cause: err });
    throw new AiModerationError(`Could not reach Ollama: ${err.message}`, { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Parse the model's JSON answer into { violation, confidence, reason, note }. */
export function parseVerdict(content) {
  let obj;
  try {
    obj = JSON.parse(content);
  } catch (err) {
    // Some models wrap JSON in text; take the first {...} block.
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new AiModerationError(`Model answer was not JSON: ${content.slice(0, 120)}`);
    try { obj = JSON.parse(m[0]); } catch (err2) { throw new AiModerationError(`Model answer was not valid JSON: ${content.slice(0, 120)}`); }
  }
  const violation  = obj.violation === true || obj.violation === 'true';
  let confidence   = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = violation ? 1 : 0;
  confidence = Math.min(1, Math.max(0, confidence));

  let reason = null;
  if (typeof obj.reason === 'string') {
    const key = obj.reason.trim().toUpperCase();
    if (REASON_KEYS.includes(key)) reason = FLAG_REASON[key];
    else if (REASON_VALUES.has(obj.reason.trim().toLowerCase())) reason = obj.reason.trim().toLowerCase();
  }
  if (violation && !reason) reason = FLAG_REASON.INAPPROPRIATE;

  return { violation, confidence, reason, note: typeof obj.note === 'string' ? obj.note.slice(0, 200) : '' };
}

// ---------------------------------------------------------------------------
// Content lookup
// ---------------------------------------------------------------------------
function findPhoto(state, photoId) {
  for (const place of state.places) {
    const p = (place.photos || []).find((x) => x.id === photoId);
    if (p) return p;
  }
  for (const review of state.reviews) {
    const p = (review.photos || []).find((x) => x.id === photoId);
    if (p) return p;
  }
  return null;
}

async function imageToBase64(uri) {
  const res = await fetch(uri);
  if (!res.ok) throw new AiModerationError(`Could not load photo (status ${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new AiModerationError('Could not read photo data'));
    reader.onload  = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}

/** Resolve a queue entry to what the model should look at, or throw. */
async function resolveContent(state, entry) {
  switch (entry.contentType) {
    case CONTENT_TYPE.REVIEW_TEXT: {
      const review = state.reviews.find((r) => r.id === entry.contentRef);
      if (!review) throw new AiModerationError('Review no longer exists');
      return { kind: 'review text', text: review.text || '' };
    }
    case CONTENT_TYPE.PLACE_NOTE: {
      const place = state.places.find((p) => p.id === entry.contentRef);
      if (!place) throw new AiModerationError('Place no longer exists');
      return { kind: 'place notes', text: place.notes || '' };
    }
    case CONTENT_TYPE.PHOTO: {
      const photo = findPhoto(state, entry.contentRef);
      if (!photo) throw new AiModerationError('Photo no longer exists');
      const uri = photo.uploadedUrl || photo.localUri;
      if (!uri) throw new AiModerationError('Photo has no readable location');
      return { kind: 'photo', image: await imageToBase64(uri) };
    }
    default:
      throw new AiModerationError(`Unknown content type "${entry.contentType}"`);
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let running = false;
export const isRunning = () => running;

/**
 * runAiModeration({ limit, onProgress })
 * Classifies every PENDING queue entry (oldest first) and records each result
 * through processModerationDecision. Resolves to a summary:
 *   { processed, clean, flagged, errors, skipped, details: [{ id, contentType, status, message }] }
 * Entries whose content type has no model configured are left PENDING and
 * counted as skipped, so the admin can see what still needs a model.
 */
export async function runAiModeration({ limit = 50, onProgress } = {}) {
  if (running) throw new AiModerationError('AI screening is already running');
  running = true;
  const summary = { processed: 0, clean: 0, flagged: 0, errors: 0, skipped: 0, details: [] };
  try {
    const state = useStore.getState();
    const { appSettings, currentUser } = state;
    if (currentUser.role !== 'admin' && currentUser.role !== 'mod') throw new AiModerationError('Only moderators and administrators can run AI screening');
    if (!appSettings.autoFlagNsfwContent) throw new AiModerationError('AI Content Screening is turned off in Admin Settings');
    if (!appSettings.ollamaBaseUrl?.trim()) throw new AiModerationError('Ollama server URL is not set');

    const pending = [...state.moderationQueue]
      .filter((e) => e.aiStatus === AI_STATUS.PENDING)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, limit);

    for (let i = 0; i < pending.length; i += 1) {
      const entry = pending[i];
      onProgress?.({ index: i + 1, total: pending.length, entry });
      const isPhoto = entry.contentType === CONTENT_TYPE.PHOTO;
      const model = (isPhoto ? appSettings.ollamaVisionModerationModel : appSettings.ollamaTextModerationModel || '').trim();
      if (!model) {
        summary.skipped += 1;
        summary.details.push({ id: entry.id, contentType: entry.contentType, status: 'skipped', message: `No ${isPhoto ? 'vision' : 'text'} moderation model set in Admin Settings` });
        continue;
      }
      try {
        const content = await resolveContent(useStore.getState(), entry);
        const answer = await chat(appSettings, isPhoto
          ? { model, prompt: PHOTO_PROMPT, images: [content.image] }
          : { model, prompt: TEXT_PROMPT(content.kind, content.text) });
        const verdict = parseVerdict(answer);
        const flagged = verdict.violation || verdict.confidence >= appSettings.nsfwFlagThreshold;
        useStore.getState().processModerationDecision(
          entry.id,
          flagged ? AI_STATUS.FLAGGED : AI_STATUS.CLEAN,
          verdict.confidence,
          flagged ? verdict.reason : null,
        );
        summary.processed += 1;
        if (flagged) summary.flagged += 1; else summary.clean += 1;
        summary.details.push({ id: entry.id, contentType: entry.contentType, status: flagged ? 'flagged' : 'clean', message: verdict.note });
      } catch (err) {
        useStore.getState().processModerationDecision(entry.id, AI_STATUS.ERROR, null, null);
        summary.processed += 1;
        summary.errors += 1;
        summary.details.push({ id: entry.id, contentType: entry.contentType, status: 'error', message: err.message });
      }
    }
    return summary;
  } finally {
    running = false;
  }
}
