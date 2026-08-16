import { getContainer } from "@cloudflare/containers";
import { DASHBOARD_HTML } from "./dashboard";
import { SCHEDULE_PAGE_HTML } from "./schedule-page";
import { READINESS_PAGE_HTML } from "./readiness-page";
import { READINESS_DETAIL_PAGE_HTML } from "./readiness-detail-page";
import { READINESS_SERVICES_PAGE_HTML } from "./readiness-services-page";
import { Env, ProbeContainer, cfAccounts } from "./env";
import { handleScheduled } from "./cron";
import { listZones, listDnsRecords } from "./cloudflare";
import {
  ScanConfigRow,
  SubnetRow,
  RunMeta,
  StreamEvent,
  Leg,
  RunSummary,
  LatestLegRuns,
  buildScanRequest,
  buildSshScanRequest,
  parseScanLine,
  newAccumulator,
  writeScanResults,
  resolveLatestLegRuns,
  resolveForSubnet,
} from "./scan";

export { ProbeContainer };

function formatEvent(ev: StreamEvent, port: number): string {
  if (ev.stage === "liveness") {
    return ev.live ? `${ev.ip}:${port} -> live, probing...` : `${ev.ip}:${port} -> not live`;
  }
  if (ev.stage === "probe") {
    const detail = [ev.protocol, ev.negotiated_group, ev.cipher].filter(Boolean).join(", ");
    return `${ev.ip}:${port} -> ${ev.outcome}${detail ? ` (${detail})` : ""}`;
  }
  if (ev.stage === "done") {
    return `--- scan complete: ${ev.total_ips} total, ${ev.live_count} live, ${ev.findings_count} findings ---`;
  }
  if (ev.stage === "error") {
    return `--- container error: ${ev.detail} ---`;
  }
  return JSON.stringify(ev);
}

/** Streams a container scan's NDJSON lines into human-readable text for the HTTP client, while also
 *  accumulating findings and writing them to D1 once the stream ends. HTTP-streaming-specific glue only —
 *  the actual parsing/accumulation/D1-write logic lives in scan.ts, shared with the cron path. */
class NdjsonToText {
  private buffer = "";
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private acc = newAccumulator();

  constructor(
    private port: number,
    private db: D1Database,
    private runId: string,
    private ts: string,
    private runMeta: RunMeta,
    private leg: Leg = "direct_to_origin"
  ) {}

  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.trim()) continue;

      const ev = parseScanLine(line, this.acc);
      if (!ev) continue;

      controller.enqueue(this.encoder.encode(formatEvent(ev, this.port) + "\n"));
    }
  }

  async flush(controller: TransformStreamDefaultController<Uint8Array>) {
    await writeScanResults(this.db, this.runId, this.ts, this.runMeta, this.acc, "manual", "success", null, this.leg);

    controller.enqueue(
      this.encoder.encode(`--- run_id: ${this.runId}, findings written to D1: ${this.acc.findings.length} ---\n`)
    );
  }
}

function checkAuth(request: Request, env: Env): Response | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.TRIGGER_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

/** "Live" means a genuine, conclusive protocol result — pq/classical/downgrade/intolerant.
 *  Explicitly excludes both "unreachable" (confirmed dead) and "indeterminate" (reachable at
 *  TCP level, but no usable protocol answer) — indeterminate is not a live finding, it's an
 *  inconclusive one, and counting it as "live" overstates what was actually learned. */
function isLiveOutcome(outcome: string): boolean {
  return outcome === "pq" || outcome === "classical" || outcome === "downgrade" || outcome === "intolerant";
}

/** Plain IPv4-in-CIDR containment check — SQLite has no native CIDR matching. */
function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const ipInt = ipToInt(ip);
  const baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

interface LatestResultRow {
  ip: string;
  run_id: string;
  ts: string;
  outcome: string;
  protocol: string | null;
  negotiated_group: string | null;
  cipher: string | null;
  hostnames: string | null;
}

interface EnabledSubnet {
  id: number;
  cidr: string;
  label: string | null;
}

/** Fetches every run row that has a leg (i.e. every run written after migration 0007, plus
 *  any older run successfully backfilled) once, newest first. Small table — fetching in
 *  full and resolving "latest" in JS is simpler and cheaper than a separate aggregate SQL
 *  query per leg. */
async function fetchAllRuns(env: Env): Promise<RunSummary[]> {
  const rows = await env.DB.prepare(
    "SELECT run_id, ts, leg, subnet_id, status, error_detail FROM runs WHERE leg IS NOT NULL ORDER BY ts DESC"
  ).all<RunSummary>();
  return rows.results;
}

