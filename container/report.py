"""Renders CLI scan results as a self-contained, dark-mode HTML report —
same badge taxonomy, colors, and panel styling as the hosted Worker's
readiness-detail page, so the CLI's output reads like a sibling of the
product instead of a different tool. No JS, no external assets: one file,
openable straight from disk."""
import html
from datetime import datetime, timezone

OUTCOME_META = {
    "pq":            {"cls": "good",     "icon": "✓", "label": "PQ",           "desc": "TLS 1.3, negotiated the post-quantum hybrid group"},
    "classical":     {"cls": "warning",  "icon": "●", "label": "Classical",    "desc": "TLS 1.3, but a non-PQ group (not quantum-resistant)"},
    "downgrade":     {"cls": "critical", "icon": "▼", "label": "Downgrade",    "desc": "Only TLS 1.2 negotiated"},
    "intolerant":    {"cls": "critical", "icon": "✕", "label": "Intolerant",   "desc": "Broke on the PQ ClientHello, worked once PQ was dropped"},
    "indeterminate": {"cls": "unknown",  "icon": "?",      "label": "Indeterminate", "desc": "Reachable, but no clean handshake result"},
    "unreachable":   {"cls": "critical", "icon": "✕", "label": "Not Live",     "desc": "TCP connect did not succeed"},
}


def _esc(value):
    return html.escape(str(value)) if value is not None else ""


def _badge(outcome):
    meta = OUTCOME_META.get(outcome, {"cls": "unknown", "icon": "?", "label": outcome or "unknown"})
    return f'<span class="badge {meta["cls"]}">{meta["icon"]} {_esc(meta["label"])}</span>'


def _leg_badge(leg):
    label = "Edge (hostname)" if leg == "edge" else "Origin (direct)"
    return f'<span class="badge leg">{_esc(label)}</span>'


def _card(finding, leg):
    outcome = finding.get("outcome")
    target = finding.get("ip", "")
    rows = []
    if finding.get("protocol"):
        rows.append(f'<p class="kv"><b>Protocol:</b> {_esc(finding["protocol"])}</p>')
    if finding.get("negotiated_group"):
        rows.append(f'<p class="kv"><b>Group:</b> {_esc(finding["negotiated_group"])}</p>')
    if finding.get("cipher"):
        rows.append(f'<p class="kv"><b>Cipher:</b> {_esc(finding["cipher"])}</p>')
    if finding.get("hostnames"):
        rows.append(f'<p class="kv"><b>Certificate names:</b> {_esc(finding["hostnames"])}</p>')

    command_html = ""
    if finding.get("command"):
        command_html = f'<h4>OpenSSL command</h4><pre class="code-box">{_esc(finding["command"])}</pre>'

    raw_html = ""
    if finding.get("raw"):
        raw_html = f'<h4>Raw response</h4><pre class="code-box raw-box">{_esc(finding["raw"])}</pre>'

    return (
        '<div class="card">'
        '<div class="card-head">'
        f'<span class="target">{_esc(target)}</span>'
        f'<span class="badges">{_leg_badge(leg)}{_badge(outcome)}</span>'
        '</div>'
        f'{"".join(rows)}'
        f'{command_html}{raw_html}'
        '</div>'
    )


