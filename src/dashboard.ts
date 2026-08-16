export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar</title>
<style>
  .viz-root {
    color-scheme: light;
    --surface-1:      #fcfcfb;
    --surface-2:      #f9f9f7;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #898781;
    --gridline:       #e1e0d9;
    --border:         rgba(11,11,11,0.10);
    --status-good:      #0ca30c;
    --status-warning:   #fab219;
    --status-serious:   #ec835a;
    --status-critical:  #d03b3b;
    --status-unknown:   #898781;
  }
  @media (prefers-color-scheme: dark) {
    .viz-root {
      color-scheme: dark;
      --surface-1:      #1a1a19;
      --surface-2:      #0d0d0d;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #898781;
      --gridline:       #2c2c2a;
      --border:         rgba(255,255,255,0.10);
      --status-good:      #0ca30c;
      --status-warning:   #fab219;
      --status-serious:   #ec835a;
      --status-critical:  #e66767;
      --status-unknown:   #898781;
    }
  }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--surface-2);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 4px;
  }
  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 36px 0 12px;
  }
  .subtitle {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0 0 28px;
  }

  /* --- Secret gate --- */
  #gate {
    max-width: 360px;
    margin: 80px auto;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
  }
  #gate p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; }
  #gate input {
    width: 100%;
    padding: 8px 10px;
    font-size: 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text-primary);
    margin-bottom: 12px;
  }
  #gate button {
    width: 100%;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: var(--status-good);
    color: #fff;
    cursor: pointer;
  }
  #gate .error { color: var(--status-critical); font-size: 13px; margin: -4px 0 12px; }

  /* --- Stat tiles --- */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .tile .label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }
  .tile .value {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: proportional-nums;
  }

  /* --- Table --- */
  .table-wrap {
    width: 100%;
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    background: var(--surface-1);
    font-size: 13px;
  }
  thead th {
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    padding: 10px 12px;
    border-bottom: 1px solid var(--gridline);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  tbody td {
    padding: 9px 12px;
    border-bottom: 1px solid var(--gridline);
    font-variant-numeric: tabular-nums;
    vertical-align: top;
    overflow-wrap: break-word;
  }
  .hostnames-cell {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    line-height: 1.4;
    cursor: help;
  }
  tbody tr:last-child td { border-bottom: none; }
  .ip { font-variant-numeric: tabular-nums; }
  .muted { color: var(--text-muted); }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--surface-2); }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
  }
  .badge.good     { background: var(--status-good); }
  .badge.warning  { background: var(--status-warning); color: #3a2a00; }
  .badge.serious,
  .badge.critical { background: var(--status-critical); }
  .badge.unknown  { background: var(--status-unknown); }

  .view-btn {
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .view-btn:hover { background: var(--gridline); }

  tr.result-row.expanded td {
    border-bottom-color: transparent;
  }
  tr.detail-row td {
    padding: 0 12px 14px;
    border-bottom: 1px solid var(--gridline);
  }
  tr.detail-row .detail-panel {
    border: 1px solid var(--status-good);
    border-radius: 6px;
    overflow: hidden;
  }
  tr.detail-row .detail-panel-head {
    background: var(--status-good);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 10px;
  }
  tr.detail-row pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    background: var(--surface-2);
    padding: 10px;
    margin: 0;
    max-height: 320px;
    overflow: auto;
  }

  /* --- Legend --- */
  .legend {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 24px;
  }
  .legend-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .legend-item .badge { flex-shrink: 0; margin-top: 1px; width: 110px; justify-content: center; }
  .legend-item .legend-text {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  /* --- Subnets --- */
  .subnets-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  .subnets-head h2 { margin: 0; }
  .schedule-link {
    font-size: 13px;
    color: var(--text-secondary);
    text-decoration: underline;
    margin-right: 12px;
  }
  .refresh-btn {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-1);
    color: var(--text-secondary);
    cursor: pointer;
  }
  .refresh-btn:hover { background: var(--gridline); }
  .cron-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--status-warning);
    color: #3a2a00;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }
  .subnet-card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .subnet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .subnet-cidr { font-weight: 600; font-variant-numeric: tabular-nums; }
  .subnet-label { color: var(--text-secondary); font-size: 13px; margin-left: 8px; }
  .run-btn {
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    background: var(--status-good);
    color: #fff;
    cursor: pointer;
  }
  .run-btn:disabled { opacity: 0.5; cursor: default; }
  .run-log {
    display: none;
    margin-top: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 11px;
    font-family: ui-monospace, "SF Mono", Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 220px;
    overflow: auto;
  }
  .run-history {
    margin-top: 10px;
  }
  .run-history table { font-size: 12px; }
  .run-history .empty { color: var(--text-muted); font-size: 12px; padding: 6px 0; }
  .trigger-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .trigger-badge.manual { background: var(--gridline); color: var(--text-secondary); }
  .trigger-badge.cron { background: var(--status-warning); color: #3a2a00; }
  .status-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    color: #fff;
  }
  .status-badge.success { background: var(--status-good); }
  .status-badge.failed { background: var(--status-critical); cursor: help; }

  #run-detail { display: none; }
  #run-detail .close-btn {
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
    margin-bottom: 10px;
    display: inline-block;
  }

  #app { display: none; }
  #loading, #error-banner { color: var(--text-secondary); font-size: 14px; }
  #error-banner { color: var(--status-critical); }
  #subnets-loading { color: var(--text-secondary); font-size: 13px; }
