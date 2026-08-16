export interface ScanConfigRow {
  port: number;
  liveness_timeout_ms: number;
  handshake_timeout_ms: number;
  concurrency: number;
}

export interface SubnetRow {
  id: number;
  cidr: string;
  sni_hint: string | null;
  label: string | null;
}

export interface RunMeta {
  subnetId: number | null;
  cidr: string | null;
  label: string | null;
}

export interface Finding {
  ip: string;
  protocol: string | null;
  negotiated_group: string | null;
  cipher: string | null;
  outcome: string;
  command: string | null;
  hostnames: string | null;
  raw: string;
}

export interface StreamEvent {
  stage: "liveness" | "probe" | "done" | "error";
  ip?: string;
  live?: boolean;
  protocol?: string | null;
  negotiated_group?: string | null;
  cipher?: string | null;
  outcome?: string;
  command?: string | null;
  hostnames?: string | null;
  raw?: string;
  total_ips?: number;
  live_count?: number;
  findings_count?: number;
  detail?: string;
}

export interface ScanAccumulator {
  findings: Finding[];
  totalIps: number;
  liveCount: number;
}

export function newAccumulator(): ScanAccumulator {
  return { findings: [], totalIps: 0, liveCount: 0 };
}

/** Builds the POST request sent to the probe container for a set of subnets, plus any
 *  extra literal IPs (e.g. DNS-record origin IPs that fall outside the configured CIDRs —
 *  scanned as single addresses, no CIDR expansion). `port`/`starttls` optionally override
 *  scanConfig.port for non-443 TLS-based protocols (e.g. FTPS) that reuse this same
 *  container /scan endpoint — starttls "ftp" enables explicit FTPS (AUTH TLS) on port 21;
 *  omit it for implicit FTPS on port 990, which behaves just like plain HTTPS. */
export function buildScanRequest(
  subnets: SubnetRow[],
  scanConfig: ScanConfigRow,
  extraIps: string[] = [],
  overridePort?: number,
  starttls?: string,
  extraHostnames: string[] = []
): Request {
  return new Request("http://localhost/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subnets: [
        ...subnets.map((s) => ({ cidr: s.cidr, sni_hint: s.sni_hint })),
        ...extraIps.map((ip) => ({ ip, sni_hint: null })),
        ...extraHostnames.map((hostname) => ({ hostname, sni_hint: hostname })),
      ],
      port: overridePort ?? scanConfig.port,
      liveness_timeout_ms: scanConfig.liveness_timeout_ms,
      handshake_timeout_ms: scanConfig.handshake_timeout_ms,
      concurrency: scanConfig.concurrency,
      ...(starttls ? { starttls } : {}),
    }),
  });
}

/** Builds the POST request for the container's dedicated SSH capability-read endpoint —
 *  a separate scan type entirely, not TLS-based, so it doesn't reuse buildScanRequest. */
export function buildSshScanRequest(
  subnets: SubnetRow[],
  extraIps: string[],
  port: number,
  timeoutMs: number,
  concurrency: number
): Request {
  return new Request("http://localhost/scan-ssh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subnets: [
        ...subnets.map((s) => ({ cidr: s.cidr, sni_hint: s.sni_hint })),
        ...extraIps.map((ip) => ({ ip, sni_hint: null })),
      ],
      port,
      liveness_timeout_ms: timeoutMs,
      concurrency,
    }),
  });
}

/**
 * Parses one NDJSON line from the container's stream, folding "probe"/"done"
 * events into the accumulator. Returns the parsed event (or null if the line
 * wasn't valid JSON) so callers can also react to it (e.g. live-format it).
 */
export function parseScanLine(line: string, acc: ScanAccumulator): StreamEvent | null {
  let ev: StreamEvent;
  try {
    ev = JSON.parse(line);
  } catch {
    return null;
  }

  if (ev.stage === "probe") {
    acc.findings.push({
      ip: ev.ip!,
      protocol: ev.protocol ?? null,
      negotiated_group: ev.negotiated_group ?? null,
      cipher: ev.cipher ?? null,
      outcome: ev.outcome!,
      command: ev.command ?? null,
      hostnames: ev.hostnames ?? null,
      raw: ev.raw ?? "",
    });
  }

  if (ev.stage === "done") {
    acc.totalIps = ev.total_ips ?? 0;
    acc.liveCount = ev.live_count ?? 0;
  }

  return ev;
}

