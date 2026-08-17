"""Renders CLI scan results as a self-contained, dark-mode HTML report —
same badge taxonomy, colors, and panel styling as the hosted Worker's
readiness-detail page, so the CLI's output reads like a sibling of the
product instead of a different tool. One file, openable straight from disk.

Built to stay usable at list-scan scale (hundreds to thousands of targets):
each result is a collapsed <details> element (native, no JS needed for the
collapse itself — keeps the page light until something is actually opened),
and a small inline <script> drives client-side hostname filtering only."""
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

    # data-target carries a lowercased copy for the search filter — cheaper
    # than re-lowercasing target text on every keystroke across thousands
    # of entries.
    return (
        f'<details class="card" data-target="{_esc(target.lower())}">'
        '<summary class="card-head">'
        '<span class="card-title">'
        '<span class="caret" aria-hidden="true">&#9656;</span>'
        f'<span class="target">{_esc(target)}</span>'
        '</span>'
        f'<span class="badges">{_leg_badge(leg)}{_badge(outcome)}</span>'
        '</summary>'
        '<div class="card-body">'
        f'{"".join(rows)}'
        f'{command_html}{raw_html}'
        '</div>'
        '</details>'
    )


def render_html_report(findings, hostnames):
    total = len(findings)
    unreachable_count = sum(1 for f in findings if f.get("outcome") == "unreachable")
    live_count = total - unreachable_count
    pq_count = sum(1 for f in findings if f.get("outcome") == "pq")
    non_pq_count = live_count - pq_count
    live_pct = round(pq_count / live_count * 100) if live_count else 0
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

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

  /* Exact brand colors from pqradar.net's #brand / .brand-mark (public/styles.css
     in the pq-radar-site repo) — kept as literal hexes, not the report's own
     --status-* tokens, since a logo stays on-brand regardless of page palette. */
  .brand {{ font-weight: 800; font-size: 22px; letter-spacing: 0.06em; color: #8a8a8a; margin: 0 0 20px; }}
  .brand .brand-mark {{ color: #2ecc71; }}

  h1 {{ font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }}
  .subtitle {{ color: var(--text-secondary); font-size: 14px; margin: 0 0 24px; }}

  .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }}
  .stat-tile {{ background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; }}
  .stat-tile.highlight {{ border-color: var(--status-good); }}
  .stat-tile-label {{ font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px;
    text-transform: uppercase; letter-spacing: 0.04em; }}
  .stat-tile-total {{ font-size: 30px; font-weight: 700; color: var(--text-primary); line-height: 1; letter-spacing: -0.02em; }}
  .stat-tile-total.good {{ color: #3fd63f; }}
  .stat-tile-total.critical {{ color: #ff9a9a; }}

  .search-row {{ display: flex; align-items: center; gap: 12px; margin: 0 0 20px; flex-wrap: wrap; }}
  .search-input {{ flex: 1; min-width: 220px; background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px; font-size: 14px; color: var(--text-primary); font-family: var(--mono); }}
  .search-input:focus {{ outline: none; border-color: var(--text-secondary); }}
  .search-input::placeholder {{ color: var(--text-muted); }}
  .search-count {{ font-size: 12px; color: var(--text-muted); white-space: nowrap; }}

  .badge {{ display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
    font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; }}
  .badge.good {{ background: var(--status-good); }}
  .badge.warning {{ background: var(--status-warning); color: #3a2a00; }}
  .badge.critical {{ background: var(--status-critical); }}
  .badge.unknown {{ background: var(--status-unknown); }}
  .badge.leg {{ background: var(--surface-2); border: 1px solid var(--border); color: var(--text-secondary); }}

  details.card {{ background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
    margin-bottom: 8px; overflow: hidden; }}
  details.card summary {{ list-style: none; cursor: pointer; padding: 12px 16px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px; flex-wrap: wrap; }}
  details.card summary::-webkit-details-marker {{ display: none; }}
  details.card .card-title {{ display: flex; align-items: center; gap: 8px; min-width: 0; }}
  details.card .caret {{ color: var(--text-muted); display: inline-block; transition: transform .12s ease; flex-shrink: 0; }}
  details.card[open] .caret {{ transform: rotate(90deg); }}
  details.card .target {{ font-size: 14px; font-weight: 700; font-family: var(--mono); word-break: break-all; }}
  details.card .badges {{ display: flex; gap: 8px; align-items: center; flex-shrink: 0; }}
  .card-body {{ padding: 0 16px 16px; }}
  .kv {{ font-size: 13px; color: var(--text-secondary); margin: 0 0 4px; }}
  .kv b {{ color: var(--text-muted); font-weight: 600; }}
  details.card h4 {{ margin: 14px 0 6px; font-size: 12px; font-weight: 600; color: var(--text-primary);
    text-transform: uppercase; letter-spacing: 0.04em; }}
  pre.code-box {{ margin: 0; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 6px; font-family: var(--mono); font-size: 12px; line-height: 1.5; color: var(--text-secondary);
    white-space: pre-wrap; word-break: break-all; }}
  pre.raw-box {{ max-height: 260px; overflow-y: auto; }}

  footer {{ margin-top: 40px; color: var(--text-muted); font-size: 12px; }}
  footer .brand-link {{ text-decoration: none; font-weight: 800; letter-spacing: 0.03em; color: #8a8a8a; }}
  footer .brand-link .brand-mark {{ color: #2ecc71; }}
  footer .brand-link:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
<div class="page">
  <div class="brand"><span class="brand-mark">PQRADAR</span>.NET</div>
  <h1>Scan Report</h1>
  <p class="subtitle">Requested {total} {target_word} &middot; {timestamp}</p>

  <div class="summary">
    <div class="stat-tile"><div class="stat-tile-label">Scanned</div><div class="stat-tile-total">{total}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Live</div><div class="stat-tile-total">{live_count}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Dead</div><div class="stat-tile-total">{unreachable_count}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">PQ</div><div class="stat-tile-total good">{pq_count}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Non-PQ</div><div class="stat-tile-total critical">{non_pq_count}</div></div>
    <div class="stat-tile highlight"><div class="stat-tile-label">PQ of Live</div><div class="stat-tile-total">{live_pct}%</div></div>
  </div>

  <div class="search-row">
    <input type="text" id="search" class="search-input" placeholder="Filter by hostname (partial match)&hellip;" autocomplete="off">
    <span class="search-count" id="search-count">{total} of {total} shown</span>
  </div>

  <div id="results">
  {cards}
  </div>

  <footer>Generated by <a class="brand-link" href="https://pqradar.net"><span class="brand-mark">PQRADAR</span>.NET</a> &mdash; same handshake classifier as the hosted tool, run standalone via the CLI.</footer>
</div>
<script>
(function () {{
  var input = document.getElementById("search");
  var counter = document.getElementById("search-count");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var total = cards.length;

  input.addEventListener("input", function () {{
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {{
      var match = !q || card.getAttribute("data-target").indexOf(q) !== -1;
      card.style.display = match ? "" : "none";
      if (match) shown++;
    }});
    counter.textContent = shown + " of " + total + " shown";
  }});
}})();
</script>
</body>
</html>
"""
