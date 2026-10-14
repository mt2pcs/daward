// GCP のアクセストークン（Vertex AI 用）。Cloud Run 上ではメタデータサーバー（サービスのSA）、ローカル/検証では env GCP_SA_KEY（SA JSON）。
// トークンはメモリにのみ保持。
import { createSign } from "crypto";

let cached: { token: string; exp: number } | null = null;

function parseKey(raw: string | undefined): { client_email: string; private_key: string; project_id: string } | null {
  if (!raw) return null;
  const t = raw.trim();
  for (const c of [t, `{${t}}`, (() => { try { return Buffer.from(t, "base64").toString("utf8"); } catch { return ""; } })()]) {
    try { const j = JSON.parse(c); if (j.client_email && j.private_key && j.project_id) return j; } catch { /* next */ }
  }
  return null;
}

export function gcpProjectId(): string | null {
  return process.env.GCP_PROJECT || parseKey(process.env.GCP_SA_KEY)?.project_id || null;
}

export function gcpAvailable(): boolean {
  return !!(parseKey(process.env.GCP_SA_KEY) || process.env.K_SERVICE); // K_SERVICE = Cloud Run 上
}

export async function gcpToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 120) return cached.token;
  const key = parseKey(process.env.GCP_SA_KEY);
  if (key) {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const header = b64({ alg: "RS256", typ: "JWT" });
    const claims = b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
    const s = createSign("RSA-SHA256"); s.update(`${header}.${claims}`);
    const sig = s.sign(key.private_key).toString("base64url");
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${sig}` }).toString() });
    const j = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new Error(`gcp token failed ${r.status}`);
    cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  }
  // Cloud Run: メタデータサーバー
  const r = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } });
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error(`metadata token failed ${r.status}`);
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}
