// places2go — Bug report service
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// captureAndSubmit({ appSettings, currentUser })
//   1. Takes a screenshot (react-native-view-shot on native; skipped on web).
//   2. Collects device info, app version, current timestamp, and queued JS errors.
//   3. POSTs a multipart payload to appSettings.bugReportUrl.
//   4. Returns { id, submittedAt, screenshotFile, payload } or throws BugReportError.
//
// fetchBugReports(appSettings)
//   GET the full list from the server (newest first). Throws BugReportError.
//
// updateBugReport(appSettings, id, { dismissed?, aiAnalysis? })
//   PATCH admin-side state onto a stored report. Throws BugReportError.
//
// analyseBugReport(appSettings, report)
//   Sends the report's errors + device info to Ollama. When the report has a
//   screenshot AND a Vision Moderation Model is configured, the screenshot is
//   fetched from the server and sent to that model for visual analysis;
//   otherwise only the text is analysed with the outreach / text model.
//   Returns { likelyCause, severity, suggestions } or throws OllamaError.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
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

// ── URL helpers ──────────────────────────────────────────────────────────────
// appSettings.bugReportUrl is the collection URL, e.g. http://host:3001/bug-reports

function collectionUrl(appSettings) {
  const url = (appSettings?.bugReportUrl || '').trim().replace(/\/+$/, '');
  if (!url) throw new BugReportError('Bug report server URL is not configured (Admin Settings → Bug Reports).');
  return url;
}

export function bugReportItemUrl(appSettings, id) {
  return `${collectionUrl(appSettings)}/${encodeURIComponent(id)}`;
}

export function bugReportScreenshotUrl(appSettings, id) {
  return `${bugReportItemUrl(appSettings, id)}/screenshot`;
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

// ── App version ───────────────────────────────────────────────────────────────
// expo-constants exposes app.json's "version" as expoConfig.version in every
// environment (Expo Go, dev client, production build, web).

function getAppVersion() {
  try {
    return Constants?.expoConfig?.version
      || Constants?.nativeAppVersion
      || 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

/**
 * captureAndSubmit({ appSettings, currentUser })
 * Returns { id, submittedAt, screenshotFile, payload } on success.
 * Throws BugReportError on failure.
 */
export async function captureAndSubmit({ appSettings, currentUser }) {
  const bugReportUrl = collectionUrl(appSettings);

  const screenshotUri = await takeScreenshot();
  const deviceInfo    = collectDeviceInfo();
  const errors        = getQueuedErrors();
  const appVersion    = getAppVersion();

  const payload = {
    submittedAt:  new Date().toISOString(),
    appVersion,
    reportType:   'user_report',
    userId:       currentUser?.id    || 'unknown',
    userRole:     currentUser?.role  || 'unknown',
    platform:     deviceInfo.platform,
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

  return {
    id:             data?.id || null,
    submittedAt:    data?.submittedAt || payload.submittedAt,
    screenshotFile: data?.screenshotFile || null,
    payload,
  };
}

// ── Server list / update ─────────────────────────────────────────────────────

/**
 * fetchBugReports(appSettings)
 * Returns the server's report list (newest first). Each record:
 * { id, submittedAt, screenshotFile, data, aiAnalysis, dismissed }
 */
export async function fetchBugReports(appSettings) {
  const url = collectionUrl(appSettings);
  let response;
  try {
    response = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new BugReportError('Could not reach the bug-report server.', { cause: err });
  }
  let data = null;
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const reason = data?.message || data?.error || `status ${response.status}`;
    throw new BugReportError(`Bug-report server returned an error (${reason}).`, { status: response.status });
  }
  if (!Array.isArray(data)) throw new BugReportError('Bug-report server returned an unexpected response.');
  return data;
}

/**
 * updateBugReport(appSettings, id, { dismissed?, aiAnalysis? })
 * Persists admin-side state on the server. Returns the updated record.
 */
export async function updateBugReport(appSettings, id, patch) {
  const url = bugReportItemUrl(appSettings, id);
  let response;
  try {
    response = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch || {}),
    });
  } catch (err) {
    throw new BugReportError('Could not reach the bug-report server.', { cause: err });
  }
  let data = null;
  try { data = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const reason = data?.message || data?.error || `status ${response.status}`;
    throw new BugReportError(`Bug-report server rejected the update (${reason}).`, { status: response.status });
  }
  return data;
}

