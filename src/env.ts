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
