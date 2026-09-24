export interface ExportData {
  readiness: unknown;
  services: unknown;
  generatedAt: string;
}

// A single self-contained HTML file: the same data + filter/tile logic as the live
// dashboard (readiness-page.ts + readiness-detail-page.ts + readiness-services-page.ts),
// but with the data embedded inline instead of fetched, so the file works standalone —
// no TRIGGER_SECRET, no live connection to the Worker needed to open and filter it.
export function renderExportHtml(data: ExportData): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar — Full Export</title>
<style>
  .viz-root {
    color-scheme: dark;
    color: #ffffff;
    background: #0d0d0d;
    min-height: 100vh;
    --surface-1:      #1a1a19;
    --surface-2:      #0d0d0d;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #898781;
    --gridline:       #2c2c2a;
    --border:         rgba(255,255,255,0.10);
    --status-good:      #0ca30c;
    --status-warning:   #fab219;
    --status-critical:  #e66767;
    --status-unknown:   #898781;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #0d0d0d; color: #ffffff;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .page { max-width: 1400px; margin: 0 auto; padding: 32px 20px 80px; }
  h1.page-title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); margin: 0 0 4px; }
  .generated-note { color: var(--text-muted); font-size: 12px; margin: 0 0 28px; }
  h2.section-title {
    font-size: 18px; font-weight: 700; margin: 40px 0 14px; padding-top: 24px;
    border-top: 1px solid var(--border);
  }
  h2.section-title:first-of-type { border-top: none; padding-top: 0; margin-top: 8px; }
  .top-nav {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; margin: 0 0 24px; padding: 10px 0;
    background: #0d0d0d; border-bottom: 1px solid var(--border);
  }
  .top-nav a {
    background: var(--surface-1); border: 1px solid var(--border); color: var(--text-primary);
    border-radius: 999px; padding: 7px 16px; font-size: 13px; font-weight: 600;
    text-decoration: none; transition: border-color .12s ease;
  }
  .top-nav a:hover { border-color: var(--text-secondary); }
  h3.subnet-title { font-size: 14px; font-weight: 700; margin: 24px 0 10px; color: var(--text-secondary); }
  h3.subnet-title:first-child { margin-top: 0; }

  .stat-tiles {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px; margin: 0 0 16px; max-width: 640px;
  }
  .stat-tiles.sub-tiles { max-width: 480px; margin: -6px 0 16px; }
  .stat-tile {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
    padding: 16px 18px; box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
    cursor: pointer; transition: border-color .12s ease, background .12s ease;
  }
  .stat-tile:hover { border-color: var(--text-secondary); }
  .stat-tile:focus-visible { outline: 2px solid var(--text-secondary); outline-offset: 2px; }
  .stat-tile.active { border-color: var(--text-primary); background: var(--surface-2); }
  .stat-tile-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin: 0 0 8px; }
  .stat-tile-total { font-size: 24px; font-weight: 700; color: var(--text-primary); line-height: 1; }
  .stat-tile-total.good { color: #3fd63f; }
  .stat-tile-total.warning { color: var(--status-warning); }
  .stat-tile-total.critical { color: #ff9a9a; }
  .stat-tile-pct { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-left: 6px; }

  #network-subtiles {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px; margin: 0 0 24px; max-width: 900px;
  }
  .network-subtile {
    display: block; text-decoration: none; color: inherit;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px;
    padding: 16px 18px; box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset;
    transition: border-color .12s ease;
  }
  .network-subtile:hover { border-color: var(--text-secondary); }
  .network-subtile .stat-tile-label { margin-bottom: 8px; }
  .network-subtile .stat-tile-total { font-size: 30px; margin-bottom: 10px; letter-spacing: -0.02em; }
  .stat-tile-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .stat-chip {
    font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 5px;
  }
  .stat-chip.good     { background: rgba(12,163,12,0.16);   color: #3fd63f; }
  .stat-chip.critical { background: rgba(230,103,103,0.16); color: #ff9a9a; }
  .stat-chip .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; display: inline-block; }

  .filter-toggle { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
  .filter-toggle button {
    background: var(--surface-1); border: 1px solid var(--border); color: var(--text-secondary);
    border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .filter-toggle button.active { background: var(--status-good); color: #fff; border-color: var(--status-good); }

  .legend {
    display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 16px; padding: 12px 14px;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; font-size: 12px;
  }
  .legend .item { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }

  .badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 700; color: #0d0d0d;
  }
  .badge.good     { background: var(--status-good); color: #fff; }
  .badge.warning  { background: var(--status-warning); color: #3a2a00; }
  .badge.critical { background: var(--status-critical); color: #fff; }
  .badge.unknown  { background: var(--status-unknown); color: #fff; }

  .table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface-1); font-size: 13px; }
  thead th {
    text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
    color: var(--text-secondary); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
    white-space: nowrap;
  }
  tbody td { padding: 10px 12px; border-bottom: 1px solid var(--gridline); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  .muted { color: var(--text-muted); }
  .empty-note { color: var(--text-muted); padding: 16px 0; font-size: 13px; }
</style>
</head>
<body>
<div class="viz-root">
  <div class="page">
    <h1 class="page-title">PQ Radar — Full Export</h1>
    <p class="subtitle">End-to-end readiness: Client to Edge and Origin (Direct), plus SSH/FTPS and origin coverage.</p>
    <p class="generated-note" id="generated-note"></p>

    <nav class="top-nav">
      <a href="#domains-section">Domains</a>
      <a href="#networks-section">Networks</a>
    </nav>

    <h2 class="section-title" id="domains-section">Domains</h2>
    <div class="filter-toggle" id="env-filter"></div>
    <div class="stat-tiles" id="host-stat-tiles"></div>
    <div class="stat-tiles sub-tiles" id="live-breakdown-tiles" style="display:none"></div>
    <div class="legend" id="outcome-legend"></div>
    <div class="table-wrap">
      <table>
        <colgroup><col style="width:20%"><col style="width:14%"><col style="width:8%"><col style="width:13%"><col style="width:15%"><col style="width:15%"><col style="width:15%"></colgroup>
        <thead>
          <tr><th>Hostname</th><th>Zone</th><th>Env</th><th>Client to Edge</th><th>Origin IP</th><th>Origin (Direct)</th><th>Overall</th></tr>
        </thead>
        <tbody id="host-rows"></tbody>
      </table>
    </div>

    <h2 class="section-title" id="networks-section">Networks</h2>
    <div class="stat-tiles" id="network-subtiles"></div>
    <div id="origin-networks"></div>

    <h3 class="subnet-title">Uncovered Origins</h3>
    <p class="subtitle" style="margin-bottom:16px;">Live origins scanned directly that no DNS record points at — real infrastructure with no known Cloudflare zone covering it.</p>
    <div class="table-wrap">
      <table>
        <colgroup><col style="width:20%"><col style="width:20%"><col style="width:20%"><col style="width:40%"></colgroup>
        <thead><tr><th>IP</th><th>Outcome</th><th>Protocol</th><th>Group</th></tr></thead>
        <tbody id="orphan-rows"></tbody>
      </table>
    </div>

    <h3 class="subnet-title">SSH &amp; FTPS Services</h3>
    <div class="stat-tiles" id="services-stat-tiles"></div>
    <div class="table-wrap">
      <table>
        <colgroup><col style="width:20%"><col style="width:26.67%"><col style="width:26.67%"><col style="width:26.66%"></colgroup>
        <thead><tr><th>IP</th><th>SSH</th><th>FTPS (Implicit)</th><th>FTPS (Explicit)</th></tr></thead>
        <tbody id="services-rows"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
(function () {
  var DATA = ${json};
  var readiness = DATA.readiness;
  var services = DATA.services;

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  document.getElementById("generated-note").textContent =
    "Static snapshot, generated " + new Date(DATA.generatedAt).toLocaleString() + " \\u2014 filters below work fully offline.";

  var OUTCOME_META = {
    pq:            { cls: "good",     icon: "\\u2713", label: "PQ",           desc: "TLS 1.3, negotiated the post-quantum hybrid group" },
    classical:     { cls: "warning",  icon: "\\u25CF", label: "Classical",    desc: "TLS 1.3, but a non-PQ group (not quantum-resistant)" },
    downgrade:     { cls: "critical", icon: "\\u25BC", label: "Downgrade",    desc: "Only TLS 1.2 negotiated" },
    intolerant:    { cls: "critical", icon: "\\u2715", label: "Intolerant",   desc: "Broke on the PQ ClientHello, worked once PQ was dropped" },
    indeterminate: { cls: "unknown",  icon: "?",        label: "Indeterminate", desc: "Reachable, but no clean handshake result" },
    unreachable:   { cls: "critical", icon: "\\u2715",   label: "Not Live",   desc: "TCP connect failed \\u2014 host didn\\u2019t respond" }
  };
  var NOT_SCANNED_META = { cls: "unknown", icon: "?", label: "Not scanned", desc: "Never included in a scan run yet" };

  function outcomeBadge(outcome) {
    if (!outcome) return '<span class="badge unknown">? Not scanned</span>';
    var meta = OUTCOME_META[outcome] || { cls: "unknown", icon: "?", label: outcome };
    return '<span class="badge ' + meta.cls + '">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>';
  }

  function renderLegend() {
    var entries = ["pq", "classical", "downgrade", "intolerant", "indeterminate", "unreachable"]
      .map(function (k) { return OUTCOME_META[k]; })
      .concat([NOT_SCANNED_META]);
    document.getElementById("outcome-legend").innerHTML = entries.map(function (meta) {
      return '<span class="item"><span class="badge ' + meta.cls + '">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>' +
        '<span>' + escapeHtml(meta.desc) + '</span></span>';
    }).join("");
  }

  // Same live/classical/dead split used throughout the live dashboard: "classical" (TLS
  // 1.3, non-PQ group) doesn't count as live for these tiles \\u2014 it gets its own bucket.
  function legStatus(outcome) {
    if (outcome === "pq" || outcome === "downgrade" || outcome === "intolerant") return "live";
    if (outcome === "classical") return "classical";
    return "down";
  }
  function hostBucket(h) {
    var edge = legStatus(h.edge_outcome);
    var origin = legStatus(h.origin_outcome);
    if (edge === "down" || origin === "down") return "dead";
    if (edge === "classical" || origin === "classical") return "classical";
    return "live";
  }
  function isPqReady(h) { return h.edge_outcome === "pq" && h.origin_outcome === "pq"; }
  function isHybrid(h) { return (h.edge_outcome === "pq") !== (h.origin_outcome === "pq"); }
  function originBucket(outcome) {
    var s = legStatus(outcome);
    return s === "down" ? "dead" : s;
  }

  function overall(h) {
    if (!h.edge_outcome || !h.origin_outcome) return { cls: "unknown", icon: "?", label: "Incomplete data" };
    var edgePq = h.edge_outcome === "pq";
    var originPq = h.origin_outcome === "pq";
    if (edgePq && originPq) return { cls: "good", icon: "\\u2713", label: "Full" };
    if (edgePq || originPq) return { cls: "warning", icon: "\\u25CF", label: "Mixed" };
    return { cls: "critical", icon: "\\u25BC", label: "None" };
  }

  function ipToInt(ip) {
    var parts = ip.split(".");
    if (parts.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < parts.length; i++) {
      var v = Number(parts[i]);
      if (!Number.isInteger(v) || v < 0 || v > 255) return null;
      n = (n << 8) | v;
    }
    return n >>> 0;
  }
  function ipInCidr(ip, cidr) {
    var split = cidr.split("/");
    var base = split[0];
    var bits = Number(split[1]);
    var ipInt = ipToInt(ip);
    var baseInt = ipToInt(base);
    if (ipInt === null || baseInt === null || !Number.isInteger(bits)) return false;
    var mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }

  function tileHtml(label, value, cls, filterAttr, filterVal, active, pct) {
    return '<div class="stat-tile' + (active ? " active" : "") + '" data-' + filterAttr + '="' + filterVal + '" tabindex="0" role="button" aria-pressed="' + active + '">' +
      '<div class="stat-tile-label">' + escapeHtml(label) + '</div>' +
      '<div class="stat-tile-total ' + cls + '">' + value + (pct !== undefined ? '<span class="stat-tile-pct">' + pct + '%</span>' : '') + '</div></div>';
  }

  function bindToggleTiles(containerId, attr, onChange) {
    var el = document.getElementById(containerId);
    function handle(e) {
      var tile = e.target.closest(".stat-tile[data-" + attr + "]");
      if (!tile) return;
      onChange(tile.getAttribute("data-" + attr), tile);
    }
    el.addEventListener("click", handle);
    el.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var tile = e.target.closest(".stat-tile[data-" + attr + "]");
      if (!tile) return;
      e.preventDefault();
      handle(e);
    });
  }

  // ---------------------------------------------------------------- Hostnames
  var hosts = readiness.hosts || [];
  var hostEnvFilter = "all";
  var hostLiveFilter = "live";
  var hostLiveSubFilter = "all";

  function renderEnvButtons() {
    var labels = Array.from(new Set(hosts.map(function (h) { return h.account_label; }).filter(Boolean))).sort();
    var el = document.getElementById("env-filter");
    if (!labels.length) { el.innerHTML = ""; return; }
    var buttons = ['<button data-env="all" type="button" class="' + (hostEnvFilter === "all" ? "active" : "") + '">All</button>'];
    labels.forEach(function (key) {
      buttons.push('<button data-env="' + escapeHtml(key) + '" type="button" class="' + (hostEnvFilter === key ? "active" : "") + '">' + escapeHtml(key.toUpperCase()) + '</button>');
    });
    el.innerHTML = buttons.join("");
  }

  function renderHostnames() {
    var envFiltered = hostEnvFilter === "all" ? hosts : hosts.filter(function (h) { return h.account_label === hostEnvFilter; });

    var total = envFiltered.length;
    var liveCount = envFiltered.filter(function (h) { return hostBucket(h) === "live"; }).length;
    var classicalCount = envFiltered.filter(function (h) { return hostBucket(h) === "classical"; }).length;
    var deadCount = envFiltered.filter(function (h) { return hostBucket(h) === "dead"; }).length;
    document.getElementById("host-stat-tiles").innerHTML =
      tileHtml("Total", total, "", "filter", "all", hostLiveFilter === "all") +
      tileHtml("Live", liveCount, "good", "filter", "live", hostLiveFilter === "live") +
      tileHtml("Classical", classicalCount, "warning", "filter", "classical", hostLiveFilter === "classical") +
      tileHtml("Dead", deadCount, "critical", "filter", "dead", hostLiveFilter === "dead");

    var breakdownEl = document.getElementById("live-breakdown-tiles");
    if (hostLiveFilter !== "live" || total === 0) {
      breakdownEl.style.display = "none";
      breakdownEl.innerHTML = "";
    } else {
      breakdownEl.style.display = "";
      var liveHosts = envFiltered.filter(function (h) { return hostBucket(h) === "live"; });
      var pqReadyCount = liveHosts.filter(isPqReady).length;
      var hybridCount = liveHosts.filter(isHybrid).length;
      function pct(n) { return total ? Math.round((n / total) * 100) : 0; }
      breakdownEl.innerHTML =
        tileHtml("Total Live", liveCount, "good", "subfilter", "all", hostLiveSubFilter === "all", pct(liveCount)) +
        tileHtml("PQ-Ready", pqReadyCount, "good", "subfilter", "pq-ready", hostLiveSubFilter === "pq-ready", pct(pqReadyCount)) +
        tileHtml("Hybrid", hybridCount, "warning", "subfilter", "hybrid", hostLiveSubFilter === "hybrid", pct(hybridCount));
    }

    var filtered = envFiltered;
    if (hostLiveFilter !== "all") {
      filtered = filtered.filter(function (h) { return hostBucket(h) === hostLiveFilter; });
      if (hostLiveFilter === "live" && hostLiveSubFilter === "pq-ready") filtered = filtered.filter(isPqReady);
      else if (hostLiveFilter === "live" && hostLiveSubFilter === "hybrid") filtered = filtered.filter(isHybrid);
    }

    var el = document.getElementById("host-rows");
    if (!filtered.length) {
      el.innerHTML = '<tr><td colspan="7" class="muted">No hostnames match this filter.</td></tr>';
      return;
    }
    el.innerHTML = filtered.map(function (h) {
      var o = overall(h);
      return '<tr>' +
        '<td>' + escapeHtml(h.hostname) + '</td>' +
        '<td class="muted">' + (h.zone_name ? escapeHtml(h.zone_name) : '\\u2014') + '</td>' +
        '<td class="muted">' + (h.account_label ? escapeHtml(h.account_label.toUpperCase()) : '\\u2014') + '</td>' +
        '<td>' + outcomeBadge(h.edge_outcome) + '</td>' +
        '<td class="muted">' + (h.origin_ip ? escapeHtml(h.origin_ip) : '\\u2014') + '</td>' +
        '<td>' + outcomeBadge(h.origin_outcome) + '</td>' +
        '<td><span class="badge ' + o.cls + '">' + o.icon + ' ' + escapeHtml(o.label) + '</span></td>' +
        '</tr>';
    }).join("");
  }

  document.getElementById("env-filter").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-env]");
    if (!btn) return;
    hostEnvFilter = btn.getAttribute("data-env");
    renderEnvButtons();
    renderHostnames();
  });

  bindToggleTiles("host-stat-tiles", "filter", function (filter) {
    hostLiveFilter = (hostLiveFilter === filter) ? "all" : filter;
    hostLiveSubFilter = "all";
    renderHostnames();
  });
  bindToggleTiles("live-breakdown-tiles", "subfilter", function (filter) {
    hostLiveSubFilter = (hostLiveSubFilter === filter) ? "all" : filter;
    renderHostnames();
  });

  // ---------------------------------------------------------------- Origin networks
  var originResults = readiness.origin_results || [];
  var originSubnets = readiness.origin_subnets || [];
  var subnetState = {};
  originSubnets.forEach(function (s) { subnetState[s.cidr] = { top: "live", sub: "all" }; });

  function subnetAnchorId(cidr) { return "subnet-" + cidr.replace(/[.\/]/g, "-"); }

  // One small tile per CIDR (total / live / dead), linking down to that network's full
  // detail block below \\u2014 a quick-glance row across every configured subnet.
  function renderNetworkSubtiles() {
    var el = document.getElementById("network-subtiles");
    if (!originSubnets.length) {
      el.innerHTML = '<p class="empty-note">No enabled subnets configured.</p>';
      return;
    }
    el.innerHTML = originSubnets.map(function (s) {
      var label = s.cidr + (s.label ? " \\u2014 " + s.label : "");
      return '<a class="network-subtile" href="#' + subnetAnchorId(s.cidr) + '">' +
        '<div class="stat-tile-label">' + escapeHtml(label) + '</div>' +
        '<div class="stat-tile-total">' + s.total + '</div>' +
        '<div class="stat-tile-row">' +
          '<span class="stat-chip good"><span class="dot"></span>' + s.live + ' live</span>' +
          '<span class="stat-chip critical"><span class="dot"></span>' + s.dead + ' dead</span>' +
        '</div></a>';
    }).join("");
  }

  function renderOriginNetworks() {
    var container = document.getElementById("origin-networks");
    if (!originSubnets.length) {
      container.innerHTML = '<p class="empty-note">No enabled subnets configured.</p>';
      return;
    }
    container.innerHTML = originSubnets.map(function (s) {
      var matched = originResults.filter(function (r) { return ipInCidr(r.ip, s.cidr); });
      var state = subnetState[s.cidr];
      var total = matched.length;
      var liveCount = matched.filter(function (r) { return originBucket(r.outcome) === "live"; }).length;
      var classicalCount = matched.filter(function (r) { return originBucket(r.outcome) === "classical"; }).length;
      var deadCount = matched.filter(function (r) { return originBucket(r.outcome) === "dead"; }).length;

      var tilesHtml =
        tileHtml("Total", total, "", "originfilter", "all", state.top === "all") +
        tileHtml("Live", liveCount, "good", "originfilter", "live", state.top === "live") +
        tileHtml("Classical", classicalCount, "warning", "originfilter", "classical", state.top === "classical") +
        tileHtml("Dead", deadCount, "critical", "originfilter", "dead", state.top === "dead");

      var breakdownHtml = "";
      if (state.top === "live" && total > 0) {
        var pqReadyCount = matched.filter(function (r) { return originBucket(r.outcome) === "live" && r.outcome === "pq"; }).length;
        var notPqReadyCount = liveCount - pqReadyCount;
        var pct = function (n) { return total ? Math.round((n / total) * 100) : 0; };
        breakdownHtml = '<div class="stat-tiles sub-tiles" data-cidr="' + escapeHtml(s.cidr) + '">' +
          tileHtml("PQ-Ready", pqReadyCount, "good", "originsubfilter", "pq-ready", state.sub === "pq-ready", pct(pqReadyCount)) +
          tileHtml("Not PQ-Ready", notPqReadyCount, "warning", "originsubfilter", "not-pq-ready", state.sub === "not-pq-ready", pct(notPqReadyCount)) +
          '</div>';
      }

      var rows = matched;
      if (state.top !== "all") {
        rows = rows.filter(function (r) { return originBucket(r.outcome) === state.top; });
        if (state.top === "live" && state.sub === "pq-ready") rows = rows.filter(function (r) { return r.outcome === "pq"; });
        else if (state.top === "live" && state.sub === "not-pq-ready") rows = rows.filter(function (r) { return r.outcome !== "pq"; });
      }
      var rowsHtml = rows.length
        ? rows.map(function (r) {
            return '<tr>' +
              '<td>' + escapeHtml(r.ip) + '</td>' +
              '<td class="muted">' + (r.hostnames ? escapeHtml(r.hostnames) : '\\u2014') + '</td>' +
              '<td>' + outcomeBadge(r.outcome) + '</td>' +
              '<td class="muted">' + (r.protocol ? escapeHtml(r.protocol) : '\\u2014') + '</td>' +
              '<td class="muted">' + (r.negotiated_group ? escapeHtml(r.negotiated_group) : '\\u2014') + '</td>' +
              '</tr>';
          }).join("")
        : '<tr><td colspan="5" class="muted">No origin results for this network match this filter.</td></tr>';

      return '<div class="subnet-block" id="' + subnetAnchorId(s.cidr) + '" data-cidr="' + escapeHtml(s.cidr) + '">' +
        '<h3 class="subnet-title">' + escapeHtml(s.cidr + (s.label ? " \\u2014 " + s.label : "")) + '</h3>' +
        '<div class="stat-tiles" data-cidr="' + escapeHtml(s.cidr) + '">' + tilesHtml + '</div>' +
        breakdownHtml +
        '<div class="table-wrap"><table>' +
          '<colgroup><col style="width:20%"><col style="width:35%"><col style="width:20%"><col style="width:12.5%"><col style="width:12.5%"></colgroup>' +
          '<thead><tr><th>IP</th><th>Hostname</th><th>Outcome</th><th>Protocol</th><th>Group</th></tr></thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table></div>' +
      '</div>';
    }).join("");
  }

  document.getElementById("origin-networks").addEventListener("click", function (e) {
    var block = e.target.closest(".subnet-block");
    if (!block) return;
    var cidr = block.getAttribute("data-cidr");
    var topTile = e.target.closest(".stat-tile[data-originfilter]");
    var subTile = e.target.closest(".stat-tile[data-originsubfilter]");
    if (topTile) {
      var f = topTile.getAttribute("data-originfilter");
      subnetState[cidr].top = (subnetState[cidr].top === f) ? "all" : f;
      subnetState[cidr].sub = "all";
      renderOriginNetworks();
    } else if (subTile) {
      var sf = subTile.getAttribute("data-originsubfilter");
      subnetState[cidr].sub = (subnetState[cidr].sub === sf) ? "all" : sf;
      renderOriginNetworks();
    }
  });

  // ---------------------------------------------------------------- Uncovered origins
  function renderOrphans() {
    var orphans = readiness.orphans || [];
    var el = document.getElementById("orphan-rows");
    if (!orphans.length) {
      el.innerHTML = '<tr><td colspan="4" class="muted">No uncovered live origins.</td></tr>';
      return;
    }
    el.innerHTML = orphans.map(function (o) {
      return '<tr>' +
        '<td>' + escapeHtml(o.ip) + '</td>' +
        '<td>' + outcomeBadge(o.outcome) + '</td>' +
        '<td class="muted">' + (o.protocol ? escapeHtml(o.protocol) : '\\u2014') + '</td>' +
        '<td class="muted">' + (o.negotiated_group ? escapeHtml(o.negotiated_group) : '\\u2014') + '</td>' +
        '</tr>';
    }).join("");
  }

  // ---------------------------------------------------------------- SSH & FTPS services
  var origins = services.origins || [];
  var serviceFilter = "all";

  function serviceIsLive(o) {
    return legStatus(o.ssh_outcome) === "live" || legStatus(o.ftps_implicit_outcome) === "live" || legStatus(o.ftps_explicit_outcome) === "live";
  }

  function renderServices() {
    var total = origins.length;
    var liveCount = origins.filter(serviceIsLive).length;
    var deadCount = total - liveCount;
    document.getElementById("services-stat-tiles").innerHTML =
      tileHtml("Total", total, "", "servicefilter", "all", serviceFilter === "all") +
      tileHtml("Live (any service)", liveCount, "good", "servicefilter", "live", serviceFilter === "live") +
      tileHtml("Dead (no service live)", deadCount, "critical", "servicefilter", "dead", serviceFilter === "dead");

    var filtered = origins;
    if (serviceFilter === "live") filtered = origins.filter(serviceIsLive);
    else if (serviceFilter === "dead") filtered = origins.filter(function (o) { return !serviceIsLive(o); });

    var el = document.getElementById("services-rows");
    if (!filtered.length) {
      el.innerHTML = '<tr><td colspan="4" class="muted">No origins match this filter.</td></tr>';
      return;
    }
    el.innerHTML = filtered.map(function (o) {
      return '<tr>' +
        '<td>' + escapeHtml(o.ip) + '</td>' +
        '<td>' + outcomeBadge(o.ssh_outcome) + '</td>' +
        '<td>' + outcomeBadge(o.ftps_implicit_outcome) + '</td>' +
        '<td>' + outcomeBadge(o.ftps_explicit_outcome) + '</td>' +
        '</tr>';
    }).join("");
  }

  bindToggleTiles("services-stat-tiles", "servicefilter", function (filter) {
    serviceFilter = (serviceFilter === filter) ? "all" : filter;
    renderServices();
  });

  renderLegend();
  renderEnvButtons();
  renderHostnames();
  renderNetworkSubtiles();
  renderOriginNetworks();
  renderOrphans();
  renderServices();
})();
</script>
</body>
</html>`;
}