// ── Screenshot fetch (for Ollama vision) ─────────────────────────────────────

/**
 * Fetch a stored screenshot from the bug-report server and return it as a
 * base64 string (no data-URI prefix), or null if unavailable.
 */
async function fetchScreenshotBase64(appSettings, serverId) {
  try {
    const res = await fetch(bugReportScreenshotUrl(appSettings, serverId));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          resolve(result.replace(/^data:[^;]+;base64,/, '') || null);
        } else {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Ollama analysis ───────────────────────────────────────────────────────────

/**
 * analyseBugReport(appSettings, report)
 * report = { id, serverId, submittedAt, screenshotFile, data } as stored in the
 * bugReports cache (data = the payload the reporting device sent).
 * Returns { likelyCause, severity, suggestions } or throws OllamaError.
 */
export async function analyseBugReport(appSettings, report) {
  const reportData  = report?.data || {};
  const errors      = Array.isArray(reportData.errors) ? reportData.errors : [];
  const deviceInfo  = reportData.deviceInfo  || {};
  const appVersion  = reportData.appVersion  || 'unknown';
  const reportType  = reportData.reportType  || 'user_report';
  const userId      = reportData.userId      || 'unknown';
  const userRole    = reportData.userRole    || 'unknown';
  const submittedAt = report?.submittedAt || reportData.submittedAt || 'unknown';
  const serverId    = report?.serverId || report?.id || null;

  // Screenshot → only when the server has one AND a vision-capable model is set.
  const visionModel = (appSettings?.ollamaVisionModerationModel || '').trim();
  let screenshotBase64 = null;
  if (report?.screenshotFile && serverId && visionModel) {
    screenshotBase64 = await fetchScreenshotBase64(appSettings, serverId);
  }

  const errorText = errors
    .map((e, i) => `[${i + 1}] ${e.timestamp || '?'} — ${e.message || '(no message)'}${e.stack ? `\n    ${String(e.stack).split('\n').slice(0, 3).join('\n    ')}` : ''}`)
    .join('\n') || '(no JS errors captured)';

  const deviceText = JSON.stringify(deviceInfo, null, 2);

  const screenshotNote = screenshotBase64
    ? 'A screenshot of the app at the time of the report is attached. Examine it for visible UI errors, red error overlays, blank areas, or layout problems, and use it together with the error log.'
    : report?.screenshotFile
      ? 'A screenshot exists but is not attached to this request (no vision model configured or it could not be loaded). Base the analysis on the text only.'
      : 'No screenshot was captured with this report.';

  const system = `You are a mobile-app crash-triage assistant. Given a bug report from a React Native / Expo application, identify the most likely root cause, assign a severity (low / medium / high / critical), and suggest up to three specific fixes or investigation steps. If the evidence is insufficient, say so in likelyCause rather than guessing. Respond with valid JSON only.`;

  const prompt = `Bug report filed at: ${submittedAt}
App version: ${appVersion}
Report type: ${reportType}
User: ${userId} (role: ${userRole})

Device info:
${deviceText}

Captured JS errors (most recent first):
${errorText}

${screenshotNote}

Respond with:
{
  "likelyCause": "<one-sentence root cause>",
  "severity": "low" | "medium" | "high" | "critical",
  "suggestions": ["<step 1>", "<step 2>", "<step 3>"]
}`;

  return ollamaJson(appSettings, {
    system,
    prompt,
    temperature: 0.3,
    maxTokens:   500,
    ...(screenshotBase64 ? { images: [screenshotBase64], model: visionModel } : {}),
  });
}