/** Drains a container scan response body, accumulating findings. No live callback — used by cron. */
export async function drainScanStream(body: ReadableStream<Uint8Array>): Promise<ScanAccumulator> {
  const acc = newAccumulator();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim()) parseScanLine(line, acc);
    }
  }

  return acc;
}

export type Leg = "direct_to_origin" | "client_to_edge" | "edge_to_origin" | "ssh" | "ftps_implicit" | "ftps_explicit";

export interface RunSummary {
  run_id: string;
  ts: string;
  leg: Leg;
  subnet_id: number | null;
  status: "success" | "failed";
  error_detail: string | null;
}

export interface LatestLegRuns {
  /** The most recent run matching subnet_id IS NULL — non-subnet-scoped targets' sole
   *  source, and for direct_to_origin, also the sole source for extra-IP origins (ones
   *  outside every configured subnet), since cron never scans those. Null if none yet. */
  global: RunSummary | null;
  /** subnet_id -> that subnet's own most recent matching run (not yet resolved against
   *  global — use resolveForSubnet for the actual answer). Only ever populated for
   *  direct_to_origin, since it's the only leg cron can trigger per-subnet; every other
   *  leg's runs are always subnet_id IS NULL. */
  bySubnetOwn: Map<number, RunSummary>;
  /** De-duplicated run_ids of every run referenced above, for a single `WHERE run_id IN (...)` fetch. */
  allRunIds: string[];
}

/**
 * Resolves "latest" per leg from a list of runs already sorted newest-first — used for two
 * different questions against the exact same logic: pass only successful runs to find which
 * run's *data* should be shown, or pass every run regardless of status to find the latest
 * *attempt* for the run-health surface (a failed latest attempt must never change what data
 * is shown, but must still be visible that it happened — see resolveForSubnet).
 */
export function resolveLatestLegRuns(runsDesc: RunSummary[], leg: Leg): LatestLegRuns {
  let global: RunSummary | null = null;
  const bySubnetOwn = new Map<number, RunSummary>();

  for (const r of runsDesc) {
    if (r.leg !== leg) continue;
    if (r.subnet_id === null) {
      if (!global) global = r;
    } else if (!bySubnetOwn.has(r.subnet_id)) {
      bySubnetOwn.set(r.subnet_id, r);
    }
  }

  const ids = new Set<string>();
  if (global) ids.add(global.run_id);
  for (const r of bySubnetOwn.values()) ids.add(r.run_id);

  return { global, bySubnetOwn, allRunIds: Array.from(ids) };
}

/**
 * Which run answers for one subnet: its own most recent matching run, or the most recent
 * "all subnets" run if that's more recent — an all-subnets run covers every subnet too, so
 * a subnet with no dedicated cron schedule (and therefore no entry in bySubnetOwn at all)
 * still correctly falls back to whatever the last manual full run covered it with, instead
 * of resolving to "nothing" just because it has no run of its own.
 */
export function resolveForSubnet(resolved: LatestLegRuns, subnetId: number): RunSummary | null {
  const own = resolved.bySubnetOwn.get(subnetId) ?? null;
  if (!own) return resolved.global;
  if (!resolved.global) return own;
  return own.ts > resolved.global.ts ? own : resolved.global;
}

/** Writes a scan's findings + its run summary row to D1. Shared by manual, cron, and edge-scan paths. */
export async function writeScanResults(
  db: D1Database,
  runId: string,
  ts: string,
  runMeta: RunMeta,
  acc: ScanAccumulator,
  triggerType: "manual" | "cron",
  status: "success" | "failed",
  errorDetail: string | null,
  leg: Leg = "direct_to_origin"
): Promise<void> {
  if (acc.findings.length > 0) {
    const inserts = acc.findings.map((f) =>
      db
        .prepare(
          "INSERT INTO results (run_id, ts, ip, leg, protocol, negotiated_group, cipher, outcome, command, hostnames, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(runId, ts, f.ip, leg, f.protocol, f.negotiated_group, f.cipher, f.outcome, f.command, f.hostnames, f.raw)
    );
    await db.batch(inserts);
  }

  await db
    .prepare(
      "INSERT INTO runs (run_id, ts, subnet_id, cidr, label, total_ips, live_count, findings_count, trigger_type, status, error_detail, leg) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      runId,
      ts,
      runMeta.subnetId,
      runMeta.cidr,
      runMeta.label,
      acc.totalIps,
      acc.liveCount,
      acc.findings.length,
      triggerType,
      status,
      errorDetail,
      leg
    )
    .run();
}
