import { getContainer } from "@cloudflare/containers";
import { Env } from "./env";
import {
  ScanConfigRow,
  SubnetRow,
  RunMeta,
  buildScanRequest,
  drainScanStream,
  writeScanResults,
  newAccumulator,
} from "./scan";
import { pollGithubTraffic } from "./github-traffic";

// GitHub's traffic data is daily-granular anyway, so there's nothing gained
// from polling every hour \\u2014 piggybacks on the existing hourly heartbeat,
// gated to fire once during this specific UTC hour.
const GITHUB_TRAFFIC_POLL_HOUR_UTC = 6;

/** Runs (and records) one subnet's scheduled scan. Sets/clears cron_run_started_at
 *  around the work so the dashboard/schedule page can show a live "running now" badge —
 *  this field is only ever touched here, never by the manual /trigger path. */
async function runSubnetScan(env: Env, subnet: SubnetRow, scanConfig: ScanConfigRow): Promise<void> {
  const runId = crypto.randomUUID();
  const ts = new Date().toISOString();
  const runMeta: RunMeta = { subnetId: subnet.id, cidr: subnet.cidr, label: subnet.label };

  await env.DB.prepare("UPDATE subnets SET cron_run_started_at = ? WHERE id = ?").bind(ts, subnet.id).run();

  try {
    const container = getContainer(env.PROBE_CONTAINER);
    const scanRequest = buildScanRequest([subnet], scanConfig);
    const scanResponse = await container.fetch(scanRequest);

    if (!scanResponse.ok || !scanResponse.body) {
      const errorText = await scanResponse.text();
      await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "cron", "failed", errorText);
      console.error(`cron: scan failed for subnet ${subnet.id} (${subnet.cidr}): ${errorText}`);
      return;
    }

    const acc = await drainScanStream(scanResponse.body);
    await writeScanResults(env.DB, runId, ts, runMeta, acc, "cron", "success", null);
  } catch (err) {
    await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "cron", "failed", String(err));
    console.error(`cron: unhandled error scanning subnet ${subnet.id} (${subnet.cidr}):`, err);
  } finally {
    await env.DB.prepare("UPDATE subnets SET cron_run_started_at = NULL WHERE id = ?").bind(subnet.id).run();
  }
}

/** Hourly heartbeat: finds subnets whose configured schedule_hour_utc matches the
 *  current UTC hour and kicks off a scan for each. A subnet only runs if BOTH
 *  enabled=1 (eligible at all) AND schedule_enabled=1 (opted into automatic scans) —
 *  every subnet defaults to schedule_enabled=0, so nothing scans on its own unless
 *  explicitly turned on via the /schedule page. */
export async function handleScheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
  const currentHourUtc = new Date(controller.scheduledTime).getUTCHours();

  const scanConfig = await env.DB.prepare(
    "SELECT port, liveness_timeout_ms, handshake_timeout_ms, concurrency FROM scan_config WHERE id = 1"
  ).first<ScanConfigRow>();
  if (!scanConfig) {
    console.error("cron: no scan_config row, skipping heartbeat");
    return;
  }

  const dueSubnets = await env.DB.prepare(
    `SELECT id, cidr, sni_hint, label FROM subnets
     WHERE enabled = 1 AND schedule_enabled = 1 AND schedule_hour_utc = ? AND cron_run_started_at IS NULL`
  )
    .bind(currentHourUtc)
    .all<SubnetRow>();

  console.log(`cron: heartbeat fired for hour ${currentHourUtc} UTC, ${dueSubnets.results.length} subnet(s) due`);

  for (const subnet of dueSubnets.results) {
    ctx.waitUntil(runSubnetScan(env, subnet, scanConfig));
  }

  if (currentHourUtc === GITHUB_TRAFFIC_POLL_HOUR_UTC) {
    ctx.waitUntil(
      pollGithubTraffic(env).catch((err) => console.error("cron: github traffic poll failed:", err))
    );
  }
}
