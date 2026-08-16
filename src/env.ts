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
  // GitHub repo clone/view traffic tracking (see github-traffic.ts) — GitHub's
  // own traffic API only retains 14 days, so this app polls it daily and
  // keeps the permanent history itself.
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  NOTIFY_FROM_EMAIL: string;
}

export interface CfAccountConfig {
  label: "dev" | "qa";
  accountId: string;
  token: string;
}

export function cfAccounts(env: Env): CfAccountConfig[] {
  return [
    { label: "dev", accountId: env.CF_ACCOUNT_ID, token: env.CF_API_TOKEN },
    { label: "qa", accountId: env.CF_ACCOUNT_ID_QA, token: env.CF_API_TOKEN_QA },
  ];
}
