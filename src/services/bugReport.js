// places2go — Bug report service
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// captureAndSubmit({ appSettings, currentUser, navigation })
//   1. Takes a screenshot (react-native-view-shot on native; skipped on web).
//   2. Collects device info, current timestamp, and queued JS errors.
//   3. POSTs a multipart payload to appSettings.bugReportUrl.
//   4. Returns the server's { id } or throws BugReportError.
//
// analyseBugReport(appSettings, report)
//   Sends report.logs + report.deviceInfo to Ollama and returns
//   { likelyCause, severity, suggestions } or throws OllamaError.

import { Platform } from 'react-native';
import { getQueuedErrors, clearQueuedErrors } from '../hooks/useErrorCapture';
import { ollamaJson } from './ollama';

export class BugReportError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'BugReportError';
    this.status = status;
    this.cause  = cause;
  }
}

// ── Screenshot capture ────────────────────────────────────────────────────────
// react-native-view-shot is native-only. On web we skip the screenshot rather
// than crashing, so users on web can still file reports.

let _captureScreen = null;

async function _getCapture() {
  if (_captureScreen) return _captureScreen;
  if (Platform.OS === 'web') return null;
  try {
    const { captureScreen } = await import('react-native-view-shot');
    _captureScreen = captureScreen;
    return _captureScreen;
  } catch {
    return null;
  }
}

async function takeScreenshot() {
  const capture = await _getCapture();
  if (!capture) return null;
  try {
    return await capture({ format: 'jpg', quality: 0.7 });
  } catch {
    return null;
  }
}

// ── Device info ───────────────────────────────────────────────────────────────

function collectDeviceInfo() {
  const info = {
    platform: Platform.OS,
    version:  Platform.Version || null,
    isTV:     Platform.isTV    || false,
  };
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    info.userAgent = (navigator.userAgent || '').slice(0, 250);
    info.language  = navigator.language || null;
  }
  if (Platform.OS === 'android' && Platform.constants) {
    const c = Platform.constants;
    info.brand        = c.Brand  || null;
    info.manufacturer = c.Manufacturer || null;
    info.model        = c.Model  || null;
    info.release      = c.Release || null;
  }
  if (Platform.OS === 'ios' && Platform.constants) {
    const c = Platform.constants;
    info.model        = c.Model        || null;
    info.systemName   = c.systemName   || null;
    info.systemVersion = c.osVersion   || null;
  }
  return info;
}

// ── Submit ────────────────────────────────────────────────────────────────────

/**
 * captureAndSubmit({ appSettings, currentUser })
 * Returns { id, submittedAt } on success. Throws BugReportError on failure.
 */
export async function captureAndSubmit({ appSettings, currentUser }) {
  const bugReportUrl = (appSettings?.bugReportUrl || '').trim();
  if (!bugReportUrl) throw new BugReportError('Bug report server URL is not configured (Admin Settings → Bug Reporting).');

  const [screenshotUri, deviceInfo, errors] = await Promise.all([
    takeScreenshot(),
    Promise.resolve(collectDeviceInfo()),
    Promise.resolve(getQueuedErrors()),
  ]);

  const payload = {
    submittedAt: new Date().toISOString(),
    userId:      currentUser?.id    || 'unknown',
    userRole:    currentUser?.role  || 'unknown',
    platform:    deviceInfo.platform,
    deviceInfo,
    errors,
    hasScreenshot: !!screenshotUri,
  };

  let body;
  let headers = {};

  if (screenshotUri) {
    // Multipart — screenshot + JSON metadata
    const form = new FormData();
    form.append('data', JSON.stringify(payload));
    form.append('screenshot', {
      uri:  screenshotUri,
      name: 'screenshot.jpg',
      type: 'image/jpeg',
    });
    body = form;
    // Let fetch set the boundary automatically; don't set Content-Type manually.
  } else {
    body    = JSON.stringify(payload);
    headers = { 'Content-Type': 'application/json' };
  }

  let response;
  try {
    response = await fetch(bugReportUrl, { method: 'POST', headers, body });
  } catch (err) {
    throw new BugReportError('Could not reach the bug-report server.', { cause: err });
  }

  let data = null;
  try { data = await response.json(); } catch { /* plain-text OK response */ }

  if (!response.ok) {
    const reason = data?.message || data?.error || `status ${response.status}`;
    throw new BugReportError(`Bug-report server rejected the request (${reason}).`, { status: response.status });
  }

  // Clear error queue now that we've included them in the report.
  clearQueuedErrors();

  return { id: data?.id || null, submittedAt: payload.submittedAt };
}

// ── Ollama analysis ───────────────────────────────────────────────────────────

/**
 * analyseBugReport(appSettings, report)
 * report = { errors, deviceInfo, submittedAt, … } as stored in the admin panel.
 * Returns { likelyCause, severity, suggestions } or throws OllamaError.
 */
export async function analyseBugReport(appSettings, report) {
  const errorText = (report.errors || [])
    .map((e, i) => `[${i + 1}] ${e.timestamp} — ${e.message}${e.stack ? `\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}` : ''}`)
    .join('\n') || '(no JS errors captured)';

  const deviceText = JSON.stringify(report.deviceInfo || {}, null, 2);

  const system = `You are a mobile-app crash-triage assistant. Given a bug report from a React Native / Expo application, identify the most likely root cause, assign a severity (low / medium / high / critical), and suggest up to three specific fixes or investigation steps. Respond with valid JSON only.`;

  const prompt = `Bug report filed at: ${report.submittedAt || 'unknown'}

Device info:
${deviceText}

Captured JS errors (most recent first):
${errorText}

Respond with:
{
  "likelyCause": "<one-sentence root cause>",
  "severity": "low" | "medium" | "high" | "critical",
  "suggestions": ["<step 1>", "<step 2>", "<step 3>"]
}`;

  return ollamaJson(appSettings, { system, prompt, temperature: 0.3, maxTokens: 400 });
}
