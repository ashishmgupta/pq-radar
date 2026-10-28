import { Env } from "./env";

// Cloudflare Access support, opt-in: set ACCESS_TEAM_DOMAIN and ACCESS_AUD (both
// plain vars, not secrets) and the Worker trusts a valid Access JWT instead of
// TRIGGER_SECRET. Leave them unset and nothing here is active. The JWT is
// verified (signature, issuer, audience, expiry) rather than just checked for
// presence, so the Worker stays safe even if its workers.dev URL is reachable
// without going through Access.

interface Jwk { kid: string; kty: string; alg?: string; n: string; e: string }

const JWKS_TTL_MS = 60 * 60 * 1000;
let jwksCache: { teamDomain: string; fetchedAt: number; keys: Jwk[] } | null = null;

export function accessEnabled(env: Env): boolean {
  return !!(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
}

function teamHost(env: Env): string {
  return (env.ACCESS_TEAM_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function getKeys(host: string, forceRefresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCache.teamDomain === host && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${host}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { teamDomain: host, fetchedAt: now, keys: body.keys ?? [] };
  return jwksCache.keys;
}

/** True only if the request carries a valid, unexpired Access JWT for this app's AUD. */
export async function verifyAccessJwt(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
    if (header.alg !== "RS256" || !header.kid) return false;

    const host = teamHost(env);
    if (payload.iss !== `https://${host}`) return false;
    const aud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD as string)) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < nowSec) return false;
    if (typeof payload.nbf === "number" && payload.nbf > nowSec + 60) return false;

    // Cached keys first; one forced refresh covers Access rotating its signing keys.
    let jwk = (await getKeys(host, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await getKeys(host, true)).find((k) => k.kid === header.kid);
    if (!jwk) return false;

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return false;
  }
}

/** Tells the page's script to skip the secret prompt — the browser's Access cookie
 *  authenticates its API calls. The server still verifies every call. */
export function withAuthMeta(html: string, env: Env): string {
  if (!accessEnabled(env)) return html;
  return html.replace("</head>", '<meta name="pq-auth" content="access"></head>');
}
