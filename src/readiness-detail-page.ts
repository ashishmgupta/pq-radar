export const READINESS_DETAIL_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar — Readiness Detail</title>
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
  .page { max-width: 1400px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
  h1.page-title { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
  .subtitle { color: var(--text-secondary); font-size: 14px; margin: 0 0 8px; }

  #gate {
    max-width: 360px; margin: 80px auto; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 8px; padding: 24px;
  }
  #gate p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; }
  #gate input {
    width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--surface-2); color: var(--text-primary); margin-bottom: 12px;
  }
  #gate button { width: 100%; padding: 8px 10px; font-size: 14px; font-weight: 600; border: none;
    border-radius: 6px; background: var(--status-good); color: #fff; cursor: pointer; }
  #gate .error { color: var(--status-critical); font-size: 13px; margin: -4px 0 12px; }

  .back-link {
    background: none; border: none; cursor: pointer; padding: 0; margin: 0 0 14px;
    font: inherit; font-size: 13px; color: var(--text-secondary); text-decoration: none;
    display: inline-flex; align-items: center; gap: 4px;
  }
  .back-link:hover { color: var(--text-primary); text-decoration: underline; }

  #app { display: none; }
  #loading, #error-banner { color: var(--text-secondary); font-size: 14px; }
  #error-banner { color: var(--status-critical); }

  .muted { color: var(--text-muted); }
  .subnet-health-note { font-size: 12px; color: var(--text-muted); margin: 0 0 14px; }
  .subnet-health-note.warn { color: var(--status-warning); }
  .subnet-health-note.bad { color: var(--status-critical); }

  .legend {
    display: flex; flex-wrap: wrap; gap: 8px 20px; align-items: center;
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 16px; margin: 0 0 16px; font-size: 12px; color: var(--text-secondary);
  }
  .legend .item { display: flex; align-items: center; gap: 6px; }

  .filter-toggle { display: flex; gap: 6px; margin: 0 0 16px; }
  .filter-toggle button {
    padding: 6px 14px; font-size: 12px; font-weight: 600; border: 1px solid var(--border);
    border-radius: 999px; background: var(--surface-1); color: var(--text-secondary); cursor: pointer;
  }
  .filter-toggle button.active { background: var(--status-good); color: #fff; border-color: var(--status-good); }

  .table-wrap { width: 100%; overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; background: var(--surface-1); font-size: 13px; }
  thead th {
    text-align: left; font-size: 12px; font-weight: 600; color: var(--text-muted);
    padding: 10px 12px; border-bottom: 1px solid var(--gridline); white-space: nowrap;
  }
  tbody td { padding: 9px 12px; border-bottom: 1px solid var(--gridline); vertical-align: top; overflow-wrap: break-word; }
  tbody tr:last-child td { border-bottom: none; }

  .badge {
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px;
    border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap;
  }
  .badge.good     { background: var(--status-good); }
  .badge.warning  { background: var(--status-warning); color: #3a2a00; }
  .badge.critical { background: var(--status-critical); }
  .badge.unknown  { background: var(--status-unknown); }

  tbody tr.host-row { cursor: pointer; }
  tbody tr.host-row:hover { background: var(--surface-2); }
  tr.detail-row td { padding: 0; border-bottom: 1px solid var(--gridline); }
  .detail-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--gridline); }
  .detail-panel { background: var(--surface-2); padding: 12px 16px; }
  .detail-panel h4 { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .detail-panel .kv { font-size: 12px; color: var(--text-secondary); margin: 0 0 4px; }
  .detail-panel .kv b { color: var(--text-muted); font-weight: 600; }
  .detail-panel pre {
    margin: 8px 0 0; padding: 8px 10px; background: var(--surface-1); border: 1px solid var(--border);
    border-radius: 6px; font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 11px;
    line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
    max-height: 260px; overflow-y: auto;
  }
  .detail-panel .muted { color: var(--text-muted); font-size: 12px; }
</style>
</head>
<body>
<div class="viz-root">
  <div class="page">

    <div id="gate">
      <h1>PQ Radar — Readiness</h1>
      <p>Enter the API secret to view end-to-end readiness.</p>
      <div id="gate-error" class="error" style="display:none">Invalid secret.</div>
      <input id="secret-input" type="password" placeholder="API secret" autocomplete="off">
      <button id="gate-submit">Unlock</button>
    </div>

    <div id="app">
      <a class="back-link" href="/readiness">&larr; Back to Overview</a>
      <h1 class="page-title" id="detail-title">Details</h1>
      <p class="subtitle" id="detail-subtitle"></p>

      <div id="loading">Loading…</div>
      <div id="error-banner" style="display:none"></div>

      <div id="content" style="display:none">
        <div id="view-hostnames" style="display:none">
          <div class="legend" id="outcome-legend"></div>
          <div class="filter-toggle" id="env-filter">
            <button data-env="all" type="button">All</button>
            <button data-env="dev" type="button">Dev</button>
            <button data-env="qa" type="button">QA</button>
          </div>
          <div class="table-wrap">
            <table>
              <colgroup>
                <col style="width:18%"><col style="width:14%"><col style="width:9%">
                <col style="width:14%"><col style="width:12%"><col style="width:9%"><col style="width:10%">
              </colgroup>
              <thead>
                <tr><th>Hostname</th><th>Zone</th><th>Env</th><th>Client to Edge</th><th>Origin IP</th><th>Origin (Direct)</th><th>Overall</th></tr>
              </thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
          <p class="subtitle" style="margin-top:8px;">Click a row to see the request/response detail for that hostname.</p>
        </div>

        <div id="view-orphans" style="display:none">
          <p class="subtitle" style="margin-top:0;">Live origins with no known Cloudflare zone pointing at them.</p>
          <div class="table-wrap">
            <table>
              <colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup>
              <thead>
                <tr><th>IP</th><th>Outcome</th><th>Protocol</th><th>Group</th></tr>
              </thead>
              <tbody id="orphan-rows"></tbody>
            </table>
          </div>
        </div>

        <div id="view-subnet-origin" style="display:none">
          <p class="subnet-health-note" id="subnet-health-note"></p>
          <div class="table-wrap">
            <table>
              <colgroup><col style="width:20%"><col style="width:35%"><col style="width:20%"><col style="width:12.5%"><col style="width:12.5%"></colgroup>
              <thead>
                <tr><th>IP</th><th>Hostname</th><th>Outcome</th><th>Protocol</th><th>Group</th></tr>
              </thead>
              <tbody id="subnet-origin-rows"></tbody>
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
  var gate = document.getElementById("gate");
  var app = document.getElementById("app");
  var gateError = document.getElementById("gate-error");
  var secretInput = document.getElementById("secret-input");

  var OUTCOME_META = {
    pq:            { cls: "good",     icon: "\\u2713", label: "PQ",           desc: "TLS 1.3, negotiated the post-quantum hybrid group" },
    classical:     { cls: "warning",  icon: "\\u25CF", label: "Classical",    desc: "TLS 1.3, but a non-PQ group (not quantum-resistant)" },
    downgrade:     { cls: "critical", icon: "\\u25BC", label: "Downgrade",    desc: "Only TLS 1.2 negotiated" },
    intolerant:    { cls: "critical", icon: "\\u2715", label: "Intolerant",   desc: "Broke on the PQ ClientHello, worked once PQ was dropped" },
    indeterminate: { cls: "unknown",  icon: "?",        label: "Indeterminate", desc: "Reachable, but no clean handshake result" },
    unreachable:   { cls: "critical", icon: "\\u2715",   label: "Not Live",   desc: "TCP connect failed \\u2014 host didn\\u2019t respond" }
  };
  var NOT_SCANNED_META = { cls: "unknown", icon: "?", label: "Not scanned", desc: "Never included in a scan run yet" };

  function getSecret() { return sessionStorage.getItem(STORAGE_KEY); }
  function setSecret(v) { sessionStorage.setItem(STORAGE_KEY, v); }
  function clearSecret() { sessionStorage.removeItem(STORAGE_KEY); }
  function authHeaders() { return { Authorization: "Bearer " + getSecret() }; }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function outcomeBadge(outcome) {
    if (!outcome) return '<span class="badge unknown">? Not scanned</span>';
    var meta = OUTCOME_META[outcome] || { cls: "unknown", icon: "?", label: outcome };
    return '<span class="badge ' + meta.cls + '">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>';
  }

  function renderLegend() {
    var entries = ["pq", "classical", "downgrade", "intolerant", "indeterminate", "unreachable"]
      .map(function (k) { return OUTCOME_META[k]; })
      .concat([NOT_SCANNED_META]);
    var el = document.getElementById("outcome-legend");
    el.innerHTML = entries.map(function (meta) {
      return '<span class="item"><span class="badge ' + meta.cls + '">' + meta.icon + ' ' + escapeHtml(meta.label) + '</span>' +
        '<span>' + escapeHtml(meta.desc) + '</span></span>';
    }).join("");
  }

  function overall(h) {
    if (!h.edge_outcome || !h.origin_outcome) return { cls: "unknown", icon: "?", label: "Incomplete data" };
    var edgePq = h.edge_outcome === "pq";
    var originPq = h.origin_outcome === "pq";
    if (edgePq && originPq) return { cls: "good", icon: "\\u2713", label: "Full" };
    if (edgePq || originPq) return { cls: "warning", icon: "\\u25CF", label: "Mixed" };
    return { cls: "critical", icon: "\\u25BC", label: "None" };
  }

  function timeAgo(iso) {
    if (!iso) return null;
    var diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 0) diffMs = 0;
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    var days = Math.floor(hours / 24);
    return days + "d ago";
  }

  function subnetHealthLine(s) {
    if (!s.latest_attempt_ts) return { cls: "", text: "never scanned" };
    if (s.latest_attempt_status === "failed") {
      var suffix = s.latest_success_ts ? ", showing data from " + timeAgo(s.latest_success_ts) : ", no successful scan yet";
      return { cls: "bad", text: "failed " + timeAgo(s.latest_attempt_ts) + suffix };
    }
    return { cls: "", text: "updated " + timeAgo(s.latest_success_ts || s.latest_attempt_ts) };
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

  function qparam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  var view = qparam("view") || "hostnames";
  var overallFilter = qparam("overall") || "all";
  var cidrParam = qparam("cidr") || "";
  var labelParam = qparam("label") || cidrParam;
  var currentEnvFilter = qparam("env") || "all";

  // ?redact=1 swaps real hostnames/IPs/zone names for consistent fake ones,
  // purely client-side, for taking clean screenshots. The same real value
  // always maps to the same fake value (via fakeMap), so a hostname shown in
  // the table and the same hostname shown inside its expanded openssl
  // request/response text stay consistent with each other.
  var redactMode = qparam("redact") === "1";
  var fakeMap = {};
  var fakeCounter = 0;
  function looksLikeIp(s) {
    return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s || "");
  }
  function fakeFor(real, kind) {
    if (!real) return real;
    if (Object.prototype.hasOwnProperty.call(fakeMap, real)) return fakeMap[real];
    fakeCounter++;
    var fake;
    if (kind === "ip") fake = "192.0.2." + ((fakeCounter % 254) + 1);
    else if (kind === "zone") fake = "zone" + fakeCounter + ".example.com";
    else fake = "host" + fakeCounter + ".example.com";
    fakeMap[real] = fake;
    return fake;
  }
  function maskValue(real, kind) {
    return redactMode ? fakeFor(real, kind) : real;
  }
  // For free-text blobs (openssl command/response output) rather than a single
  // known field: replaces any already-masked real value first (so it matches
  // the table), then a blanket sweep for any literal IPv4 address, so cert
  // fields or anything else embedding one still gets caught even without an
  // exact field match.
  function maskBlob(text) {
    if (!redactMode || !text) return text;
    var masked = text;
    Object.keys(fakeMap).forEach(function (real) {
      masked = masked.split(real).join(fakeMap[real]);
    });
    masked = masked.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, function (m) { return fakeFor(m, "ip"); });
    return masked;
  }

  var lastHosts = [];
  var lastFiltered = [];

  function renderRows(hosts) {
    var filtered = currentEnvFilter === "all"
      ? hosts
      : hosts.filter(function (h) { return h.account_label === currentEnvFilter; });
    if (overallFilter !== "all") {
      filtered = filtered.filter(function (h) { return overall(h).label === overallFilter; });
    }
    lastFiltered = filtered;
    var el = document.getElementById("rows");
    el.innerHTML = filtered.map(function (h, i) {
      var o = overall(h);
      var hostname = maskValue(h.hostname, "host");
      var zoneName = maskValue(h.zone_name, "zone");
      var originIp = maskValue(h.origin_ip, looksLikeIp(h.origin_ip) ? "ip" : "host");
      return '<tr class="host-row" data-idx="' + i + '">' +
        '<td>' + escapeHtml(hostname) + '</td>' +
        '<td class="muted">' + escapeHtml(zoneName) + '</td>' +
        '<td class="muted">' + escapeHtml((h.account_label || "").toUpperCase()) + '</td>' +
        '<td>' + outcomeBadge(h.edge_outcome) + '</td>' +
        '<td>' + escapeHtml(originIp) + '</td>' +
        '<td>' + outcomeBadge(h.origin_outcome) + '</td>' +
        '<td><span class="badge ' + o.cls + '">' + o.icon + ' ' + escapeHtml(o.label) + '</span></td>' +
        '</tr>';
    }).join("");
  }

  var detailCache = {};

  function fetchDetail(runId, ip) {
    var key = runId + "|" + ip;
    if (Object.prototype.hasOwnProperty.call(detailCache, key)) return Promise.resolve(detailCache[key]);
    return fetch("/api/results/detail?run_id=" + encodeURIComponent(runId) + "&ip=" + encodeURIComponent(ip), { headers: authHeaders() })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        var result = data && data.result ? data.result : null;
        detailCache[key] = result;
        return result;
      })
      .catch(function () { return null; });
  }

  function fillDetailPanel(panelEl, title, r) {
    if (!r) {
      panelEl.innerHTML = '<h4>' + escapeHtml(title) + '</h4><p class="muted">No probe recorded for this leg yet.</p>';
      return;
    }
    var command = maskBlob(r.command);
    var raw = maskBlob(r.raw);
    panelEl.innerHTML = '<h4>' + escapeHtml(title) + '</h4>' +
      '<p class="kv"><b>Outcome:</b> ' + outcomeBadge(r.outcome) + '</p>' +
      (r.protocol ? '<p class="kv"><b>Protocol:</b> ' + escapeHtml(r.protocol) + '</p>' : '') +
      (r.negotiated_group ? '<p class="kv"><b>Group:</b> ' + escapeHtml(r.negotiated_group) + '</p>' : '') +
      '<p class="kv"><b>Request</b></p><pre>' + (command ? escapeHtml(command) : '(none)') + '</pre>' +
      '<p class="kv"><b>Response</b></p><pre>' + (raw ? escapeHtml(raw) : '(empty)') + '</pre>';
  }

  function toggleDetailRow(tr, h) {
    var next = tr.nextElementSibling;
    if (next && next.classList.contains("detail-row")) {
      next.parentNode.removeChild(next);
      return;
    }
    var openRow = document.querySelector("#rows tr.detail-row");
    if (openRow) openRow.parentNode.removeChild(openRow);

    var detailTr = document.createElement("tr");
    detailTr.className = "detail-row";
    var td = document.createElement("td");
    td.colSpan = 7;
    td.innerHTML = '<div class="detail-panels">' +
      '<div class="detail-panel">' + (h.edge_run_id ? '<h4>Client to Edge</h4><p class="muted">Loading\\u2026</p>' : '<h4>Client to Edge</h4><p class="muted">No probe recorded for this leg yet.</p>') + '</div>' +
      '<div class="detail-panel">' + (h.origin_run_id ? '<h4>Origin (Direct)</h4><p class="muted">Loading\\u2026</p>' : '<h4>Origin (Direct)</h4><p class="muted">No probe recorded for this leg yet.</p>') + '</div>' +
      '</div>';
    detailTr.appendChild(td);
    tr.parentNode.insertBefore(detailTr, tr.nextSibling);

    var panels = td.querySelectorAll(".detail-panel");
    if (h.edge_run_id) {
      fetchDetail(h.edge_run_id, h.hostname).then(function (r) { fillDetailPanel(panels[0], "Client to Edge", r); });
    }
    if (h.origin_run_id) {
      fetchDetail(h.origin_run_id, h.origin_ip).then(function (r) { fillDetailPanel(panels[1], "Origin (Direct)", r); });
    }
  }

  document.getElementById("rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr.host-row");
    if (!tr) return;
    var idx = Number(tr.getAttribute("data-idx"));
    var h = lastFiltered[idx];
    if (!h) return;
    toggleDetailRow(tr, h);
  });

  function renderOrphans(orphans) {
    var el = document.getElementById("orphan-rows");
    if (!orphans.length) {
      el.innerHTML = '<tr><td colspan="4" class="muted">None &mdash; every live origin is covered by a known zone.</td></tr>';
      return;
    }
    el.innerHTML = orphans.map(function (o) {
      return '<tr>' +
        '<td>' + escapeHtml(o.ip) + '</td>' +
        '<td>' + outcomeBadge(o.outcome) + '</td>' +
        '<td>' + (o.protocol ? escapeHtml(o.protocol) : '<span class="muted">\\u2014</span>') + '</td>' +
        '<td>' + (o.negotiated_group ? escapeHtml(o.negotiated_group) : '<span class="muted">\\u2014</span>') + '</td>' +
        '</tr>';
    }).join("");
  }

  function renderSubnetOriginRows(originResults, cidr) {
    var matched = originResults.filter(function (r) { return ipInCidr(r.ip, cidr); });
    var el = document.getElementById("subnet-origin-rows");
    if (!matched.length) {
      el.innerHTML = '<tr><td colspan="5" class="muted">No origin results yet for this network.</td></tr>';
      return;
    }
    el.innerHTML = matched.map(function (r) {
      return '<tr>' +
        '<td>' + escapeHtml(r.ip) + '</td>' +
        '<td class="muted">' + (r.hostnames ? escapeHtml(r.hostnames) : '<span class="muted">\\u2014</span>') + '</td>' +
        '<td>' + outcomeBadge(r.outcome) + '</td>' +
        '<td>' + (r.protocol ? escapeHtml(r.protocol) : '<span class="muted">\\u2014</span>') + '</td>' +
        '<td>' + (r.negotiated_group ? escapeHtml(r.negotiated_group) : '<span class="muted">\\u2014</span>') + '</td>' +
        '</tr>';
    }).join("");
  }

  document.getElementById("env-filter").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-env]");
    if (!btn) return;
    currentEnvFilter = btn.getAttribute("data-env");
    document.querySelectorAll("#env-filter button").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    renderRows(lastHosts);
  });

  function setTitle() {
    var titleEl = document.getElementById("detail-title");
    var subEl = document.getElementById("detail-subtitle");
    if (view === "hostnames") {
      var parts = [];
      if (overallFilter !== "all") parts.push(overallFilter);
      if (currentEnvFilter !== "all") parts.push(currentEnvFilter.toUpperCase());
      titleEl.textContent = parts.length ? parts.join(" \\u2014 ") + " Hostnames" : "All Hostnames";
      subEl.textContent = "End-to-end readiness: Client to Edge and Origin (Direct)";
    } else if (view === "orphans") {
      titleEl.textContent = "Uncovered Origins";
      subEl.textContent = "Live origins we scanned directly that no known Cloudflare zone points at.";
    } else if (view === "subnet-origin") {
      titleEl.textContent = labelParam || cidrParam;
      subEl.textContent = "All direct-to-origin results for this network.";
    }
  }

  function showView() {
    document.getElementById("view-hostnames").style.display = view === "hostnames" ? "block" : "none";
    document.getElementById("view-orphans").style.display = view === "orphans" ? "block" : "none";
    document.getElementById("view-subnet-origin").style.display = view === "subnet-origin" ? "block" : "none";
  }

  function load() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("error-banner").style.display = "none";
    fetch("/api/readiness", { headers: authHeaders() })
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
        showView();

        if (view === "hostnames") {
          lastHosts = data.hosts || [];
          renderLegend();
          var envBtn = document.querySelector('#env-filter button[data-env="' + currentEnvFilter + '"]');
          document.querySelectorAll("#env-filter button").forEach(function (b) { b.classList.remove("active"); });
          if (envBtn) envBtn.classList.add("active");
          renderRows(lastHosts);
        } else if (view === "orphans") {
          renderOrphans(data.orphans || []);
        } else if (view === "subnet-origin") {
          var health = (data.run_health && data.run_health.direct_to_origin) || {};
          var subnetHealth = health.subnets ? health.subnets.filter(function (s) { return s.cidr === cidrParam; })[0] : null;
          var noteEl = document.getElementById("subnet-health-note");
          if (subnetHealth) {
            var line = subnetHealthLine(subnetHealth);
            noteEl.textContent = "Origin scan: " + line.text;
            noteEl.className = "subnet-health-note" + (line.cls ? " " + line.cls : "");
          } else {
            noteEl.textContent = "";
            noteEl.className = "subnet-health-note";
          }
          renderSubnetOriginRows(data.origin_results || [], cidrParam);
        }
      })
      .catch(function (err) {
        document.getElementById("loading").style.display = "none";
        var banner = document.getElementById("error-banner");
        banner.style.display = "block";
        banner.textContent = "Failed to load data: " + err.message;
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
    if (redactMode) {
      var banner = document.createElement("div");
      banner.textContent = "\\uD83D\\uDD12 Redacted view \\u2014 hostnames/IPs are fake, for screenshots only";
      banner.style.cssText = "background:#3a2a00;color:#fab219;border:1px solid #fab219;border-radius:6px;padding:8px 12px;font-size:12px;margin-bottom:16px;";
      app.insertBefore(banner, app.firstChild);
    }
    setTitle();
    load();
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
