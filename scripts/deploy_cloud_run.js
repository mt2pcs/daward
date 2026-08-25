// Cloud Run deploy via Google REST APIs, authorized by the service account
// key the user placed in env GCP_SA_KEY for exactly this purpose.
// The access token is held in memory only; never written to disk or logged.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REGION = 'asia-northeast1';
const SERVICE = 'e-mooments';
const AR_REPO = 'cloud-run-source-deploy';
const TARBALL = path.join(__dirname, 'source.tar.gz');

// GCP_SA_KEY accepts either the raw service-account JSON or its base64 encoding.
function parseKey(raw) {
  if (!raw) throw new Error('GCP_SA_KEY is not set');
  for (const candidate of [raw, (() => { try { return Buffer.from(raw.trim(), 'base64').toString('utf8'); } catch { return ''; } })()]) {
    try {
      const j = JSON.parse(candidate);
      if (j.client_email && j.private_key && j.project_id) return j;
    } catch { /* try next form */ }
  }
  throw new Error('GCP_SA_KEY must contain the FULL service-account JSON (project_id, client_email, private_key), either raw or base64-encoded — a bare private key is not enough');
}
const key = parseKey(process.env.GCP_SA_KEY);
const PROJECT = key.project_id;

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const claims = b64url({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${sig}`,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`token fetch failed: status=${res.status} ${data.error || ''} ${data.error_description || ''}`);
  return data.access_token;
}

let TOKEN;
async function api(method, url, body, opts = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) };
  let payload;
  if (body !== undefined) {
    if (opts.raw) { payload = body; }
    else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  }
  const res = await fetch(url, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, json };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function enableApi(name) {
  console.log(`Enabling API ${name}...`);
  const r = await api('POST', `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${name}:enable`, {});
  console.log(`  enable ${name}: status=${r.status}`);
  await sleep(10000);
}

async function withApiEnable(name, fn) {
  let r = await fn();
  const msg = JSON.stringify(r.json);
  if (r.status === 403 && msg.includes('SERVICE_DISABLED')) {
    await enableApi(name);
    r = await fn();
  }
  return r;
}

async function main() {
  console.log(`project=${PROJECT} sa=${key.client_email}`);
  TOKEN = await getToken();
  console.log('token acquired');

  // 1. connectivity + permission check
  const proj = await api('GET', `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`);
  console.log(`project check: status=${proj.status} name=${proj.json.name || ''} state=${proj.json.lifecycleState || ''}`);
  if (proj.status !== 200) throw new Error(`project check failed: ${JSON.stringify(proj.json).slice(0, 500)}`);

  // 2. bucket ensure + upload
  const bucket = `${PROJECT}_cloudbuild`;
  let b = await withApiEnable('storage.googleapis.com', () =>
    api('GET', `https://storage.googleapis.com/storage/v1/b/${bucket}`));
  if (b.status === 404) {
    b = await api('POST', `https://storage.googleapis.com/storage/v1/b?project=${PROJECT}`, { name: bucket, location: 'US' });
    console.log(`bucket create: status=${b.status}`);
    if (b.status >= 300) throw new Error(`bucket create failed: ${JSON.stringify(b.json).slice(0, 500)}`);
  } else if (b.status >= 300) {
    throw new Error(`bucket check failed: status=${b.status} ${JSON.stringify(b.json).slice(0, 500)}`);
  }
  const objName = `source/e-mooments-${Date.now()}.tar.gz`;
  const data = fs.readFileSync(TARBALL);
  const up = await api('POST',
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objName)}`,
    data, { raw: true, headers: { 'Content-Type': 'application/gzip' } });
  console.log(`upload: status=${up.status} object=${objName}`);
  if (up.status >= 300) throw new Error(`upload failed: ${JSON.stringify(up.json).slice(0, 500)}`);

  // 3. Artifact Registry repo ensure
  const image = `${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/${SERVICE}`;
  let ar = await withApiEnable('artifactregistry.googleapis.com', () =>
    api('GET', `https://artifactregistry.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/repositories/${AR_REPO}`));
  if (ar.status === 404) {
    ar = await api('POST',
      `https://artifactregistry.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/repositories?repositoryId=${AR_REPO}`,
      { format: 'DOCKER' });
    console.log(`AR repo create: status=${ar.status}`);
    if (ar.status >= 300) throw new Error(`AR repo create failed: ${JSON.stringify(ar.json).slice(0, 500)}`);
    await sleep(5000);
  } else if (ar.status >= 300) {
    throw new Error(`AR repo check failed: status=${ar.status} ${JSON.stringify(ar.json).slice(0, 500)}`);
  }

  // 4. Cloud Build
  const buildReq = {
    source: { storageSource: { bucket, object: objName } },
    steps: [{ name: 'gcr.io/cloud-builders/docker', args: ['build', '-t', image, '.'] }],
    images: [image],
    timeout: '1200s',
  };
  let build = await withApiEnable('cloudbuild.googleapis.com', () =>
    api('POST', `https://cloudbuild.googleapis.com/v1/projects/${PROJECT}/builds`, buildReq));
  console.log(`build create: status=${build.status}`);
  if (build.status >= 300) throw new Error(`build create failed: ${JSON.stringify(build.json).slice(0, 800)}`);
  const buildId = build.json.metadata && build.json.metadata.build && build.json.metadata.build.id;
  console.log(`build id=${buildId}`);
  let buildStatus = 'QUEUED';
  for (let i = 0; i < 40; i++) {
    await sleep(20000);
    const st = await api('GET', `https://cloudbuild.googleapis.com/v1/projects/${PROJECT}/builds/${buildId}`);
    buildStatus = st.json.status;
    console.log(`build poll ${i}: ${buildStatus}`);
    if (['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'].includes(buildStatus)) break;
  }
  if (buildStatus !== 'SUCCESS') throw new Error(`build ended with status=${buildStatus} (log: https://console.cloud.google.com/cloud-build/builds/${buildId}?project=${PROJECT})`);

  // 5. Cloud Run service create-or-update
  const runBase = `https://run.googleapis.com/v2/projects/${PROJECT}/locations/${REGION}/services`;
  const svcBody = {
    template: {
      containers: [{ image, ports: [{ containerPort: 8080 }], resources: { limits: { memory: '512Mi', cpu: '1' } } }],
    },
  };
  let existing = await withApiEnable('run.googleapis.com', () => api('GET', `${runBase}/${SERVICE}`));
  let op;
  if (existing.status === 404) {
    op = await api('POST', `${runBase}?serviceId=${SERVICE}`, svcBody);
    console.log(`service create: status=${op.status}`);
  } else if (existing.status === 200) {
    op = await api('PATCH', `${runBase}/${SERVICE}`, svcBody);
    console.log(`service update: status=${op.status}`);
  } else {
    throw new Error(`service check failed: status=${existing.status} ${JSON.stringify(existing.json).slice(0, 500)}`);
  }
  if (op.status >= 300) throw new Error(`service deploy failed: ${JSON.stringify(op.json).slice(0, 800)}`);
  const opName = op.json.name; // operation
  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    const st = await api('GET', `https://run.googleapis.com/v2/${opName}`);
    if (st.json.done) {
      if (st.json.error) throw new Error(`run operation error: ${JSON.stringify(st.json.error).slice(0, 800)}`);
      break;
    }
    console.log(`run op poll ${i}: running`);
  }

  // 6. allow unauthenticated
  const iam = await api('POST', `${runBase}/${SERVICE}:setIamPolicy`, {
    policy: { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] },
  });
  console.log(`setIamPolicy: status=${iam.status}`);
  if (iam.status >= 300) console.log(`  warning: ${JSON.stringify(iam.json).slice(0, 500)}`);

  // 7. URL + health check
  const svc = await api('GET', `${runBase}/${SERVICE}`);
  const url = svc.json.uri;
  console.log(`SERVICE_URL=${url}`);
  const health = await fetch(url).then(r => r.status).catch(e => `ERR ${e.message}`);
  console.log(`HTTP_STATUS=${health}`);
}

main().catch(e => { console.error('DEPLOY_FAILED: ' + e.message); process.exit(1); });
