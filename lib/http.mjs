export class CheckError extends Error { constructor(code) { super(code); this.code = code; } }
const counters = new Map();
export function requestStats() { return Object.fromEntries(counters); }
export function assert(condition, code) { if (!condition) throw new CheckError(code); }
// Reject unexpected destinations before sending bearer tokens or downloading signed media.
export function safeUrl(value, allowedOrigins) {
  const url = new URL(value);
  assert(url.protocol === 'https:' && allowedOrigins.includes(url.origin) && !url.username && !url.password, 'unexpected_destination');
  return url;
}
export async function request(url, { timeoutMs = 20000, maxBytes = 1024 * 1024, expected = [200], ...options } = {}) {
  let response;
  try { response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new CheckError('network_or_timeout'); }
  if (!expected.includes(response.status)) { await response.body?.cancel(); throw new CheckError(`http_${response.status}`); }
  const reader = response.body?.getReader(); const chunks = []; let length = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > maxBytes) throw new CheckError('response_too_large');
      chunks.push(value);
    }
  } catch (error) { await reader?.cancel().catch(()=>{}); throw error instanceof CheckError ? error : new CheckError('body_read_failed'); }
  const bytes = Buffer.concat(chunks);
  const host = new URL(url).hostname;
  const count = counters.get(host) || { requests: 0, bytes: 0 };
  count.requests++; count.bytes += bytes.length; counters.set(host,count);
  return { status: response.status, headers: response.headers, bytes, text: () => bytes.toString('utf8'), json: () => { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new CheckError('invalid_json'); } } };
}
export async function jsonRequest(url, options = {}) {
  const response = await request(url, options);
  assert((response.headers.get('content-type') || '').includes('application/json'), 'wrong_content_type');
  return response.json();
}
