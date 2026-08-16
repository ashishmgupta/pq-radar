export const SCHEDULE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PQ Radar — Schedule</title>
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
  .page { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 14px; margin: 0 0 28px; }
  a.back { font-size: 13px; color: var(--text-secondary); text-decoration: underline; }

  #gate {
    max-width: 360px; margin: 80px auto; background: var(--surface-1);
    border: 1px solid var(--border); border-radius: 8px; padding: 24px;
  }
  #gate p { color: var(--text-secondary); font-size: 14px; margin: 0 0 16px; }
  #gate input {
    width: 100%; padding: 8px 10px; font-size: 14px; border: 1px solid var(--border);
    border-radius: 6px; background: var(--surface-2); color: var(--text-primary); margin-bottom: 12px;
  }
  #gate button, .refresh-btn {
    padding: 8px 10px; font-size: 14px; font-weight: 600; border: none;
    border-radius: 6px; background: var(--status-good); color: #fff; cursor: pointer;
  }
  #gate button { width: 100%; }
  #gate .error { color: var(--status-critical); font-size: 13px; margin: -4px 0 12px; }

  .toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .refresh-btn { background: var(--surface-1); color: var(--text-secondary); border: 1px solid var(--border); }

  .subnet-card {
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
    padding: 16px; margin-bottom: 12px;
  }
  .subnet-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .subnet-cidr { font-weight: 600; font-variant-numeric: tabular-nums; }
  .subnet-label { color: var(--text-secondary); font-size: 13px; margin-left: 8px; }

  .cron-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--status-warning); color: #3a2a00;
    padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600;
  }

  .schedule-form { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .schedule-form label { font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; }
  .schedule-form select {
    padding: 6px 8px; font-size: 13px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--surface-2); color: var(--text-primary);
  }
  .save-btn {
    padding: 6px 14px; font-size: 13px; font-weight: 600; border: none;
    border-radius: 6px; background: var(--status-good); color: #fff; cursor: pointer;
  }
  .save-btn:disabled { opacity: 0.5; cursor: default; }
  .save-status { font-size: 12px; color: var(--text-muted); }

  #app { display: none; }
  #loading, #error-banner { color: var(--text-secondary); font-size: 14px; }
  #error-banner { color: var(--status-critical); }
</style>
</head>
<body>
<div class="viz-root">
  <div class="page">

    <div id="gate">
      <h1>PQ Radar — Schedule</h1>
      <p>Enter the API secret to configure scan schedules.</p>
      <div id="gate-error" class="error" style="display:none">Invalid secret.</div>
      <input id="secret-input" type="password" placeholder="API secret" autocomplete="off">
      <button id="gate-submit">Unlock</button>
    </div>

    <div id="app">
      <a class="back" href="/">&larr; back to dashboard</a>
      <h1>Schedule</h1>
      <p class="subtitle">Set which UTC hour each subnet scans automatically. Disabled subnets never run on their own.</p>

      <div class="toolbar"><button class="refresh-btn" id="refresh-btn" type="button">Refresh status</button></div>

      <div id="loading">Loading…</div>
      <div id="error-banner" style="display:none"></div>
      <div id="subnets"></div>
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

  function hourOptionsHtml(selected) {
    var opts = [];
    for (var h = 0; h < 24; h++) {
      var label = (h < 10 ? "0" + h : h) + ":00 UTC";
      opts.push('<option value="' + h + '"' + (h === selected ? " selected" : "") + '>' + label + '</option>');
    }
    return opts.join("");
  }

  function renderSubnets(subnets) {
    var el = document.getElementById("subnets");
    el.innerHTML = subnets.map(function (s) {
      var hour = s.schedule_hour_utc === null || s.schedule_hour_utc === undefined ? 0 : s.schedule_hour_utc;
      var runningBadge = s.cron_run_started_at
        ? '<span class="cron-badge">&#9201; Scheduled scan running since ' + escapeHtml(s.cron_run_started_at) + '</span>'
        : "";
      return '<div class="subnet-card" data-subnet-id="' + s.id + '">' +
        '<div class="subnet-head">' +
          '<div><span class="subnet-cidr">' + escapeHtml(s.cidr) + '</span>' +
            (s.label ? '<span class="subnet-label">' + escapeHtml(s.label) + '</span>' : '') +
          '</div>' +
          runningBadge +
        '</div>' +
        '<div class="schedule-form">' +
          '<label><input type="checkbox" class="enabled-toggle"' + (s.schedule_enabled ? " checked" : "") + '> Enabled</label>' +
          '<label>Run at <select class="hour-select">' + hourOptionsHtml(hour) + '</select></label>' +
          '<button class="save-btn" type="button">Save</button>' +
          '<span class="save-status"></span>' +
        '</div>' +
      '</div>';
    }).join("");

    el.querySelectorAll(".subnet-card").forEach(function (card) {
      var id = Number(card.getAttribute("data-subnet-id"));
      var saveBtn = card.querySelector(".save-btn");
      var status = card.querySelector(".save-status");
      saveBtn.addEventListener("click", function () {
        var enabled = card.querySelector(".enabled-toggle").checked;
        var hour = Number(card.querySelector(".hour-select").value);
        saveBtn.disabled = true;
        status.textContent = "Saving…";
        fetch("/api/subnets/schedule", {
          method: "PATCH",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify({ id: id, schedule_enabled: enabled, schedule_hour_utc: hour }),
        })
          .then(function (res) {
            if (!res.ok) throw new Error("save failed: " + res.status);
            return res.json();
          })
          .then(function () {
            status.textContent = "Saved.";
            saveBtn.disabled = false;
            setTimeout(function () { status.textContent = ""; }, 2500);
          })
          .catch(function (err) {
            status.textContent = "Error: " + err.message;
            saveBtn.disabled = false;
          });
      });
    });
  }

  function loadSubnets() {
    document.getElementById("loading").style.display = "block";
    document.getElementById("error-banner").style.display = "none";
    fetch("/api/subnets", { headers: authHeaders() })
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
        renderSubnets(data.subnets || []);
      })
      .catch(function (err) {
        document.getElementById("loading").style.display = "none";
        var banner = document.getElementById("error-banner");
        banner.style.display = "block";
        banner.textContent = "Failed to load subnets: " + err.message;
      });
  }

  document.getElementById("refresh-btn").addEventListener("click", loadSubnets);

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
    loadSubnets();
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
