// places2go — Bug Report Server
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Receives bug reports from the BugReportButton component. Each report may
// include a screenshot (multipart/form-data) and a JSON payload with queued
// JS errors, device info, and a timestamp.
//
// Usage:
//   node server/bug-report-server.js
//
// Env vars (optional — defaults shown):
//   BUG_REPORT_PORT=3001        HTTP port to listen on
//   BUG_REPORT_DIR=./bug-reports  Directory to store reports and screenshots
//
// Endpoints:
//   POST /bug-reports           Accepts multipart (screenshot + data) or plain JSON
//   GET  /bug-reports           Returns list of stored reports (newest first)
//   GET  /bug-reports/:id       Returns one report by ID
//   GET  /bug-reports/:id/screenshot  Serves the screenshot image (if any)
//   DELETE /bug-reports/:id     Deletes a report and its screenshot

'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT        = parseInt(process.env.BUG_REPORT_PORT  || '3001', 10);
const REPORTS_DIR = path.resolve(process.env.BUG_REPORT_DIR || path.join(__dirname, 'bug-reports'));
const META_FILE   = path.join(REPORTS_DIR, '_index.json');

// Ensure storage directory exists
fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateId() {
  return Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex');
}

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveIndex(index) {
  fs.writeFileSync(META_FILE, JSON.stringify(index, null, 2));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length':              Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parsePath(url) {
  // Strip query string
  const clean = url.split('?')[0].replace(/\/+$/, '') || '/';
  const parts = clean.split('/').filter(Boolean); // ['bug-reports', id?, 'screenshot'?]
  return parts;
}

// ---------------------------------------------------------------------------
// Multipart parser (minimal — only handles one file field named "screenshot"
// and one JSON field named "data")
// ---------------------------------------------------------------------------
function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from('--' + boundary);
  const CRLF        = Buffer.from('\r\n');
  const CRLFCRLF    = Buffer.from('\r\n\r\n');

  const result = { data: null, screenshot: null, screenshotMime: 'image/jpeg' };
  let offset = 0;

  while (offset < buffer.length) {
    const boundaryPos = buffer.indexOf(boundaryBuf, offset);
    if (boundaryPos === -1) break;
    offset = boundaryPos + boundaryBuf.length;

    // Check for final boundary
    if (buffer[offset] === 0x2d && buffer[offset + 1] === 0x2d) break;

    // Skip CRLF after boundary
    if (buffer[offset] === 0x0d) offset += 2;

    // Read headers until CRLFCRLF
    const headerEnd = buffer.indexOf(CRLFCRLF, offset);
    if (headerEnd === -1) break;
    const headerStr = buffer.slice(offset, headerEnd).toString();
    offset = headerEnd + 4; // skip CRLFCRLF

    // Find next boundary for body end
    const nextBoundary = buffer.indexOf(boundaryBuf, offset);
    const bodyEnd      = nextBoundary === -1 ? buffer.length : nextBoundary - 2; // -2 for CRLF
    const body         = buffer.slice(offset, bodyEnd);
    offset             = nextBoundary === -1 ? buffer.length : nextBoundary;

    const nameMatch = headerStr.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    if (fieldName === 'data') {
      try { result.data = JSON.parse(body.toString()); } catch { /* ignore */ }
    } else if (fieldName === 'screenshot') {
      result.screenshot = body;
      const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      if (mimeMatch) result.screenshotMime = mimeMatch[1].trim();
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Request body reader
// ---------------------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
async function handlePost(req, res) {
  const contentType = req.headers['content-type'] || '';
  const body        = await readBody(req);
  const id          = generateId();
  const submittedAt = new Date().toISOString();

  let data        = null;
  let screenshot  = null;
  let screenshotMime = 'image/jpeg';

  if (contentType.includes('multipart/form-data')) {
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return sendJson(res, 400, { error: 'Missing boundary' });
    const parsed = parseMultipart(body, boundaryMatch[1]);
    data          = parsed.data;
    screenshot    = parsed.screenshot;
    screenshotMime = parsed.screenshotMime;
  } else if (contentType.includes('application/json')) {
    try { data = JSON.parse(body.toString()); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
  } else {
    return sendJson(res, 415, { error: 'Unsupported content type' });
  }

  // Save screenshot to disk
  let screenshotFile = null;
  if (screenshot && screenshot.length > 0) {
    const ext        = screenshotMime.includes('png') ? 'png' : 'jpg';
    screenshotFile   = `${id}.${ext}`;
    fs.writeFileSync(path.join(REPORTS_DIR, screenshotFile), screenshot);
  }

  // Build record
  const record = {
    id,
    submittedAt,
    screenshotFile,
    data: data || {},
  };

  // Prepend to index (newest first)
  const index = loadIndex();
  index.unshift(record);
  saveIndex(index);

  console.log(`[bug-report] stored ${id} (screenshot: ${screenshotFile || 'none'})`);
  sendJson(res, 201, { id, submittedAt });
}

function handleList(res) {
  const index = loadIndex();
  sendJson(res, 200, index);
}

function handleGetOne(res, id) {
  const index  = loadIndex();
  const record = index.find((r) => r.id === id);
  if (!record) return sendJson(res, 404, { error: 'Not found' });
  sendJson(res, 200, record);
}

function handleScreenshot(res, id) {
  const index  = loadIndex();
  const record = index.find((r) => r.id === id);
  if (!record || !record.screenshotFile) return sendJson(res, 404, { error: 'No screenshot' });

  const filePath = path.join(REPORTS_DIR, record.screenshotFile);
  if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'File missing' });

  const ext      = path.extname(record.screenshotFile).toLowerCase();
  const mime     = ext === '.png' ? 'image/png' : 'image/jpeg';
  const fileSize = fs.statSync(filePath).size;

  res.writeHead(200, {
    'Content-Type':                mime,
    'Content-Length':              fileSize,
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleDelete(res, id) {
  const index   = loadIndex();
  const idx     = index.findIndex((r) => r.id === id);
  if (idx === -1) return sendJson(res, 404, { error: 'Not found' });

  const record  = index[idx];

  // Delete screenshot file if present
  if (record.screenshotFile) {
    const filePath = path.join(REPORTS_DIR, record.screenshotFile);
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  index.splice(idx, 1);
  saveIndex(index);
  sendJson(res, 200, { deleted: id });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const parts = parsePath(req.url);
  // parts: [] | ['bug-reports'] | ['bug-reports', id] | ['bug-reports', id, 'screenshot']

  if (parts[0] !== 'bug-reports') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  try {
    if (req.method === 'POST' && parts.length === 1) {
      return await handlePost(req, res);
    }
    if (req.method === 'GET'  && parts.length === 1) {
      return handleList(res);
    }
    if (req.method === 'GET'  && parts.length === 2) {
      return handleGetOne(res, parts[1]);
    }
    if (req.method === 'GET'  && parts.length === 3 && parts[2] === 'screenshot') {
      return handleScreenshot(res, parts[1]);
    }
    if (req.method === 'DELETE' && parts.length === 2) {
      return handleDelete(res, parts[1]);
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('[bug-report] error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`[bug-report] server listening on http://localhost:${PORT}`);
  console.log(`[bug-report] storing reports in ${REPORTS_DIR}`);
});
