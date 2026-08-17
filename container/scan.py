#!/usr/bin/env python3
"""Standalone CLI: scans hostnames/CIDRs for post-quantum TLS readiness using
the same handshake classifier as the hosted PQ Radar Worker (probe.py) — no
Cloudflare account or cloud dependency required. v1 is TLS/HTTPS on port 443
only; SSH scanning isn't wired in here yet."""
import argparse
import asyncio
import ipaddress
import json
import re
import sys

from probe import run_scan_streaming
from report import render_html_report

PORT = 443
LIVENESS_TIMEOUT_MS = 1500
HANDSHAKE_TIMEOUT_MS = 4000
CONCURRENCY = 20

_HOSTNAME_RE = re.compile(
    r"^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$"
)


def classify_entry(entry):
    """Returns (subnet_dict, leg) for one target string — tries it as an IP
    network first (this also covers a bare IP, which ip_network treats as a
    /32), falling back to hostname validation. Raises ValueError if it's
    neither."""
    try:
        network = ipaddress.ip_network(entry, strict=False)
        return {"cidr": str(network)}, "origin"
    except ValueError:
        pass
    if not _HOSTNAME_RE.match(entry):
        raise ValueError(f"not a valid CIDR/IP or hostname: {entry}")
    return {"hostname": entry}, "edge"


def read_targets_file(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        sys.exit(f"file not found: {path}")
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def build_targets(args):
    if args.targets and args.file:
        sys.exit("error: pass targets as positional arguments OR --file, not both")

    entries = read_targets_file(args.file) if args.file else args.targets
    if not entries:
        sys.exit("error: no targets given — pass at least one target or a non-empty --file")

    subnets = []
    hostnames = set()
    for entry in entries:
        try:
            subnet, leg = classify_entry(entry)
        except ValueError as exc:
            sys.exit(f"error: {exc}")
        subnets.append(subnet)
        if leg == "edge":
            hostnames.add(entry)
    return subnets, hostnames, entries


def report_progress(event):
    if event.get("stage") == "probe":
        print(f"  {event['ip']}: {event['outcome']}", file=sys.stderr)
    elif event.get("stage") == "done":
        print(f"scanned {event['total_ips']} target(s), {event['live_count']} live", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(
        prog="pqradar",
        description="Scan hosts for post-quantum TLS readiness (ML-KEM support) over TLS/HTTPS.",
    )
    parser.add_argument("targets", nargs="*", metavar="TARGET", help="hostnames and/or CIDR ranges to scan")
    parser.add_argument("--file", metavar="PATH", help="read targets from a file, one per line (# comments ignored)")
    parser.add_argument(
        "--out", metavar="PATH",
        help="write the report here instead of stdout — .html for a dark-mode HTML report, "
             "anything else (or omitted) for JSON",
    )
    args = parser.parse_args()

    subnets, hostnames, entries = build_targets(args)

    findings = asyncio.run(run_scan_streaming(
        subnets, PORT, LIVENESS_TIMEOUT_MS, HANDSHAKE_TIMEOUT_MS, CONCURRENCY, report_progress,
    ))

    for finding in findings:
        # A hostname target resolves through DNS like any browser would, so a
        # CDN-fronted host is scanned at its edge, not its origin — a bare IP
        # or CIDR entry connects directly, so that leg is the origin itself.
        finding["leg"] = "edge" if finding["ip"] in hostnames else "origin"

    if args.out and args.out.lower().endswith(".html"):
        output = render_html_report(entries, findings, hostnames)
    else:
        output = json.dumps({"total": len(findings), "findings": findings}, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