def render_html_report(requested_entries, findings, hostnames):
    total = len(findings)
    pq_count = sum(1 for f in findings if f.get("outcome") == "pq")
    not_pq_count = total - pq_count
    pct = round(pq_count / total * 100) if total else 0
    edge_count = sum(1 for f in findings if f.get("ip") in hostnames)
    origin_count = total - edge_count
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    chips = "".join(f'<span class="chip">{_esc(e)}</span>' for e in requested_entries)

    cards = "".join(
        _card(f, "edge" if f.get("ip") in hostnames else "origin")
        for f in findings
    )

    target_word = "target" if total == 1 else "targets"

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar &mdash; Scan Report</title>
<style>
  :root {{
    color-scheme: dark;
    --bg: #0d0d0d;
    --surface-1: #1a1a19;
    --surface-2: #0d0d0d;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --gridline: #2c2c2a;
    --border: rgba(255,255,255,0.10);
    --status-good: #0ca30c;
    --status-warning: #fab219;
    --status-critical: #e66767;
    --status-unknown: #898781;
    --mono: ui-monospace, "SF Mono", Consolas, monospace;
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; background: var(--bg); color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }}
  .page {{ max-width: 980px; margin: 0 auto; padding: 40px 24px 64px; }}
  h1 {{ font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }}
  .subtitle {{ color: var(--text-secondary); font-size: 14px; margin: 0 0 20px; }}

  .chips {{ display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 28px; }}
  .chip {{ background: var(--surface-1); border: 1px solid var(--border); border-radius: 999px;
    padding: 4px 12px; font-size: 12px; color: var(--text-secondary); font-family: var(--mono); }}

  .summary {{ display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }}
  .stat-tile {{ background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
    padding: 18px 20px; min-width: 180px; flex: 1; }}
  .stat-tile-label {{ font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;
    text-transform: uppercase; letter-spacing: 0.04em; }}
  .stat-tile-total {{ font-size: 34px; font-weight: 700; color: var(--text-primary); line-height: 1;
    margin-bottom: 10px; letter-spacing: -0.02em; }}
  .stat-tile-row {{ display: flex; gap: 8px; flex-wrap: wrap; }}
  .stat-chip {{ display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px;
    border-radius: 999px; font-size: 12px; font-weight: 600; }}
  .stat-chip.good {{ background: rgba(12,163,12,0.16); color: #3fd63f; }}
  .stat-chip.critical {{ background: rgba(230,103,103,0.16); color: #ff9a9a; }}
  .stat-chip.neutral {{ background: var(--surface-2); border: 1px solid var(--border); color: var(--text-secondary); }}
  .stat-chip .dot {{ width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }}

  .badge {{ display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
    font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; }}
  .badge.good {{ background: var(--status-good); }}
  .badge.warning {{ background: var(--status-warning); color: #3a2a00; }}
  .badge.critical {{ background: var(--status-critical); }}
  .badge.unknown {{ background: var(--status-unknown); }}
  .badge.leg {{ background: var(--surface-2); border: 1px solid var(--border); color: var(--text-secondary); }}

  .card {{ background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
    padding: 18px 20px; margin-bottom: 16px; }}
  .card-head {{ display: flex; align-items: center; justify-content: space-between; gap: 12px;
    flex-wrap: wrap; margin-bottom: 12px; }}
  .card-head .target {{ font-size: 16px; font-weight: 700; font-family: var(--mono); word-break: break-all; }}
  .card-head .badges {{ display: flex; gap: 8px; align-items: center; }}
  .kv {{ font-size: 13px; color: var(--text-secondary); margin: 0 0 4px; }}
  .kv b {{ color: var(--text-muted); font-weight: 600; }}
  .card h4 {{ margin: 14px 0 6px; font-size: 12px; font-weight: 600; color: var(--text-primary);
    text-transform: uppercase; letter-spacing: 0.04em; }}
  pre.code-box {{ margin: 0; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; font-family: var(--mono); font-size: 12px; line-height: 1.5; color: var(--text-secondary);
    white-space: pre-wrap; word-break: break-all; }}
  pre.raw-box {{ max-height: 260px; overflow-y: auto; }}

  footer {{ margin-top: 40px; color: var(--text-muted); font-size: 12px; }}
</style>
</head>
<body>
<div class="page">
  <h1>PQ Radar &mdash; Scan Report</h1>
  <p class="subtitle">Requested {total} {target_word} &middot; {timestamp}</p>

  <div class="chips">{chips}</div>

  <div class="summary">
    <div class="stat-tile">
      <div class="stat-tile-label">Compliance</div>
      <div class="stat-tile-total">{pct}%</div>
      <div class="stat-tile-row">
        <span class="stat-chip good"><span class="dot"></span>{pq_count} PQ</span>
        <span class="stat-chip critical"><span class="dot"></span>{not_pq_count} not PQ</span>
      </div>
    </div>
    <div class="stat-tile">
      <div class="stat-tile-label">Total scanned</div>
      <div class="stat-tile-total">{total}</div>
      <div class="stat-tile-row">
        <span class="stat-chip neutral"><span class="dot"></span>{edge_count} edge (hostname)</span>
        <span class="stat-chip neutral"><span class="dot"></span>{origin_count} origin (direct)</span>
      </div>
    </div>
  </div>

  {cards}

  <footer>Generated by the PQ Radar standalone CLI (container/scan.py) &mdash; same handshake classifier as the hosted tool.</footer>
</div>
</body>
</html>
"""
