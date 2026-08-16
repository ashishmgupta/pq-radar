export const READINESS_SERVICES_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar — SSH &amp; FTPS</title>
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

  .toolbar { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
  .toolbar button {
    padding: 8px 14px; font-size: 13px; font-weight: 600; border: 1px solid var(--border);
    border-radius: 6px; background: var(--surface-1); color: var(--text-primary); cursor: pointer;
  }
  .toolbar button:disabled { opacity: 0.5; cursor: default; }
  .toolbar .status { font-size: 12px; color: var(--text-muted); align-self: center; }

  .log-panel {
    display: none;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 10px 12px; margin: 0 0 20px; max-height: 260px; overflow-y: auto;
    font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 12px; line-height: 1.6;
    color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;
  }
  .log-panel .hdr { color: var(--text-primary); font-weight: 600; }

  .health-strip { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 20px; }
  .health-chip {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 16px; flex: 1 1 200px; min-width: 180px;
  }
  .health-chip.failed { border-color: var(--status-critical); background: rgba(230,103,103,0.06); }
  .health-chip .hc-label { font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; }
  .health-chip .hc-line { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .health-chip .hc-line.warn { color: var(--status-warning); font-weight: 600; }
  .health-chip .hc-line.bad { color: var(--status-critical); font-weight: 600; }

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
  .detail-panels.cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: var(--gridline); }
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
      <h1 class="page-title" id="page-title">SSH &amp; FTPS</h1>
      <p class="subtitle">Separate from the hostname checks on the overview page &mdash; these probe origin IPs directly on port 22 (SSH), 990 (implicit FTPS) and 21 (explicit FTPS / AUTH TLS). "PQ" means a different specific algorithm per protocol &mdash; click a row for the exact value.</p>

      <div class="health-strip" id="run-health-services"></div>

      <div class="toolbar">
        <button id="scan-services-btn" type="button">Scan SSH + FTPS</button>
        <button id="refresh-btn" type="button">Refresh</button>
        <span class="status" id="toolbar-status"></span>
      </div>
      <pre id="services-log" class="log-panel"></pre>

      <div id="loading">Loading…</div>
      <div id="error-banner" style="display:none"></div>

      <div id="content" style="display:none">
        <div class="table-wrap">
          <table>
            <colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%"></colgroup>
            <thead>
              <tr><th>Origin IP</th><th>SSH (22)</th><th>FTPS Implicit (990)</th><th>FTPS Explicit (21)</th></tr>
            </thead>
            <tbody id="service-rows"></tbody>
          </table>
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
    pq:            { cls: "good",     icon: "\\u2713", label: "PQ" },
    classical:     { cls: "warning",  icon: "\\u25CF", label: "Classical" },
    downgrade:     { cls: "critical", icon: "\\u25BC", label: "Downgrade" },
    intolerant:    { cls: "critical", icon: "\\u2715", label: "Intolerant" },
    indeterminate: { cls: "unknown",  icon: "?",        label: "Indeterminate" },
    unreachable:   { cls: "critical", icon: "\\u2715",  label: "Not Live" }
  };

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

  function healthChipHtml(label, entry) {
    if (!entry) entry = {};
    var cls = "";
    var lines = [];
    if (!entry.latest_attempt_ts) {
      lines.push('<div class="hc-line">Never scanned</div>');
    } else if (entry.latest_attempt_status === "failed") {
      cls = "failed";
      lines.push('<div class="hc-line bad">Last attempt failed ' + escapeHtml(timeAgo(entry.latest_attempt_ts)) + '</div>');
      if (entry.latest_attempt_error) {
        lines.push('<div class="hc-line bad">' + escapeHtml(entry.latest_attempt_error) + '</div>');
      }
      lines.push(entry.latest_success_ts
        ? '<div class="hc-line warn">Showing data from ' + escapeHtml(timeAgo(entry.latest_success_ts)) + '</div>'
        : '<div class="hc-line">No successful scan yet</div>');
    } else {
      lines.push('<div class="hc-line">Updated ' + escapeHtml(timeAgo(entry.latest_success_ts || entry.latest_attempt_ts)) + '</div>');
    }
    return '<div class="health-chip ' + cls + '"><div class="hc-label">' + escapeHtml(label) + '</div>' + lines.join("") + '</div>';
  }

  function renderRunHealth(health) {
    var entries = [
      { key: "ssh", label: "SSH" },
      { key: "ftps_implicit", label: "FTPS Implicit" },
      { key: "ftps_explicit", label: "FTPS Explicit" }
    ];
    document.getElementById("run-health-services").innerHTML = entries.map(function (e) {
      return healthChipHtml(e.label, health && health[e.key]);
    }).join("");
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

  var cidrParam = qparam("cidr") || "";
  var labelParam = qparam("label") || cidrParam;

  var lastOrigins = [];

  function renderServiceRows(origins) {
    var filtered = cidrParam ? origins.filter(function (o) { return ipInCidr(o.ip, cidrParam); }) : origins;
    lastOrigins = filtered;
    var el = document.getElementById("service-rows");
    if (!filtered.length) {
      el.innerHTML = '<tr><td colspan="4" class="muted">No known origin IPs yet.</td></tr>';
      return;
    }
    el.innerHTML = filtered.map(function (o, i) {
      return '<tr class="host-row" data-svc-idx="' + i + '">' +
        '<td>' + escapeHtml(o.ip) + '</td>' +
        '<td>' + outcomeBadge(o.ssh_outcome) + '</td>' +
        '<td>' + outcomeBadge(o.ftps_implicit_outcome) + '</td>' +
        '<td>' + outcomeBadge(o.ftps_explicit_outcome) + '</td>' +
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
    panelEl.innerHTML = '<h4>' + escapeHtml(title) + '</h4>' +
      '<p class="kv"><b>Outcome:</b> ' + outcomeBadge(r.outcome) + '</p>' +
      (r.protocol ? '<p class="kv"><b>Protocol:</b> ' + escapeHtml(r.protocol) + '</p>' : '') +
      (r.negotiated_group ? '<p class="kv"><b>Group:</b> ' + escapeHtml(r.negotiated_group) + '</p>' : '') +
      '<p class="kv"><b>Request</b></p><pre>' + (r.command ? escapeHtml(r.command) : '(none)') + '</pre>' +
      '<p class="kv"><b>Response</b></p><pre>' + (r.raw ? escapeHtml(r.raw) : '(empty)') + '</pre>';
  }

  function toggleServiceDetailRow(tr, o) {
    var next = tr.nextElementSibling;
    if (next && next.classList.contains("detail-row")) {
      next.parentNode.removeChild(next);
      return;
    }
    var openRow = document.querySelector("#service-rows tr.detail-row");
    if (openRow) openRow.parentNode.removeChild(openRow);

    var panels = [
      { title: "SSH (22)", runId: o.ssh_run_id, ip: o.ip },
      { title: "FTPS Implicit (990)", runId: o.ftps_implicit_run_id, ip: o.ip },
      { title: "FTPS Explicit (21)", runId: o.ftps_explicit_run_id, ip: o.ip }
    ];

    var detailTr = document.createElement("tr");
    detailTr.className = "detail-row";
    var td = document.createElement("td");
    td.colSpan = 4;
    td.innerHTML = '<div class="detail-panels cols-3">' +
      panels.map(function (p) {
        return '<div class="detail-panel">' +
          (p.runId
            ? '<h4>' + escapeHtml(p.title) + '</h4><p class="muted">Loading\\u2026</p>'
            : '<h4>' + escapeHtml(p.title) + '</h4><p class="muted">No probe recorded for this leg yet.</p>') +
          '</div>';
      }).join("") +
      '</div>';
    detailTr.appendChild(td);
    tr.parentNode.insertBefore(detailTr, tr.nextSibling);

    var panelEls = td.querySelectorAll(".detail-panel");
    panels.forEach(function (p, i) {
      if (p.runId) {
        fetchDetail(p.runId, p.ip).then(function (r) { fillDetailPanel(panelEls[i], p.title, r); });
      }
    });
  }

  document.getElementById("service-rows").addEventListener("click", function (e) {
    var tr = e.target.closest("tr.host-row");
    if (!tr) return;
    var idx = Number(tr.getAttribute("data-svc-idx"));
    var o = lastOrigins[idx];
    if (!o) return;
    toggleServiceDetailRow(tr, o);
  });

  var logEl = document.getElementById("services-log");

  function logLine(text, isHeader) {
    var line = document.createElement("div");
    if (isHeader) line.className = "hdr";
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function streamAction(path) {
    return fetch(path, { method: "POST", headers: authHeaders() }).then(function (res) {
      if (!res.body) throw new Error("request failed: " + res.status);
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            if (buffer.trim()) logLine(buffer);
            if (!res.ok) throw new Error("request failed: " + res.status);
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var idx;
          while ((idx = buffer.indexOf("\\n")) >= 0) {
            var line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 1);
            if (line.trim()) logLine(line);
          }
          return pump();
        });
      }

      return pump();
    });
  }

  function load() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("error-banner").style.display = "none";
    fetch("/api/readiness/services", { headers: authHeaders() })
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
        renderServiceRows(data.origins || []);
        renderRunHealth(data.run_health || {});
      })
      .catch(function (err) {
        document.getElementById("loading").style.display = "none";
        var banner = document.getElementById("error-banner");
        banner.style.display = "block";
        banner.textContent = "Failed to load data: " + err.message;
      });
  }

  document.getElementById("scan-services-btn").addEventListener("click", function () {
    var btn = document.getElementById("scan-services-btn");
    var status = document.getElementById("toolbar-status");
    btn.disabled = true;
    status.textContent = "Scanning SSH + FTPS\\u2026";
    logEl.textContent = "";
    logEl.style.display = "block";

    logLine("=== SSH (22) ===", true);
    streamAction("/api/zones/scan-ssh")
      .then(function () {
        logLine("=== FTPS implicit (990) ===", true);
        return streamAction("/api/zones/scan-ftps?mode=implicit");
      })
      .then(function () {
        logLine("=== FTPS explicit (21) ===", true);
        return streamAction("/api/zones/scan-ftps?mode=explicit");
      })
      .then(function () {
        status.textContent = "SSH + FTPS scan done";
        btn.disabled = false;
        load();
      })
      .catch(function (err) {
        logLine("--- error: " + err.message + " ---");
        status.textContent = "SSH + FTPS scan failed: " + err.message;
        btn.disabled = false;
      });
  });

  document.getElementById("refresh-btn").addEventListener("click", load);

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
    if (cidrParam) {
      document.getElementById("page-title").textContent = labelParam;
    }
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