</style>
</head>
<body>
<div class="viz-root">
  <div class="page">

    <div id="gate">
      <h1>PQ Radar</h1>
      <p>Enter the API secret to view scan results.</p>
      <div id="gate-error" class="error" style="display:none">Invalid secret.</div>
      <input id="secret-input" type="password" placeholder="API secret" autocomplete="off">
      <button id="gate-submit">Unlock</button>
    </div>

    <div id="app">
      <h1>PQ Radar</h1>
      <p class="subtitle">Post-quantum TLS posture</p>

      <div class="legend">
        <div class="legend-item">
          <span class="badge good">&#10003; PQ</span>
          <span class="legend-text">TLS 1.3 negotiated with the post-quantum hybrid group (X25519MLKEM768). Ready for the PQ transition.</span>
        </div>
        <div class="legend-item">
          <span class="badge warning">&#9679; Classical</span>
          <span class="legend-text">TLS 1.3 negotiated, but with a classical (non-PQ) key exchange group. Modern, not yet PQ-ready.</span>
        </div>
        <div class="legend-item">
          <span class="badge critical">&#9660; Downgrade</span>
          <span class="legend-text">Negotiation fell back to TLS 1.2 &mdash; hasn't reached TLS 1.3 at all.</span>
        </div>
        <div class="legend-item">
          <span class="badge critical">&#10007; Intolerant</span>
          <span class="legend-text">Server/middlebox drops the larger PQ ClientHello but responds fine to a normal TLS 1.3 offer &mdash; a ClientHello-intolerance bug worth investigating.</span>
        </div>
        <div class="legend-item">
          <span class="badge unknown">? Indeterminate</span>
          <span class="legend-text">No response on any offer. Host may be down, non-TLS, or silently dropping the connection.</span>
        </div>
      </div>

      <div id="loading">Loading…</div>
      <div id="error-banner" style="display:none"></div>

      <div id="content" style="display:none">

        <div class="subnets-head">
          <h2>Subnets</h2>
          <div>
            <a class="schedule-link" href="/schedule">Configure schedules &rarr;</a>
            <a class="schedule-link" href="/readiness">End-to-end readiness &rarr;</a>
            <button class="refresh-btn" id="subnets-refresh-btn" type="button">Refresh status</button>
          </div>
        </div>
        <div id="subnets-loading">Loading subnets…</div>
        <div id="subnets"></div>

        <div id="run-detail">
          <h2>Run detail</h2>
          <span class="close-btn" id="run-detail-close">&larr; back to fleet posture</span>
          <div class="tiles" id="run-detail-tiles"></div>
          <div class="table-wrap">
            <table>
              <colgroup>
                <col style="width:10%"><col style="width:25%"><col style="width:11%">
                <col style="width:8%"><col style="width:11%"><col style="width:18%"><col style="width:17%">
              </colgroup>
              <thead>
                <tr><th>IP</th><th>Hostnames</th><th>Outcome</th><th>Protocol</th><th>Group</th><th>Cipher</th><th>Details</th></tr>
              </thead>
              <tbody id="run-detail-rows"></tbody>
            </table>
          </div>
        </div>

        <div id="fleet-view">
          <h2>Fleet posture (latest per host)</h2>
          <div class="tiles" id="tiles"></div>
          <div class="table-wrap">
            <table>
              <colgroup>
                <col style="width:9%"><col style="width:22%"><col style="width:10%">
                <col style="width:7%"><col style="width:10%"><col style="width:16%">
                <col style="width:12%"><col style="width:14%">
              </colgroup>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Hostnames</th>
                  <th>Outcome</th>
                  <th>Protocol</th>
                  <th>Group</th>
                  <th>Cipher</th>
                  <th>Scanned</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

  </div>
