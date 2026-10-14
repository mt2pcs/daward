// GCP サービスアカウント（env GCP_SA_KEY）からアクセストークンを得る共通モジュール。deploy_cloud_run.js と同じロジック。
// トークンはメモリのみ。ログ・ディスクに出さない。
const crypto = require('crypto');
function parseKey(raw) {
  if (!raw) throw new Error('GCP_SA_KEY is not set');
  const trimmed = raw.trim();
  const candidates = [trimmed, `{${trimmed}}`, (() => { try { return Buffer.from(trimmed, 'base64').toString('utf8'); } catch { return ''; } })()];
  for (const c of candidates) { try { const j = JSON.parse(c); if (j.client_email && j.private_key && j.project_id) return j; } catch { /* next */ } }
  throw new Error('GCP_SA_KEY must contain the FULL service-account JSON');
}
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
let cached = null;
async function getToken() {
  if (cached && cached.exp > Date.now() / 1000 + 120) return cached.token;
  const key = parseKey(process.env.GCP_SA_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const claims = b64url({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claims}`);
  const sig = signer.sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` }).toString() });
  const data = await res.json();
  if (!data.access_token) throw new Error(`token fetch failed: status=${res.status} ${data.error || ''}`);
  cached = { token: data.access_token, exp: now + 3600 };
  return data.access_token;
}
function projectId() { return parseKey(process.env.GCP_SA_KEY).project_id; }
module.exports = { getToken, projectId };
