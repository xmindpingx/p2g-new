// places2go — Photo upload service
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Uploads one local image to your server and resolves with its public URL.
//
// Configure UPLOAD_ENDPOINT to your backend. The request is multipart/form-data
// with fields:  file (image), placeId, submittedBy, photoId
// Expected JSON response:  { "url": "https://…" }
//
// When UPLOAD_ENDPOINT is empty the upload is skipped and the photo stays
// 'local' — the app still works, photos just are not shown publicly until a
// server exists. This keeps local development honest without a fake URL.

// Local development server. On a physical device 'localhost' is the phone
// itself, so use your machine's LAN IP there (e.g. 'http://192.168.1.20:3000/photos').
// Android emulator reaches the host machine at 'http://10.0.2.2:3000/photos'.
export const UPLOAD_ENDPOINT = 'http://localhost:3000/photos';

const DEFAULT_TIMEOUT_MS = 30000;

export class UploadError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name   = 'UploadError';
    this.status = status;
    this.cause  = cause;
  }
}

const guessMime = (uri) => {
  const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
  if (ext === 'png')  return 'image/png';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export const isUploadConfigured = () => UPLOAD_ENDPOINT.trim().length > 0;

/**
 * uploadPhoto({ localUri, photoId, placeId, submittedBy, authToken, signal })
 * → { url }
 */
export async function uploadPhoto({ localUri, photoId, placeId, submittedBy, authToken = null, signal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!isUploadConfigured()) {
    throw new UploadError('Photo upload endpoint is not configured');
  }

  const form = new FormData();
  form.append('file', {
    uri:  localUri,
    name: `${photoId}.${guessMime(localUri).split('/')[1]}`,
    type: guessMime(localUri),
  });
  form.append('photoId',     photoId);
  form.append('placeId',     placeId);
  form.append('submittedBy', submittedBy);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(UPLOAD_ENDPOINT, {
      method:  'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body:    form,
      signal:  controller.signal,
    });
    if (!response.ok) {
      throw new UploadError(`Upload failed with status ${response.status}`, { status: response.status });
    }
    const data = await response.json();
    if (!data?.url) throw new UploadError('Upload response did not include a url');
    return { url: data.url };
  } catch (err) {
    if (err instanceof UploadError) throw err;
    if (err.name === 'AbortError') throw new UploadError('Upload timed out', { cause: err });
    throw new UploadError('Upload failed', { cause: err });
  } finally {
    clearTimeout(timeoutId);
  }
}
