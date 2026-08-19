import { Container } from "@cloudflare/containers";

export class ProbeContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "2m";
}

export interface Env {
  DB: D1Database;
  PROBE_CONTAINER: DurableObjectNamespace<ProbeContainer>;
  TRIGGER_SECRET: string;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN_QA: string;
  CF_ACCOUNT_ID_QA: string;
  // Optional: a JSON array of {label, accountId} pairs, e.g.
  // [{"label":"prod","accountId":"..."},{"label":"corp-dev","accountId":"..."}].
  // Each entry's token is a separate secret, named CF_API_TOKEN_<LABEL>
  // (label uppercased, non-alphanumeric chars replaced with "_") — see
  // secretForLabel() below. Supersedes CF_API_TOKEN/CF_ACCOUNT_ID (+ _QA)
  // when set; those two remain the fallback for existing deployments that
  // haven't set CF_ACCOUNTS. See README.md.
  CF_ACCOUNTS?: string;
}

export interface CfAccountConfig {
  label: string;
  accountId: string;
  token: string;
}

// The env var/secret system only has statically-named string bindings, so a
// dynamic account list still needs a predictable way to find each one's
// token — this is that naming rule, applied consistently in both directions
// (README's setup instructions and this lookup must never drift apart).
function secretKeyForLabel(label: string): string {
  return "CF_API_TOKEN_" + label.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function secretForLabel(env: Env, label: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[secretKeyForLabel(label)];
}

export function cfAccounts(env: Env): CfAccountConfig[] {
  if (env.CF_ACCOUNTS) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.CF_ACCOUNTS);
    } catch (err) {
      throw new Error(`CF_ACCOUNTS is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("CF_ACCOUNTS must be a JSON array");
    }
    return parsed.map((entry, i) => {
      if (!entry || typeof entry.label !== "string" || !entry.label || typeof entry.accountId !== "string" || !entry.accountId) {
        throw new Error(`CF_ACCOUNTS[${i}] must have a non-empty "label" and "accountId"`);
      }
      const token = secretForLabel(env, entry.label);
      if (!token) {
        throw new Error(
          `CF_ACCOUNTS entry "${entry.label}" has no matching secret — run: wrangler secret put ${secretKeyForLabel(entry.label)}`
        );
      }
      return { label: entry.label, accountId: entry.accountId, token };
    });
  }

  // Legacy fallback — unchanged for any deployment that hasn't set
  // CF_ACCOUNTS, so nothing existing breaks on upgrade.
  return [
    { label: "dev", accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN },
    { label: "qa", accountId: env.CF_ACCOUNT_ID_QA, token: env.CF_API_TOKEN_QA },
  ];
}
