export const STATS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>x402 Facilitator — Stats</title>
<style>
  :root { --bg: #0a0a0a; --card: #141414; --border: #222; --text: #e0e0e0; --muted: #888; --green: #4ade80; --red: #f87171; --blue: #60a5fa; --yellow: #fbbf24; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
  .subtitle { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 4px; }
  .card .value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .card .unit { font-size: 14px; font-weight: 400; color: var(--muted); }
  .green { color: var(--green); } .red { color: var(--red); } .blue { color: var(--blue); } .yellow { color: var(--yellow); }
  h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted); font-weight: 500; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  td { padding: 8px 12px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
  .section { margin-bottom: 32px; }
  .mono { font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 12px; }
  .empty { color: var(--muted); font-style: italic; padding: 24px; text-align: center; }
  .refresh { color: var(--muted); font-size: 11px; float: right; }
</style>
</head>
<body>
<h1>x402 Facilitator <span class="refresh" id="refresh">auto-refresh 10s</span></h1>
<p class="subtitle" id="uptime">Loading...</p>

<div class="grid" id="cards"></div>

<div class="section">
  <h2>Endpoints</h2>
  <table>
    <thead><tr><th>Path</th><th>Requests</th><th>Success</th><th>Failed</th><th>Avg Latency</th></tr></thead>
    <tbody id="endpoints"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody>
  </table>
</div>

<div class="section">
  <h2>Recent Settlements</h2>
  <table>
    <thead><tr><th>Time</th><th>Payer</th><th>Amount</th><th>Resource</th><th>Tx ID</th></tr></thead>
    <tbody id="settlements"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody>
  </table>
</div>

<script>
function fmt(n) { return n.toLocaleString(); }
function fmtDuration(s) {
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
  const h = Math.floor(s/3600);
  return h + 'h ' + Math.floor((s%3600)/60) + 'm';
}
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

async function refresh() {
  try {
    const r = await fetch('/metrics');
    const m = await r.json();
    const t = m.totals;

    document.getElementById('uptime').textContent =
      'Up ' + fmtDuration(m.uptime) + ' — started ' + new Date(m.startedAt).toLocaleString();

    document.getElementById('cards').innerHTML = [
      { label: 'Total Requests', value: fmt(t.requests), cls: '' },
      { label: 'Verifications', value: fmt(t.verifications), cls: 'blue' },
      { label: 'Settlements', value: fmt(t.settlementsSuccess), cls: 'green' },
      { label: 'Failed', value: fmt(t.settlementsFailed), cls: 'red' },
      { label: 'HBD Settled', value: t.hbdSettled.toFixed(3), cls: 'yellow', unit: 'HBD' },
      { label: 'Unique Payers', value: fmt(t.uniquePayers), cls: '' },
    ].map(c =>
      '<div class="card"><div class="label">' + c.label + '</div>' +
      '<div class="value ' + c.cls + '">' + c.value +
      (c.unit ? ' <span class="unit">' + c.unit + '</span>' : '') +
      '</div></div>'
    ).join('');

    const eps = Object.entries(m.endpoints);
    document.getElementById('endpoints').innerHTML = eps.length === 0
      ? '<tr><td colspan="5" class="empty">No requests yet</td></tr>'
      : eps.map(function(e) {
          const p = e[0], d = e[1];
          const avg = d.requests > 0 ? Math.round(d.totalLatencyMs / d.requests) : 0;
          return '<tr><td class="mono">' + p + '</td><td>' + fmt(d.requests) +
            '</td><td class="green">' + fmt(d.success) +
            '</td><td class="red">' + fmt(d.failures) +
            '</td><td>' + avg + 'ms</td></tr>';
        }).join('');

    const stl = m.recentSettlements;
    document.getElementById('settlements').innerHTML = stl.length === 0
      ? '<tr><td colspan="5" class="empty">No settlements yet</td></tr>'
      : stl.map(function(s) {
          const short = s.txId ? s.txId.substring(0, 12) + '...' : '';
          return '<tr><td>' + fmtTime(s.timestamp) + '</td><td class="mono">' + s.payer +
            '</td><td class="yellow">' + s.amount +
            '</td><td class="mono">' + (s.resource || '-') +
            '</td><td class="mono">' + short + '</td></tr>';
        }).join('');
  } catch(e) {
    document.getElementById('uptime').textContent = 'Error loading metrics';
  }
}

refresh();
setInterval(refresh, 10000);
</script>
</body>
</html>`;