/** Latest results for a full-population leg (client_to_edge, ssh, ftps_implicit,
 *  ftps_explicit) — a single chosen run_id answers every target, no subnet resolution
 *  needed since these legs are never triggered per-subnet. */
async function fetchLatestSimpleLeg(env: Env, leg: Leg, resolved: LatestLegRuns): Promise<Map<string, LatestResultRow>> {
  const map = new Map<string, LatestResultRow>();
  if (!resolved.global) return map;
  const rows = await env.DB.prepare(
    "SELECT ip, run_id, ts, outcome, protocol, negotiated_group, cipher, hostnames FROM results WHERE leg = ? AND run_id = ?"
  )
    .bind(leg, resolved.global.run_id)
    .all<LatestResultRow>();
  for (const r of rows.results) map.set(r.ip, r);
  return map;
}

/** Latest direct_to_origin results, resolved per target IP: an IP inside a configured
 *  (enabled) subnet's CIDR uses that subnet's chosen run (its own latest success, or the
 *  latest all-subnets success if that's newer); anything else — an extra-IP origin outside
 *  every configured CIDR — uses the all-subnets run only, since cron's per-subnet scans
 *  never touch those. */
async function fetchLatestOrigin(
  env: Env,
  resolved: LatestLegRuns,
  enabledSubnets: EnabledSubnet[]
): Promise<Map<string, LatestResultRow>> {
  const map = new Map<string, LatestResultRow>();
  if (resolved.allRunIds.length === 0) return map;

  const placeholders = resolved.allRunIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT ip, run_id, ts, outcome, protocol, negotiated_group, cipher, hostnames FROM results WHERE leg = 'direct_to_origin' AND run_id IN (${placeholders})`
  )
    .bind(...resolved.allRunIds)
    .all<LatestResultRow>();

  for (const r of rows.results) {
    const owner = enabledSubnets.find((s) => ipInCidr(r.ip, s.cidr));
    const chosenRunId = owner ? resolveForSubnet(resolved, owner.id)?.run_id : resolved.global?.run_id;
    if (r.run_id === chosenRunId) map.set(r.ip, r);
  }
  return map;
}

interface LegHealthEntry {
  latest_attempt_ts: string | null;
  latest_attempt_status: "success" | "failed" | null;
  latest_attempt_error: string | null;
  latest_success_ts: string | null;
}

function healthEntry(attempt: RunSummary | null, successRun: RunSummary | null): LegHealthEntry {
  return {
    latest_attempt_ts: attempt?.ts ?? null,
    latest_attempt_status: attempt?.status ?? null,
    latest_attempt_error: attempt?.error_detail ?? null,
    latest_success_ts: successRun?.ts ?? null,
  };
}

/** Run-health summary for one leg: when the last attempt happened (any status) and whether
 *  it succeeded, kept separate from which run's *data* is actually being shown — a failed
 *  latest attempt never changes what's displayed, but it must never be silently invisible
 *  either. For direct_to_origin, also breaks this down per enabled subnet, since cron only
 *  ever refreshes one subnet at a time — a subnet with no dedicated schedule falls back to
 *  the latest all-subnets attempt/success (via resolveForSubnet) rather than reading as
 *  "never scanned" just because it has no run of its own. */
function buildLegHealth(
  allRuns: RunSummary[],
  resolvedSuccess: LatestLegRuns,
  leg: Leg,
  subnets: EnabledSubnet[]
) {
  const resolvedAttempts = resolveLatestLegRuns(allRuns, leg);

  const global = healthEntry(resolvedAttempts.global, resolvedSuccess.global);

  if (subnets.length === 0) {
    return { ...global };
  }

  const perSubnet = subnets.map((s) => {
    const attempt = resolveForSubnet(resolvedAttempts, s.id);
    const successRun = resolveForSubnet(resolvedSuccess, s.id);
    return {
      label: s.label,
      cidr: s.cidr,
      ...healthEntry(attempt, successRun),
    };
  });

  return { ...global, subnets: perSubnet };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DASHBOARD_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/schedule" && request.method === "GET") {
      return new Response(SCHEDULE_PAGE_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/readiness" && request.method === "GET") {
      return new Response(READINESS_PAGE_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/readiness/detail" && request.method === "GET") {
      return new Response(READINESS_DETAIL_PAGE_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/readiness/services" && request.method === "GET") {
      return new Response(READINESS_SERVICES_PAGE_HTML, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (url.pathname === "/debug/config") {
      const scanConfig = await env.DB.prepare("SELECT * FROM scan_config WHERE id = 1").first();
      const subnets = await env.DB.prepare("SELECT cidr, sni_hint, label, enabled FROM subnets WHERE enabled = 1").all();
      return Response.json({ scan_config: scanConfig, subnets: subnets.results });
    }

    if (url.pathname === "/debug/container-health") {
      const container = getContainer(env.PROBE_CONTAINER);
      return await container.fetch(new Request("http://localhost/health"));
    }

    if (url.pathname === "/trigger" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const scanConfig = await env.DB.prepare(
        "SELECT port, liveness_timeout_ms, handshake_timeout_ms, concurrency FROM scan_config WHERE id = 1"
      ).first<ScanConfigRow>();
      if (!scanConfig) {
        return Response.json({ error: "no scan_config row" }, { status: 400 });
      }

      const subnetIdParam = url.searchParams.get("subnet_id");
      let subnets: SubnetRow[];
      let runMeta: RunMeta;

      if (subnetIdParam !== null) {
        const subnetId = Number(subnetIdParam);
        const subnet = await env.DB.prepare(
          "SELECT id, cidr, sni_hint, label FROM subnets WHERE id = ? AND enabled = 1"
        )
          .bind(subnetId)
          .first<SubnetRow>();
        if (!subnet) {
          return Response.json({ error: "subnet not found or not enabled" }, { status: 404 });
        }
        subnets = [subnet];
        runMeta = { subnetId: subnet.id, cidr: subnet.cidr, label: subnet.label };
      } else {
        const subnetsResult = await env.DB.prepare(
          "SELECT id, cidr, sni_hint, label FROM subnets WHERE enabled = 1"
        ).all<SubnetRow>();
        subnets = subnetsResult.results;
        if (subnets.length === 0) {
          return Response.json({ error: "no enabled subnets" }, { status: 400 });
        }
        runMeta = { subnetId: null, cidr: null, label: null };
      }

      // Scanning "all enabled subnets" also covers every known DNS-record origin IP, even
      // ones outside the configured CIDRs — otherwise those origins can never get a
      // direct_to_origin result no matter how many times the scan reruns. CNAME records'
      // origin_content is a target hostname, not an IP — connect to it directly by name
      // (with matching SNI) rather than resolving it, same as the client_to_edge leg already
      // does. Deliberately does NOT bypass Cloudflare if the target is itself proxied; that's
      // an accepted tradeoff for not needing DNS resolution machinery of our own.
      let extraIps: string[] = [];
      let extraHostnames: string[] = [];
      if (subnetIdParam === null) {
        const originIps = await env.DB.prepare(
          "SELECT DISTINCT origin_content, record_type FROM dns_records WHERE origin_content IS NOT NULL"
        ).all<{ origin_content: string; record_type: string }>();
        extraIps = originIps.results.filter((r) => r.record_type !== "CNAME").map((r) => r.origin_content);
        extraHostnames = originIps.results.filter((r) => r.record_type === "CNAME").map((r) => r.origin_content);
      }

      const container = getContainer(env.PROBE_CONTAINER);
      const scanRequest = buildScanRequest(subnets, scanConfig, extraIps, undefined, undefined, extraHostnames);
      const scanResponse = await container.fetch(scanRequest);

      const runId = crypto.randomUUID();
      const ts = new Date().toISOString();

      if (!scanResponse.ok || !scanResponse.body) {
        const errorText = await scanResponse.text();
        await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "manual", "failed", errorText);
        return Response.json({ error: "container scan failed", detail: errorText, run_id: runId }, { status: 502 });
      }

      const transformer = new NdjsonToText(scanConfig.port, env.DB, runId, ts, runMeta);
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => transformer.transform(chunk, controller),
        flush: (controller) => transformer.flush(controller),
      });

      ctx.waitUntil(scanResponse.body.pipeTo(writable));

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/subnets" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const subnets = await env.DB.prepare(
        "SELECT id, cidr, sni_hint, label, enabled, schedule_enabled, schedule_hour_utc, cron_run_started_at FROM subnets ORDER BY id"
      ).all();
      return Response.json({ subnets: subnets.results });
    }

    if (url.pathname === "/api/runs" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const subnetIdParam = url.searchParams.get("subnet_id");
      const runs = subnetIdParam
        ? await env.DB.prepare(
            "SELECT run_id, ts, subnet_id, cidr, label, total_ips, live_count, findings_count, trigger_type, status, error_detail FROM runs WHERE subnet_id = ? ORDER BY ts DESC"
          )
            .bind(Number(subnetIdParam))
            .all()
        : await env.DB.prepare(
            "SELECT run_id, ts, subnet_id, cidr, label, total_ips, live_count, findings_count, trigger_type, status, error_detail FROM runs ORDER BY ts DESC"
          ).all();

      return Response.json({ runs: runs.results });
    }

    if (url.pathname === "/api/results" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const runId = url.searchParams.get("run_id");
      if (runId) {
        const results = await env.DB.prepare(
          `SELECT run_id, ts, ip, leg, protocol, negotiated_group, cipher, outcome, hostnames
           FROM results WHERE run_id = ? ORDER BY ip`
        )
          .bind(runId)
          .all();
        return Response.json({ results: results.results });
      }

      // No run_id: "latest across everything" — resolved independently per leg (there's no
      // single run spanning multiple legs, each leg is always its own separate run), then
      // merged into one flat list.
      const allRuns = await fetchAllRuns(env);
      const successfulRuns = allRuns.filter((r) => r.status === "success");
      const enabledSubnets = await env.DB.prepare("SELECT id, cidr, label FROM subnets WHERE enabled = 1 ORDER BY id").all<EnabledSubnet>();

      const legs: Leg[] = ["direct_to_origin", "client_to_edge", "ssh", "ftps_implicit", "ftps_explicit"];
      const merged: Array<{
        run_id: string; ts: string; ip: string; leg: Leg;
        protocol: string | null; negotiated_group: string | null; cipher: string | null;
        outcome: string; hostnames: string | null;
      }> = [];

      for (const leg of legs) {
        const resolved = resolveLatestLegRuns(successfulRuns, leg);
        const map =
          leg === "direct_to_origin"
            ? await fetchLatestOrigin(env, resolved, enabledSubnets.results)
            : await fetchLatestSimpleLeg(env, leg, resolved);
        for (const row of map.values()) {
          merged.push({
            run_id: row.run_id, ts: row.ts, ip: row.ip, leg,
            protocol: row.protocol, negotiated_group: row.negotiated_group, cipher: row.cipher,
            outcome: row.outcome, hostnames: row.hostnames,
          });
        }
      }

      merged.sort((a, b) => (a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0));
      return Response.json({ results: merged });
    }

    if (url.pathname === "/api/results/detail" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const runId = url.searchParams.get("run_id");
      const ip = url.searchParams.get("ip");
      if (!runId || !ip) {
        return Response.json({ error: "run_id and ip are required" }, { status: 400 });
      }

      const row = await env.DB.prepare(
        "SELECT run_id, ts, ip, leg, protocol, negotiated_group, cipher, outcome, command, raw FROM results WHERE run_id = ? AND ip = ?"
      )
        .bind(runId, ip)
        .first();

      if (!row) {
        return Response.json({ error: "not found" }, { status: 404 });
      }
      return Response.json({ result: row });
    }

    if (url.pathname === "/api/subnets/schedule" && request.method === "PATCH") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const body = await request.json<{ id?: number; schedule_enabled?: boolean; schedule_hour_utc?: number | null }>();
      if (typeof body.id !== "number") {
        return Response.json({ error: "id is required" }, { status: 400 });
      }
      if (body.schedule_enabled && (body.schedule_hour_utc === null || body.schedule_hour_utc === undefined)) {
        return Response.json({ error: "schedule_hour_utc is required when enabling a schedule" }, { status: 400 });
      }

      await env.DB.prepare("UPDATE subnets SET schedule_enabled = ?, schedule_hour_utc = ? WHERE id = ?")
        .bind(body.schedule_enabled ? 1 : 0, body.schedule_hour_utc ?? null, body.id)
        .run();

      return Response.json({ ok: true });
    }

    // Read-only against Cloudflare: only ever issues GET requests to the Cloudflare API
    // (see cloudflare.ts). Writes only ever land in our own D1 tables, never back to Cloudflare.
    // Loops every configured account (dev, qa, ...) in one call — see env.ts's cfAccounts().
    if (url.pathname === "/api/zones/pull" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const now = new Date().toISOString();
      let zoneCount = 0;
      let recordCount = 0;

      for (const account of cfAccounts(env)) {
        const zones = await listZones(account.token, account.accountId);
        zoneCount += zones.length;

        for (const zone of zones) {
          await env.DB.prepare(
            `INSERT INTO zones (zone_id, zone_name, account_label, last_synced_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(zone_id) DO UPDATE SET zone_name = excluded.zone_name, account_label = excluded.account_label, last_synced_at = excluded.last_synced_at`
          )
            .bind(zone.id, zone.name, account.label, now)
            .run();

          const records = await listDnsRecords(account.token, account.accountId, zone.id);
          await env.DB.prepare("DELETE FROM dns_records WHERE zone_id = ?").bind(zone.id).run();

          if (records.length > 0) {
            // For A/AAAA, content is already the origin IP. For CNAME, content is the target
            // hostname — stored as-is in origin_content too, and scanned by hostname (with
            // matching SNI) rather than resolved to an IP; see the /trigger handler.
            const inserts = records.map((r) =>
              env.DB.prepare(
                "INSERT INTO dns_records (zone_id, hostname, record_type, origin_content, proxied, last_synced_at) VALUES (?, ?, ?, ?, ?, ?)"
              ).bind(zone.id, r.name, r.type, r.content, r.proxied ? 1 : 0, now)
            );
            await env.DB.batch(inserts);
            recordCount += records.length;
          }
        }
      }

      return Response.json({ zones_synced: zoneCount, dns_records_synced: recordCount });
    }

    // Streams live progress the same way /trigger does — see NdjsonToText above.
    if (url.pathname === "/api/zones/scan-edges" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const scanConfig = await env.DB.prepare(
        "SELECT port, liveness_timeout_ms, handshake_timeout_ms, concurrency FROM scan_config WHERE id = 1"
      ).first<ScanConfigRow>();
      if (!scanConfig) {
        return Response.json({ error: "no scan_config row" }, { status: 400 });
      }

      const dnsRecords = await env.DB.prepare("SELECT DISTINCT hostname FROM dns_records").all<{ hostname: string }>();
      if (dnsRecords.results.length === 0) {
        return Response.json({ error: "no dns records found — run /api/zones/pull first" }, { status: 400 });
      }

      const targets = dnsRecords.results.map((r) => ({ hostname: r.hostname, sni_hint: r.hostname }));
      const container = getContainer(env.PROBE_CONTAINER);
      const scanRequest = new Request("http://localhost/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subnets: targets,
          port: scanConfig.port,
          liveness_timeout_ms: scanConfig.liveness_timeout_ms,
          handshake_timeout_ms: scanConfig.handshake_timeout_ms,
          concurrency: scanConfig.concurrency,
        }),
      });

      const scanResponse = await container.fetch(scanRequest);
      const runId = crypto.randomUUID();
      const ts = new Date().toISOString();
      const runMeta: RunMeta = { subnetId: null, cidr: null, label: "zone edge scan" };

      if (!scanResponse.ok || !scanResponse.body) {
        const errorText = await scanResponse.text();
        await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "manual", "failed", errorText, "client_to_edge");
        return Response.json({ error: "container scan failed", detail: errorText, run_id: runId }, { status: 502 });
      }

      const transformer = new NdjsonToText(scanConfig.port, env.DB, runId, ts, runMeta, "client_to_edge");
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => transformer.transform(chunk, controller),
        flush: (controller) => transformer.flush(controller),
      });

      ctx.waitUntil(scanResponse.body.pipeTo(writable));

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // --- SSH / FTPS: a separate, self-contained scan surface. Uses the same origin-IP
    // target list as the direct_to_origin leg (enabled subnets + every known DNS-record
    // origin IP) but writes to its own leg values ("ssh"/"ftps_implicit"/"ftps_explicit"),
    // never touching the direct_to_origin/client_to_edge data the hosts table relies on.
    if (url.pathname === "/api/zones/scan-ssh" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const scanConfig = await env.DB.prepare(
        "SELECT liveness_timeout_ms, concurrency FROM scan_config WHERE id = 1"
      ).first<{ liveness_timeout_ms: number; concurrency: number }>();
      if (!scanConfig) {
        return Response.json({ error: "no scan_config row" }, { status: 400 });
      }

      const subnetsResult = await env.DB.prepare("SELECT id, cidr, sni_hint, label FROM subnets WHERE enabled = 1").all<SubnetRow>();
      const originIps = await env.DB.prepare("SELECT DISTINCT origin_content FROM dns_records WHERE origin_content IS NOT NULL").all<{ origin_content: string }>();
      const extraIps = originIps.results.map((r) => r.origin_content);
      if (subnetsResult.results.length === 0 && extraIps.length === 0) {
        return Response.json({ error: "no enabled subnets or known origin IPs" }, { status: 400 });
      }

      const SSH_PORT = 22;
      // SSH's capability read is a few sequential round-trips (banner, then KEXINIT) — accuracy
      // over speed, so floor the timeout higher than the TLS-tuned scan_config default.
      const sshTimeoutMs = Math.max(scanConfig.liveness_timeout_ms, 3000);

      const container = getContainer(env.PROBE_CONTAINER);
      const scanRequest = buildSshScanRequest(subnetsResult.results, extraIps, SSH_PORT, sshTimeoutMs, scanConfig.concurrency);
      const scanResponse = await container.fetch(scanRequest);

      const runId = crypto.randomUUID();
      const ts = new Date().toISOString();
      const runMeta: RunMeta = { subnetId: null, cidr: null, label: "ssh capability scan" };

      if (!scanResponse.ok || !scanResponse.body) {
        const errorText = await scanResponse.text();
        await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "manual", "failed", errorText, "ssh");
        return Response.json({ error: "container scan failed", detail: errorText, run_id: runId }, { status: 502 });
      }

      const transformer = new NdjsonToText(SSH_PORT, env.DB, runId, ts, runMeta, "ssh");
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => transformer.transform(chunk, controller),
        flush: (controller) => transformer.flush(controller),
      });

      ctx.waitUntil(scanResponse.body.pipeTo(writable));

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // ?mode=implicit (default, port 990, TLS starts immediately like HTTPS) or
    // ?mode=explicit (port 21, plain FTP then AUTH TLS via openssl's -starttls ftp).
    // Reuses the exact same proven TLS/PQ-group probing logic as the origin/edge legs.
    if (url.pathname === "/api/zones/scan-ftps" && request.method === "POST") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const scanConfig = await env.DB.prepare(
        "SELECT port, liveness_timeout_ms, handshake_timeout_ms, concurrency FROM scan_config WHERE id = 1"
      ).first<ScanConfigRow>();
      if (!scanConfig) {
        return Response.json({ error: "no scan_config row" }, { status: 400 });
      }

      const mode = url.searchParams.get("mode") === "explicit" ? "explicit" : "implicit";
      const port = mode === "explicit" ? 21 : 990;
      const leg: Leg = mode === "explicit" ? "ftps_explicit" : "ftps_implicit";

      const subnetsResult = await env.DB.prepare("SELECT id, cidr, sni_hint, label FROM subnets WHERE enabled = 1").all<SubnetRow>();
      const originIps = await env.DB.prepare(
        "SELECT DISTINCT origin_content, record_type FROM dns_records WHERE origin_content IS NOT NULL"
      ).all<{ origin_content: string; record_type: string }>();
      const extraIps = originIps.results.filter((r) => r.record_type !== "CNAME").map((r) => r.origin_content);
      const extraHostnames = originIps.results.filter((r) => r.record_type === "CNAME").map((r) => r.origin_content);
      if (subnetsResult.results.length === 0 && extraIps.length === 0 && extraHostnames.length === 0) {
        return Response.json({ error: "no enabled subnets or known origin IPs" }, { status: 400 });
      }

      const container = getContainer(env.PROBE_CONTAINER);
      const scanRequest = buildScanRequest(
        subnetsResult.results, scanConfig, extraIps, port, mode === "explicit" ? "ftp" : undefined, extraHostnames
      );
      const scanResponse = await container.fetch(scanRequest);

      const runId = crypto.randomUUID();
      const ts = new Date().toISOString();
      const runMeta: RunMeta = { subnetId: null, cidr: null, label: `ftps (${mode}) scan` };

      if (!scanResponse.ok || !scanResponse.body) {
        const errorText = await scanResponse.text();
        await writeScanResults(env.DB, runId, ts, runMeta, newAccumulator(), "manual", "failed", errorText, leg);
        return Response.json({ error: "container scan failed", detail: errorText, run_id: runId }, { status: 502 });
      }

      const transformer = new NdjsonToText(port, env.DB, runId, ts, runMeta, leg);
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => transformer.transform(chunk, controller),
        flush: (controller) => transformer.flush(controller),
      });

      ctx.waitUntil(scanResponse.body.pipeTo(writable));

      return new Response(readable, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/api/readiness" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const allRuns = await fetchAllRuns(env);
      const successfulRuns = allRuns.filter((r) => r.status === "success");
      const enabledSubnets = await env.DB.prepare("SELECT id, cidr, label FROM subnets WHERE enabled = 1 ORDER BY id").all<EnabledSubnet>();

      const resolvedEdge = resolveLatestLegRuns(successfulRuns, "client_to_edge");
      const resolvedOrigin = resolveLatestLegRuns(successfulRuns, "direct_to_origin");
      const edgeMap = await fetchLatestSimpleLeg(env, "client_to_edge", resolvedEdge);
      const originMap = await fetchLatestOrigin(env, resolvedOrigin, enabledSubnets.results);

      const dnsRows = await env.DB.prepare(
        `SELECT d.hostname, d.origin_content AS origin_ip, z.zone_name, z.account_label
         FROM dns_records d LEFT JOIN zones z ON z.zone_id = d.zone_id
         ORDER BY d.hostname`
      ).all<{ hostname: string; origin_ip: string | null; zone_name: string | null; account_label: string | null }>();

      const hosts = dnsRows.results.map((d) => {
        const edge = edgeMap.get(d.hostname);
        const origin = d.origin_ip ? originMap.get(d.origin_ip) : undefined;
        return {
          hostname: d.hostname,
          zone_name: d.zone_name,
          account_label: d.account_label,
          origin_ip: d.origin_ip,
          edge_outcome: edge?.outcome ?? null,
          edge_protocol: edge?.protocol ?? null,
          edge_group: edge?.negotiated_group ?? null,
          edge_run_id: edge?.run_id ?? null,
          origin_outcome: origin?.outcome ?? null,
          origin_protocol: origin?.protocol ?? null,
          origin_group: origin?.negotiated_group ?? null,
          origin_run_id: origin?.run_id ?? null,
        };
      });

      // Live origins we scanned directly that no DNS record (from any account) points at —
      // real infrastructure with no known Cloudflare zone covering it. Excludes both
      // "unreachable" (dead) and "indeterminate" (inconclusive) — neither is a confirmed
      // live, uncovered origin.
      const knownOriginIps = new Set(dnsRows.results.map((d) => d.origin_ip));
      const originEntries = Array.from(originMap.values());
      const liveOrigins = originEntries.filter((r) => isLiveOutcome(r.outcome));
      const orphans = liveOrigins
        .filter((r) => !knownOriginIps.has(r.ip))
        .sort((a, b) => (a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0))
        .map((r) => ({ ip: r.ip, outcome: r.outcome, protocol: r.protocol, negotiated_group: r.negotiated_group }));

      // Per-subnet tile stats: how many addresses in each enabled CIDR have a
      // direct_to_origin result, and how many of those are confirmed live. "dead" stays
      // strictly "unreachable" (not "everything non-live") — an indeterminate result is
      // neither, so live + dead can be less than total; that gap is real and intentional.
      const originSubnets = enabledSubnets.results.map((s) => {
        const matched = originEntries.filter((r) => ipInCidr(r.ip, s.cidr));
        const live = matched.filter((r) => isLiveOutcome(r.outcome)).length;
        const dead = matched.filter((r) => r.outcome === "unreachable").length;
        return { cidr: s.cidr, label: s.label, total: matched.length, live, dead };
      });

      // Flat per-IP origin results, each annotated with any hostname(s) that point at it —
      // the whole picture for a subnet (unlike `hosts`, which is hostname-keyed and misses
      // every address with no DNS record at all). Powers the readiness page's per-subnet
      // drill-down; the frontend filters this list by CIDR client-side.
      const originIpToHostnames = new Map<string, string[]>();
      for (const d of dnsRows.results) {
        const list = originIpToHostnames.get(d.origin_ip) ?? [];
        list.push(d.hostname);
        originIpToHostnames.set(d.origin_ip, list);
      }
      const originResults = originEntries
        .map((r) => ({
          ip: r.ip,
          hostnames: originIpToHostnames.get(r.ip)?.join(", ") ?? null,
          outcome: r.outcome,
          protocol: r.protocol,
          negotiated_group: r.negotiated_group,
        }))
        .sort((a, b) => (a.ip < b.ip ? -1 : a.ip > b.ip ? 1 : 0));

      return Response.json({
        hosts,
        orphans,
        origin_results: originResults,
        coverage: {
          total_live_origins: liveOrigins.length,
          covered: liveOrigins.length - orphans.length,
          uncovered: orphans.length,
        },
        origin_subnets: originSubnets,
        run_health: {
          client_to_edge: buildLegHealth(allRuns, resolvedEdge, "client_to_edge", []),
          direct_to_origin: buildLegHealth(allRuns, resolvedOrigin, "direct_to_origin", enabledSubnets.results),
        },
      });
    }

    // SSH/FTPS results, keyed by origin IP (not hostname — these aren't Cloudflare-fronted,
    // so they're a property of the origin server, not any particular DNS record). Entirely
    // separate query/response from /api/readiness above — removing this endpoint and its
    // UI section has no effect on the hosts table, tiles, or coverage data.
    if (url.pathname === "/api/readiness/services" && request.method === "GET") {
      const authError = checkAuth(request, env);
      if (authError) return authError;

      const allRuns = await fetchAllRuns(env);
      const successfulRuns = allRuns.filter((r) => r.status === "success");
      const enabledSubnets = await env.DB.prepare("SELECT id, cidr, label FROM subnets WHERE enabled = 1 ORDER BY id").all<EnabledSubnet>();

      const resolvedSsh = resolveLatestLegRuns(successfulRuns, "ssh");
      const resolvedFtpsImplicit = resolveLatestLegRuns(successfulRuns, "ftps_implicit");
      const resolvedFtpsExplicit = resolveLatestLegRuns(successfulRuns, "ftps_explicit");
      const sshMap = await fetchLatestSimpleLeg(env, "ssh", resolvedSsh);
      const ftpsImplicitMap = await fetchLatestSimpleLeg(env, "ftps_implicit", resolvedFtpsImplicit);
      const ftpsExplicitMap = await fetchLatestSimpleLeg(env, "ftps_explicit", resolvedFtpsExplicit);

      const originIps = new Set<string>();
      const dnsOriginIps = await env.DB.prepare("SELECT DISTINCT origin_content FROM dns_records WHERE origin_content IS NOT NULL").all<{ origin_content: string }>();
      for (const r of dnsOriginIps.results) originIps.add(r.origin_content);
      for (const ip of sshMap.keys()) originIps.add(ip);
      for (const ip of ftpsImplicitMap.keys()) originIps.add(ip);
      for (const ip of ftpsExplicitMap.keys()) originIps.add(ip);

      const origins = Array.from(originIps)
        .sort()
        .map((ip) => {
          const ssh = sshMap.get(ip);
          const fi = ftpsImplicitMap.get(ip);
          const fe = ftpsExplicitMap.get(ip);
          return {
            ip,
            ssh_outcome: ssh?.outcome ?? null,
            ssh_banner: ssh?.protocol ?? null,
            ssh_kex: ssh?.negotiated_group ?? null,
            ssh_run_id: ssh?.run_id ?? null,
            ftps_implicit_outcome: fi?.outcome ?? null,
            ftps_implicit_protocol: fi?.protocol ?? null,
            ftps_implicit_group: fi?.negotiated_group ?? null,
            ftps_implicit_run_id: fi?.run_id ?? null,
            ftps_explicit_outcome: fe?.outcome ?? null,
            ftps_explicit_protocol: fe?.protocol ?? null,
            ftps_explicit_group: fe?.negotiated_group ?? null,
            ftps_explicit_run_id: fe?.run_id ?? null,
          };
        });

      // Per-subnet tile stats for the SSH/FTPS section, mirroring origin_subnets above.
      const serviceSubnets = enabledSubnets.results.map((s) => {
        const sshIn = Array.from(sshMap.values()).filter((r) => ipInCidr(r.ip, s.cidr));
        const fiIn = Array.from(ftpsImplicitMap.values()).filter((r) => ipInCidr(r.ip, s.cidr));
        const feIn = Array.from(ftpsExplicitMap.values()).filter((r) => ipInCidr(r.ip, s.cidr));
        const total = new Set([...sshIn, ...fiIn, ...feIn].map((r) => r.ip)).size;
        const sshLive = new Set(sshIn.filter((r) => isLiveOutcome(r.outcome)).map((r) => r.ip)).size;
        const ftpsLive = new Set(
          [...fiIn, ...feIn].filter((r) => isLiveOutcome(r.outcome)).map((r) => r.ip)
        ).size;
        return { cidr: s.cidr, label: s.label, total, ssh_live: sshLive, ftps_live: ftpsLive };
      });

      return Response.json({
        origins,
        subnets: serviceSubnets,
        run_health: {
          ssh: buildLegHealth(allRuns, resolvedSsh, "ssh", []),
          ftps_implicit: buildLegHealth(allRuns, resolvedFtpsImplicit, "ftps_implicit", []),
          ftps_explicit: buildLegHealth(allRuns, resolvedFtpsExplicit, "ftps_explicit", []),
        },
      });
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env, ctx);
  },
};