</div>

<script>
(function () {
  var STORAGE_KEY = "pq_radar_secret";

  var OUTCOME_META = {
    pq:            { cls: "good",     icon: "\\u2713", label: "PQ" },
    classical:     { cls: "warning",  icon: "\\u25CF", label: "Classical" },
    downgrade:     { cls: "critical", icon: "\\u25BC", label: "Downgrade" },
    intolerant:    { cls: "critical", icon: "\\u2715", label: "Intolerant" },
    indeterminate: { cls: "unknown",  icon: "?",        label: "Indeterminate" }
  };
  var TILE_ORDER = ["pq", "classical", "downgrade", "intolerant", "indeterminate"];

  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var gateError = document.getElementById("gate-error");
  var secretInput = document.getElementById("secret-input");

  function getSecret() { return sessionStorage.getItem(STORAGE_KEY); }
  function setSecret(v) { sessionStorage.setItem(STORAGE_KEY, v); }
  function clearSecret() { sessionStorage.removeItem(STORAGE_KEY); }

  function authHeaders() {
    return { Authorization: "Bearer " + getSecret() };
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function badgeHtml(outcome) {
    var meta = OUTCOME_META[outcome] || { cls: "unknown", icon: "?", label: outcome || "unknown" };
    return '<span class="badge ' + meta.cls + '">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>';
  }

  function renderTiles(results, elId) {
    var counts = {};
    TILE_ORDER.forEach(function (k) { counts[k] = 0; });
    results.forEach(function (r) {
      counts[r.outcome] = (counts[r.outcome] || 0) + 1;
    });
    var el = document.getElementById(elId);
    el.innerHTML = TILE_ORDER.map(function (k) {
      var meta = OUTCOME_META[k];
      return '<div class="tile"><div class="label">' + escapeHtml(meta.label) +
        '</div><div class="value">' + counts[k] + '</div></div>';
    }).join("");
  }

  function renderResultsTable(results, elId, includeScanned, colCount) {
    var el = document.getElementById(elId);
    el.innerHTML = results.map(function (r) {
      var scannedCell = includeScanned ? '<td class="muted">' + escapeHtml(r.ts) + '</td>' : '';
      var hostnamesCell = r.hostnames
        ? '<td><span class="hostnames-cell" title="' + escapeHtml(r.hostnames) + '">' + escapeHtml(r.hostnames) + '</span></td>'
        : '<td><span class="muted">\\u2014</span></td>';
      return '<tr class="result-row" data-run-id="' + escapeHtml(r.run_id) + '" data-ip="' + escapeHtml(r.ip) + '">' +
        '<td class="ip">' + escapeHtml(r.ip) + '</td>' +
        hostnamesCell +
        '<td>' + badgeHtml(r.outcome) + '</td>' +
        '<td>' + (r.protocol ? escapeHtml(r.protocol) : '<span class="muted">\\u2014</span>') + '</td>' +
        '<td>' + (r.negotiated_group ? escapeHtml(r.negotiated_group) : '<span class="muted">\\u2014</span>') + '</td>' +
        '<td>' + (r.cipher ? escapeHtml(r.cipher) : '<span class="muted">\\u2014</span>') + '</td>' +
        scannedCell +
        '<td><button class="view-btn" type="button">View</button></td>' +
        '</tr>';
    }).join("");

    el.querySelectorAll("tr.result-row").forEach(function (row) {
      var btn = row.querySelector(".view-btn");
      btn.addEventListener("click", function () {
        var next = row.nextElementSibling;
        if (next && next.classList.contains("detail-row")) {
          next.remove();
          row.classList.remove("expanded");
          btn.textContent = "View";
          return;
        }

        btn.textContent = "Loading…";
        var runId = row.getAttribute("data-run-id");
        var ip = row.getAttribute("data-ip");
        fetch(
          "/api/results/detail?run_id=" + encodeURIComponent(runId) + "&ip=" + encodeURIComponent(ip),
          { headers: authHeaders() }
        )
          .then(function (res) { return res.json(); })
          .then(function (data) {
            btn.textContent = "Hide";
            row.classList.add("expanded");
            var detailRow = document.createElement("tr");
            detailRow.className = "detail-row";
            var td = document.createElement("td");
            td.colSpan = colCount;
            var panel = document.createElement("div");
            panel.className = "detail-panel";
            var head = document.createElement("div");
            head.className = "detail-panel-head";
            head.textContent = "Command + output for " + ip;
            var pre = document.createElement("pre");
            if (data.result) {
              pre.textContent = "$ " + (data.result.command || "(no command recorded)") + "\\n\\n" + data.result.raw;
            } else {
              pre.textContent = "Not found.";
            }
            panel.appendChild(head);
            panel.appendChild(pre);
            td.appendChild(panel);
            detailRow.appendChild(td);
            row.parentNode.insertBefore(detailRow, row.nextSibling);
          })
          .catch(function (err) {
            btn.textContent = "View";
            window.alert("Failed to load details: " + err.message);
          });
      });
    });
  }

  function loadData() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("error-banner").style.display = "none";
    document.getElementById("content").style.display = "none";

    fetch("/api/results", { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) {
          clearSecret();
          showGate("Invalid secret.");
          return null;
        }
        if (!res.ok) throw new Error("request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        document.getElementById("loading").style.display = "none";
        document.getElementById("content").style.display = "block";
        renderTiles(data.results || [], "tiles");
        renderResultsTable(data.results || [], "rows", true, 8);
        loadSubnets();
      })
      .catch(function (err) {
        document.getElementById("loading").style.display = "none";
        var banner = document.getElementById("error-banner");
        banner.style.display = "block";
        banner.textContent = "Failed to load results: " + err.message;
      });
  }

  function fmtTs(ts) {
    return ts ? ts.replace("T", " ").replace(/\\..*Z$/, " UTC") : "";
  }

  function loadSubnets() {
    fetch("/api/subnets", { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        document.getElementById("subnets-loading").style.display = "none";
        renderSubnets(data.subnets || []);
      });
  }

  function renderSubnets(subnets) {
    var container = document.getElementById("subnets");
    container.innerHTML = subnets.map(function (s) {
      var runningBadge = s.cron_run_started_at
        ? '<span class="cron-badge">&#9201; Scheduled scan running since ' + escapeHtml(s.cron_run_started_at) + '</span>'
        : '';
      return '<div class="subnet-card" data-subnet-id="' + s.id + '">' +
        '<div class="subnet-head">' +
          '<div><span class="subnet-cidr">' + escapeHtml(s.cidr) + '</span>' +
            (s.label ? '<span class="subnet-label">' + escapeHtml(s.label) + '</span>' : '') +
            (s.enabled ? '' : '<span class="subnet-label">(disabled)</span>') +
          '</div>' +
          runningBadge +
          '<button class="run-btn" data-run="' + s.id + '"' + (s.enabled ? '' : ' disabled') + '>Run</button>' +
        '</div>' +
        '<pre class="run-log" id="run-log-' + s.id + '"></pre>' +
        '<div class="run-history" id="run-history-' + s.id + '"></div>' +
      '</div>';
    }).join("");

    subnets.forEach(function (s) { loadRunHistory(s.id); });

    container.querySelectorAll(".run-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        runSubnet(Number(btn.getAttribute("data-run")));
      });
    });
  }

  document.getElementById("subnets-refresh-btn").addEventListener("click", function () {
    loadSubnets();
  });

  function loadRunHistory(subnetId) {
    fetch("/api/runs?subnet_id=" + subnetId, { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var el = document.getElementById("run-history-" + subnetId);
        if (!el) return;
        var runs = data.runs || [];
        if (runs.length === 0) {
          el.innerHTML = '<div class="empty">No runs yet.</div>';
          return;
        }
        el.innerHTML = '<table><thead><tr><th>Run time</th><th>Triggered</th><th>Status</th><th>Total</th><th>Live</th><th>Not live</th></tr></thead><tbody>' +
          runs.map(function (r) {
            var triggerBadge = r.trigger_type === "cron"
              ? '<span class="trigger-badge cron">&#9201; Cron</span>'
              : '<span class="trigger-badge manual">Manual</span>';
            var statusBadge = r.status === "failed"
              ? '<span class="status-badge failed" title="' + escapeHtml(r.error_detail || "") + '">Failed</span>'
              : '<span class="status-badge success">Success</span>';
            return '<tr class="clickable" data-run-id="' + escapeHtml(r.run_id) + '">' +
              '<td>' + escapeHtml(fmtTs(r.ts)) + '</td>' +
              '<td>' + triggerBadge + '</td>' +
              '<td>' + statusBadge + '</td>' +
              '<td>' + r.total_ips + '</td>' +
              '<td>' + r.live_count + '</td>' +
              '<td>' + (r.total_ips - r.live_count) + '</td>' +
              '</tr>';
          }).join("") + '</tbody></table>';
        el.querySelectorAll("tr[data-run-id]").forEach(function (row) {
          row.addEventListener("click", function () {
            viewRun(row.getAttribute("data-run-id"));
          });
        });
      });
  }

  function viewRun(runId) {
    fetch("/api/results?run_id=" + encodeURIComponent(runId), { headers: authHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        document.getElementById("fleet-view").style.display = "none";
        document.getElementById("run-detail").style.display = "block";
        renderTiles(data.results || [], "run-detail-tiles");
        renderResultsTable(data.results || [], "run-detail-rows", false, 7);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
  }

  document.getElementById("run-detail-close").addEventListener("click", function () {
    document.getElementById("run-detail").style.display = "none";
    document.getElementById("fleet-view").style.display = "block";
  });

  function runSubnet(subnetId) {
    var btn = document.querySelector('.run-btn[data-run="' + subnetId + '"]');
    var log = document.getElementById("run-log-" + subnetId);
    btn.disabled = true;
    btn.textContent = "Running…";
    log.style.display = "block";
    log.textContent = "";

    fetch("/trigger?subnet_id=" + subnetId, {
      method: "POST",
      headers: authHeaders(),
    }).then(function (res) {
      if (!res.body) throw new Error("no response body");
      var reader = res.body.getReader();
      var decoder = new TextDecoder();

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return;
          log.textContent += decoder.decode(result.value, { stream: true });
          log.scrollTop = log.scrollHeight;
          return pump();
        });
      }
      return pump();
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Run";
      loadRunHistory(subnetId);
      loadData();
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = "Run";
      log.textContent += "\\n[error: " + err.message + "]";
    });
  }

  function showGate(errorMsg) {
    app.style.display = "none";
    gate.style.display = "block";
    if (errorMsg) {
      gateError.textContent = errorMsg;
      gateError.style.display = "block";
    } else {
      gateError.style.display = "none";
    }
  }

  function showApp() {
    gate.style.display = "none";
    app.style.display = "block";
    loadData();
  }

  document.getElementById("gate-submit").addEventListener("click", function () {
    var v = secretInput.value.trim();
    if (!v) return;
    setSecret(v);
    showApp();
  });
  secretInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("gate-submit").click();
  });

  if (getSecret()) {
    showApp();
  } else {
    showGate();
  }
})();
</script>
</body>
</html>
`;
