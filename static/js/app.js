const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const TABS = [
  ['overview', 'Overview'],
  ['zones', 'Zones'],
  ['predictions', 'Predictions'],
  ['interventions', 'Interventions'],
  ['simulator', 'Scenario simulator'],
  ['reports', 'Reports'],
];
const AREAS = {
  A: 'Culture pavilions',
  B: 'Innovation halls',
  C: 'Main stage plaza',
  D: 'Food and markets',
  E: 'Nature garden',
  F: 'Family district',
};
const POLY = {A:[[70,205],[165,105],[240,180],[145,280]],B:[[70,300],[125,250],[205,330],[150,382]],D:[[265,88],[395,88],[395,158],[265,158]],C:[[255,172],[405,172],[405,250],[255,250]],E:[[420,180],[510,95],[600,180],[510,265]],F:[[450,300],[510,250],[585,315],[525,370]]};
const LBL = {A:[153,131],B:[125,392],D:[330,104],C:[330,240],E:[510,84],F:[559,364]};
const PCT = {A:[181,244],B:[172,338],D:[362,138],C:[382,232],E:[562,218],F:[482,338]};

const state = {
  tab: 'overview',
  time: '17:45',
  sel: 'B',
  network: null,
  zoneDetails: {},
  sim: { zone: 'B', action_type: 'redirect', params: { target_zone: 'D', redirect_pct: 30 } },
  simResults: null,
  appliedScenario: null,
  decisionLog: [
    { time: '15:10', zone: 'Zone A', action: 'Opened extra entry lanes at Gate 1', result: 'Peak held below 90%', example: true },
    { time: '16:20', zone: 'Zone D', action: 'Staggered food court release', result: 'Peak held below 90%', example: true },
  ],
};

function riskKey(r) {
  return ({ 'Normal': 'normal', 'Watch': 'watch', 'High Risk': 'high', 'Critical': 'critical' })[r] || 'normal';
}
function pill(r, txt = '') {
  const k = riskKey(r);
  return `<span class="pill ${k}">${txt || r}</span>`;
}
function statusFromPct(pct) {
  if (pct < 70) return 'Normal';
  if (pct < 90) return 'Watch';
  if (pct <= 100) return 'High Risk';
  return 'Critical';
}
function riskColor(r) {
  return ({ 'Normal': 'var(--n)', 'Watch': 'var(--w)', 'High Risk': 'var(--h)', 'Critical': 'var(--c)' })[r] || 'var(--n)';
}
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2000);
}
async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}
function nav() {
  const elevated = Object.values(displayZones()).filter((z) => ['High Risk', 'Critical'].includes(z.risk)).length;
  $('#nav').innerHTML = TABS.map(([id, label]) => `
    <a href="#${id}" data-tab="${id}" ${state.tab === id ? 'aria-current="page"' : ''}>
      ${label}${id === 'overview' && elevated ? `<span class="count">${elevated}</span>` : ''}
    </a>`).join('');
  $$('#nav a').forEach((a) => a.onclick = (e) => {
    e.preventDefault();
    state.tab = a.dataset.tab;
    render();
  });
}

async function loadAll() {
  state.network = await getJSON(`/api/state?time=${state.time}`);
  $('#demoTime').textContent = `Demo time · ${state.time}`;
  state.zoneDetails = {};
  for (const z of Object.keys(state.network.zones)) {
    state.zoneDetails[z] = await getJSON(`/api/zone/${z}?time=${state.time}`);
  }
  if (!state.zoneDetails[state.sel]) state.sel = state.network.highest_zone;
  const rec = state.zoneDetails[state.sel].recommendation;
  state.sim = { zone: state.sel, action_type: rec.type === 'none' ? 'redirect' : rec.type, params: normalizeRecParams(rec, state.sel) };
}
function normalizeRecParams(rec, zone = state.sel) {
  const p = { ...(rec.params || {}) };
  const neighbors = state.zoneDetails[zone]?.neighbors || [];
  if (rec.type === 'redirect' || (!rec.type && neighbors.length)) {
    p.redirect_pct = Number(p.redirect_pct || 30);
    p.target_zone = p.target_zone || neighbors[0] || 'A';
  }
  if (rec.type === 'open_route') p.outflow_boost_pct = Number(p.outflow_boost_pct || 30);
  if (rec.type === 'stagger_event') p.pressure_reduction_pct = Number(p.pressure_reduction_pct || 40);
  if (rec.type === 'meter_entry') p.meter_pct = Number(p.meter_pct || 30);
  return p;
}

function displayZones() {
  const zones = JSON.parse(JSON.stringify(state.network?.zones || {}));
  if (state.appliedScenario?.results) {
    for (const [k, r] of Object.entries(state.appliedScenario.results)) {
      if (zones[k]) {
        zones[k].predicted = Math.round(r.after);
        zones[k].occupancy_future = Math.round(r.after_pct);
        zones[k].risk = r.after_risk;
      }
    }
  }
  return zones;
}
function displayZone(zone) {
  return displayZones()[zone];
}
function displayDetail(zone) {
  const base = JSON.parse(JSON.stringify(state.zoneDetails[zone] || {}));
  if (state.appliedScenario?.results?.[zone]) {
    const r = state.appliedScenario.results[zone];
    base.predicted = Math.round(r.after);
    base.occupancy_future = Math.round(r.after_pct);
    base.risk = r.after_risk;
  }
  return base;
}
function highestZoneInfo() {
  const vals = Object.values(displayZones());
  return vals.reduce((a, b) => a.occupancy_future > b.occupancy_future ? a : b);
}
function elevatedCount() {
  return Object.values(displayZones()).filter((z) => ['High Risk', 'Critical'].includes(z.risk)).length;
}
function resetApplied() {
  state.appliedScenario = null;
  state.simResults = null;
  state.decisionLog = state.decisionLog.filter((d) => d.example);
  showToast('Dashboard reset to base forecast');
  render();
}

function siteMap(data, useFuture = true) {
  const bg = { normal: 'var(--n-bg)', watch: 'var(--w-bg)', high: 'var(--h-bg)', critical: 'var(--c-bg)' };
  const color = { normal: 'var(--n)', watch: 'var(--w)', high: 'var(--h)', critical: 'var(--c)' };
  const pts = (p) => p.map((q) => q.join(',')).join(' ');
  let s = `<svg viewBox="0 0 660 440" role="img" aria-label="Site map"><rect width="660" height="440" rx="12" fill="var(--page)"/><path d="M30 220L170 70H500L630 210L560 330L430 430H230L90 330Z" fill="var(--map)" stroke="var(--map-edge)" stroke-width="2" stroke-dasharray="7 5"/><g stroke="#fff" stroke-width="16" stroke-linecap="round" fill="none"><path d="M110 262H560"/><path d="M330 262V360"/><path d="M200 175L250 262M470 170L420 262"/></g><path d="M110 262H560" stroke="var(--mint)" stroke-width="2.4" stroke-linecap="round" opacity=".6"/><path d="M330 262V360" stroke="var(--mint)" stroke-width="2.4" opacity=".6"/><path d="M260 330Q330 300 400 330L420 400Q330 428 240 400Z" fill="var(--park)" stroke="var(--tree)"/><g fill="var(--tree)"><circle cx="280" cy="365" r="8"/><circle cx="300" cy="388" r="6"/><circle cx="372" cy="368" r="8"/><circle cx="392" cy="390" r="6"/></g>`;
  for (const k of Object.keys(POLY)) {
    const z = data[k];
    const rk = riskKey(z.risk);
    s += `<polygon class="zone-shape" data-zone="${k}" points="${pts(POLY[k])}" fill="${bg[rk]}" stroke="${state.sel === k ? 'var(--deep)' : color[rk]}" stroke-width="${state.sel === k ? 3 : 1.6}" tabindex="0" role="button"/>`;
  }
  s += `<g pointer-events="none"><rect x="266" y="182" width="64" height="40" rx="4" fill="var(--stage)" stroke="#B7AEE8"/><text x="298" y="198" font-size="8.5" fill="var(--stage-tx)" text-anchor="middle" font-weight="600">Main stage</text><text x="298" y="211" font-size="7.5" fill="var(--stage-tx)" text-anchor="middle">event zone</text></g><g pointer-events="none" font-weight="700" font-size="10.5" text-anchor="middle">`;
  for (const k of Object.keys(POLY)) {
    const [x, y] = LBL[k];
    const z = data[k];
    const rk = riskKey(z.risk);
    s += `<rect x="${x - 29}" y="${y - 13}" width="58" height="18" fill="#fff" stroke="${rk === 'normal' ? 'var(--ink)' : color[rk]}" stroke-width="${rk === 'normal' ? 1.3 : 2}"/><text x="${x}" y="${y}" fill="var(--ink)">ZONE ${k}</text>`;
  }
  for (const k of Object.keys(POLY)) {
    const [x, y] = PCT[k];
    const z = data[k];
    const n = useFuture ? z.occupancy_future : z.occupancy_now;
    const rk = riskKey(z.risk);
    s += `<rect x="${x - 17}" y="${y - 8}" width="34" height="16" rx="8" fill="${rk === 'normal' ? 'var(--n-tx)' : color[rk]}"/><text x="${x}" y="${y + 3.5}" font-size="9" fill="#fff">${n}%</text>`;
  }
  s += '</g></svg>';
  return s;
}
function bindZoneClicks() {
  $$('.zone-shape').forEach((n) => {
    n.onclick = () => { state.sel = n.dataset.zone; render(); };
    n.onkeydown = (e) => { if (e.key === 'Enter') { state.sel = n.dataset.zone; render(); } };
  });
}

function upcomingText() {
  const e = state.network.next_event;
  if (!e) return '<span class="muted small">No upcoming events</span>';
  return `<b style="font-weight:500">${e.event_name}</b><span class="muted small">Zone ${e.zone} · starts in ${state.network.next_event_in} min · ~${fmt(e.expected_attendance)} attendees</span>`;
}
function alertsData() {
  const zones = displayZones();
  const out = [];
  for (const z of Object.values(zones)) {
    if (['Critical', 'High Risk'].includes(z.risk)) {
      out.push({ zone: z.zone, sev: z.risk, title: `Zone ${z.zone} · ${z.risk} in 15 min`, body: zoneAlertText(z.zone), tm: 'now' });
    } else if (z.risk === 'Watch') {
      out.push({ zone: z.zone, sev: 'Watch', title: `Zone ${z.zone} · Flow rising`, body: zoneAlertText(z.zone), tm: '6m' });
    }
  }
  const spare = Object.values(zones).filter((z) => z.risk === 'Normal').sort((a, b) => (b.capacity - b.predicted) - (a.capacity - a.predicted))[0];
  if (spare) out.push({ zone: spare.zone, sev: 'Info', title: `Zone ${spare.zone} · Spare capacity`, body: `${fmt(spare.capacity - spare.predicted)} places free in 15 min`, tm: '6m' });
  if (state.appliedScenario) out.unshift({ zone: state.appliedScenario.zone, sev: 'Info', title: `Zone ${state.appliedScenario.zone} · Action applied`, body: state.appliedScenario.label, tm: 'now' });
  return out.slice(0, 4);
}
function zoneAlertText(zone) {
  const d = displayDetail(zone);
  if (d.event?.event_name || d.event?.name) return `Event pressure near ${zone}`;
  const firstReason = d.reasons?.[0]?.title || 'Forecast above safe level';
  return firstReason;
}
function alertsHTML() {
  const dotColor = (sev) => ({ 'Critical': 'var(--c)', 'High Risk': 'var(--h)', 'Watch': 'var(--w)', 'Info': 'var(--fc)' })[sev] || 'var(--n)';
  return `<div class="alerts">${alertsData().map((a) => `
    <button class="alert" data-zone="${a.zone}">
      <span class="dot" style="background:${dotColor(a.sev)}"></span>
      <span class="b">
        <span class="row"><b style="font-weight:500">${a.title}</b><span class="muted small">${a.tm}</span></span>
        <span class="muted small">${a.body}</span>
      </span>
    </button>`).join('')}</div>`;
}
function historySeries(z) {
  const current = z.current;
  const start = Math.max(0, current * 0.55);
  const arr = [];
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const wobble = Math.sin(i + current / 85) * 8;
    arr.push(Math.round(start + (current - start) * (0.55 * t + 0.45 * t * t) + wobble));
  }
  arr[9] = Math.round(current);
  return arr;
}
function chartSVG(zone, opt = {}) {
  const z = displayZone(zone);
  const now = z.current;
  const forecast = opt.forecast ?? z.predicted;
  const after = opt.after ?? null;
  const cap = z.capacity;
  const hist = historySeries(z);
  const without = [now, Math.round(now + (forecast - now) / 3), Math.round(now + (forecast - now) * 2 / 3), forecast];
  const withA = after != null ? [now, Math.round(now + (after - now) / 3), Math.round(now + (after - now) * 2 / 3), after] : null;
  const W = 640, H = 220, L = 46, R = 14, T = 14, B = 30;
  const all = [...hist, ...without, cap, ...(withA || [])];
  const max = Math.ceil(Math.max(...all) * 1.1 / 300) * 300;
  const X = (i) => L + (W - L - R) * i / 12;
  const Y = (v) => T + (H - T - B) * (1 - v / max);
  const line = (arr, off) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i + off).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const endStatus = statusFromPct(forecast / cap * 100);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart"><rect x="${X(9)}" y="${T}" width="${X(12) - X(9)}" height="${H - T - B}" fill="var(--fc-soft)" opacity=".9"/>`;
  for (let v = 0; v <= max; v += 300) s += `<path d="M${L} ${Y(v)}H${W - R}" stroke="var(--line-2)"/><text x="${L - 8}" y="${Y(v) + 4}" font-size="11" fill="var(--muted)" text-anchor="end">${fmt(v)}</text>`;
  s += `<path d="M${L} ${Y(cap)}H${W - R}" stroke="var(--c)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${L + 6}" y="${Y(cap) - 6}" font-size="11" fill="var(--c-tx)">Capacity ${fmt(cap)}</text>`;
  s += `<path d="M${X(9)} ${T}V${H - B}" stroke="var(--muted)" stroke-dasharray="2 3"/>`;
  s += `<path d="${line(hist, 0)}" fill="none" stroke="var(--ink)" stroke-width="2.6" stroke-linejoin="round"/>`;
  s += `<path d="${line(without, 9)}" fill="none" stroke="var(--fc)" stroke-width="2.6" stroke-dasharray="7 5"/>`;
  s += `<circle cx="${X(12)}" cy="${Y(without[3])}" r="5" fill="${riskColor(endStatus)}"/><text x="${X(12) - 8}" y="${Y(without[3]) - 9}" font-size="11.5" fill="var(--ink)" text-anchor="end" font-weight="600">${fmt(without[3])}</text>`;
  if (withA) {
    s += `<path d="${line(withA, 9)}" fill="none" stroke="var(--route)" stroke-width="2.8"/>`;
    s += `<circle cx="${X(12)}" cy="${Y(withA[3])}" r="5" fill="var(--route)"/><text x="${X(12) - 8}" y="${Y(withA[3]) + 16}" font-size="11.5" fill="var(--route)" text-anchor="end" font-weight="600">${fmt(withA[3])}</text>`;
  }
  s += `<circle cx="${X(9)}" cy="${Y(now)}" r="5" fill="var(--ink)"/>`;
  [[0, '17:00'], [3, '17:15'], [6, '17:30'], [9, 'Now'], [12, '+15 min']].forEach(([i, t]) => {
    s += `<text x="${X(i)}" y="${H - 8}" font-size="11" fill="${i === 9 ? 'var(--ink)' : 'var(--muted)'}" text-anchor="${i === 12 ? 'end' : 'middle'}">${t}</text>`;
  });
  s += '</svg>';
  return s;
}
function chartLegend(withAction) {
  return `<div class="chart-legend"><span><i class="ln" style="border-color:var(--ink)"></i>Actual</span><span><i class="ln" style="border-color:var(--fc);border-top-style:dashed"></i>Forecast</span>${withAction ? '<span><i class="ln" style="border-color:var(--route)"></i>With action</span>' : ''}<span><i class="ln" style="border-color:var(--c);border-top-style:dashed;border-top-width:1.5px"></i>Capacity</span></div>`;
}

function overviewView() {
  const zones = displayZones();
  const highest = highestZoneInfo();
  const zd = displayDetail(state.sel);
  const appliedBanner = state.appliedScenario ? `<div class="rec" style="border-color:var(--mint-soft);background:var(--mint-soft)"><span class="eyebrow">Applied scenario</span><span class="t">${state.appliedScenario.label}</span><div class="inline-actions"><button class="btn sm" id="resetAppliedBtn">Reset applied scenario</button></div></div>` : '';
  return `<div class="section-stack">
    <div class="kpis">
      <div class="kpi"><span class="muted small">Elevated risk zones</span><span class="v">${elevatedCount()}</span></div>
      <div class="kpi attn"><span class="muted small">Highest forecast</span><span class="v">Zone ${highest.zone} <small>${highest.occupancy_future}%</small></span></div>
      <div class="kpi"><span class="muted small">Next event</span><span class="v">${state.network.next_event_in ?? '—'} <small>${state.network.next_event_in != null ? 'min' : 'none'}</small></span></div>
      <div class="kpi"><span class="muted small">Forecast horizon</span><span class="v">15 <small>minutes</small></span></div>
    </div>
    <div class="hero">
      <div class="card"><div class="card-h"><div><h2>Expo site map</h2><p class="muted small">Projected occupancy by zone in 15 minutes</p></div><div class="legend"><span><i class="sw" style="background:var(--n)"></i>Normal</span><span><i class="sw" style="background:var(--w)"></i>Watch</span><span><i class="sw" style="background:var(--h)"></i>High</span><span><i class="sw" style="background:var(--c)"></i>Critical</span></div></div><div class="map-wrap-custom">${siteMap(zones, true)}</div></div>
      <div class="space-y">
        <div class="card"><div class="card-h"><div><h2>Selected zone</h2><p class="muted small">Zone ${state.sel} · ${AREAS[state.sel]}</p></div>${pill(zd.risk)}</div>
          <div class="nowfc"><div class="box"><span class="lbl">Current visitors</span><span class="big">${fmt(zd.current)}</span><span class="lbl">${zd.occupancy_now}% of capacity</span></div><div class="arrow center">→</div><div class="box f"><span class="lbl">15-min forecast</span><span class="big">${fmt(zd.predicted)}</span><span class="lbl">${zd.occupancy_future}% projected</span></div></div>
          <div class="metrics"><div class="metric"><span>Incoming</span><b>${zd.incoming}/min</b></div><div class="metric"><span>Outgoing</span><b>${zd.outgoing}/min</b></div><div class="metric"><span>Capacity</span><b>${fmt(zd.capacity)}</b></div><div class="metric"><span>Recommendation</span><b>${zd.recommendation?.label || '—'}</b></div></div>
          <div class="rec"><span class="eyebrow">Why this is happening</span><ul class="why">${(zd.reasons || []).map((r) => `<li><span>${r.title}</span></li>`).join('')}</ul></div>
          <div class="inline-actions"><button class="btn primary" id="toSimulatorBtn">Test recommendation</button><button class="btn" id="toZonesBtn">Open zone details</button></div>
        </div>
        <div class="card"><div class="card-h"><div><h2>Upcoming event signal</h2><p class="muted small">Schedule influence is included in the forecast</p></div></div><div class="rec">${upcomingText()}</div></div>
        ${appliedBanner}
      </div>
    </div>
    <div class="ov2">
      <div class="card"><div class="card-h"><h2>Zone ${state.sel} · trend and forecast</h2><span class="muted small">Last 45 min + next 15</span></div><div class="chart">${chartSVG(state.sel)}</div>${chartLegend(false)}</div>
      <div class="card"><div class="card-h"><h2>Alerts</h2>${state.appliedScenario ? '<button class="btn sm" id="resetAppliedBtn2">Reset demo</button>' : ''}</div>${alertsHTML()}</div>
    </div>
    <div class="card table-card"><div class="card-h"><div><h2>All zones</h2><p class="muted small">Select a row to inspect the zone</p></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>Zone</th><th>Area</th><th>Occupancy now</th><th>In / out per min</th><th>Forecast 15 min</th><th>Now</th><th>In 15 min</th></tr></thead><tbody>
      ${Object.values(zones).map((z) => `<tr data-zone="${z.zone}"><td><b>Zone ${z.zone}</b></td><td>${AREAS[z.zone]}</td><td><span class="bar"><i style="width:${Math.min(100, z.occupancy_now)}%;background:${riskColor(statusFromPct(z.occupancy_now))}"></i></span>${fmt(z.current)} / ${fmt(z.capacity)}</td><td>+${z.incoming} / −${z.outgoing}</td><td class="fcnum">${fmt(z.predicted)} <span class="muted small">(${z.occupancy_future}%)</span></td><td>${pill(statusFromPct(z.occupancy_now))}</td><td>${pill(z.risk)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
  </div>`;
}

function zonesView() {
  const z = displayDetail(state.sel);
  return `<div class="card"><div class="card-h"><div><h2>Zone intelligence</h2><p class="muted small">Operational details for each zone</p></div><div class="zone-chips">${Object.keys(displayZones()).map((k) => `<button class="zchip" data-zonepick="${k}" aria-pressed="${state.sel === k}">Zone ${k}</button>`).join('')}</div></div>
    <div class="zone-grid">
      <div class="space-y"><div class="card" style="padding:0;border:none;background:transparent"><div class="kpi-row-mini"><div class="metric"><span>Current visitors</span><b>${fmt(z.current)}</b></div><div class="metric"><span>Incoming</span><b>${z.incoming}/min</b></div><div class="metric"><span>Outgoing</span><b>${z.outgoing}/min</b></div><div class="metric"><span>Capacity</span><b>${fmt(z.capacity)}</b></div></div></div><div class="card"><div class="card-h"><div><h2>Drivers of congestion</h2><p class="muted small">Why FlowSight expects this movement</p></div>${pill(z.risk)}</div><ul class="why">${(z.reasons || []).map((r) => `<li><span><b style="font-weight:500">${r.title}</b><br><span class="muted small">${r.detail || ''}</span></span></li>`).join('')}</ul></div></div>
      <div class="space-y"><div class="card"><div class="card-h"><div><h2>Recommendation</h2><p class="muted small">Best next step according to current network conditions</p></div></div><div class="rec"><div class="t">${z.recommendation?.label || 'No action needed'}</div><p class="muted">${z.recommendation?.reason || 'Zone remains within safe forecast levels.'}</p></div><div class="inline-actions"><button class="btn primary" id="zoneSimBtn">Open scenario simulator</button></div></div><div class="card"><div class="card-h"><div><h2>Capacity outlook</h2><p class="muted small">Now versus 15-minute forecast</p></div></div><div class="nowfc"><div class="box"><span class="lbl">Now</span><span class="big">${z.occupancy_now}%</span><span class="lbl">${fmt(z.current)} visitors</span></div><div class="arrow center">→</div><div class="box f"><span class="lbl">Forecast</span><span class="big">${z.occupancy_future}%</span><span class="lbl">${fmt(z.predicted)} visitors</span></div></div></div></div>
    </div>
  </div>`;
}

function predictionsView() {
  const zones = Object.values(displayZones()).sort((a, b) => b.occupancy_future - a.occupancy_future);
  const k = state.sel;
  const z = displayZone(k);
  return `<div class="section-stack">
    <div class="card"><div class="card-h"><div><h2>Forecast by zone</h2></div><div class="zone-chips">${Object.keys(displayZones()).map((x) => `<button class="zchip" data-pz="${x}" aria-pressed="${x === k}">Zone ${x}</button>`).join('')}</div></div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:baseline"><span><span class="muted small">Now </span><b style="font-weight:600;font-size:18px">${fmt(z.current)}</b></span><span><span class="small" style="color:var(--fc-ink)">In 15 min </span><b style="font-weight:600;font-size:18px;color:var(--fc-ink)">${fmt(z.predicted)}</b></span>${pill(z.risk)}</div>
      <div class="chart">${chartSVG(k)}</div>${chartLegend(false)}
    </div>
    <div class="card"><div class="card-h"><h2>Risk ranking in 15 min</h2><span class="muted small">Forecast ÷ capacity</span></div><div class="rank">${zones.map((q) => `<div class="rank-row"><span>Zone ${q.zone}</span><span class="rank-track"><i style="width:${Math.min(100, q.occupancy_future / 1.25)}%;background:${riskColor(q.risk)}"></i><span class="cap-mark" style="left:${100 / 1.25}%"></span></span><span class="small" style="min-width:86px;text-align:right">${q.occupancy_future}% ${pill(q.risk)}</span></div>`).join('')}</div><p class="muted small">Red tick marks 100% of capacity.</p></div>
  </div>`;
}


function recommendationOptions(zone) {
  const z = displayDetail(zone);
  const neighbors = z.neighbors || [];
  return [
    { name: z.recommendation?.label || 'Redirect flow', desc: z.recommendation?.reason || 'Use network capacity to reduce pressure.', type: z.recommendation?.type || 'redirect', params: normalizeRecParams(z.recommendation || { type: 'redirect', params: {} }, zone), best: true },
    { name: `Redirect incoming flow to Zone ${neighbors[0] || 'A'}`, desc: `Use spare capacity in Zone ${neighbors[0] || 'A'} to reduce near-term inflow pressure.`, type: 'redirect', params: { target_zone: neighbors[0] || 'A', redirect_pct: 25 } },
    { name: 'Open or activate alternate route', desc: 'Increase outflow and restore movement capacity.', type: 'open_route', params: { outflow_boost_pct: 35 } },
    { name: 'Temporarily meter incoming flow', desc: 'Slow down additional entries until the zone stabilizes.', type: 'meter_entry', params: { meter_pct: 25 } },
  ];
}
function interventionsView() {
  const zone = state.sel;
  const z = displayDetail(zone);
  const opts = recommendationOptions(zone);
  return `<div class="section-stack"><div class="card"><div class="card-h"><div><h2>Intervention options</h2><p class="muted small">Actions for Zone ${zone} based on current operating conditions</p></div>${pill(z.risk, 'Current forecast: ' + z.risk)}</div>
      <div class="opts">${opts.map((o, i) => `<div class="opt ${o.best ? 'best' : ''}"><div style="display:flex;flex-direction:column;gap:4px"><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-weight:500">${o.name}</b>${o.best ? '<span class="pill normal" style="background:var(--mint-soft);color:var(--deep)">Recommended</span>' : ''}</span><span class="muted small">${o.desc}</span></div><div class="acts"><button class="btn sm" data-open-sim='${JSON.stringify({ zone, action_type: o.type, params: o.params }).replace(/'/g, '&apos;')}'>Open in simulator</button></div></div>`).join('')}</div>
    </div>
    <div class="card"><div class="card-h"><h2>Decision log</h2><span class="muted small">Today</span></div><div class="tbl-wrap"><table style="min-width:620px"><thead><tr><th>Time</th><th>Zone</th><th>Action</th><th>Result</th><th></th></tr></thead><tbody>${state.decisionLog.map((l) => `<tr style="cursor:default"><td>${l.time}</td><td>${l.zone}</td><td style="white-space:normal">${l.action}</td><td><span class="log-status">${l.result}</span></td><td>${l.example ? '<span class="example">Example</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
}

function simControls() {
  return `<div class="card"><h2>Build a scenario</h2>
    <div class="ctrl"><label>Zone</label><select id="simZone">${Object.keys(displayZones()).map((k) => `<option value="${k}" ${state.sim.zone === k ? 'selected' : ''}>Zone ${k} · ${AREAS[k]}</option>`).join('')}</select></div>
    <div class="ctrl"><label>Action</label><select id="simAction"><option value="redirect" ${state.sim.action_type === 'redirect' ? 'selected' : ''}>Redirect incoming flow</option><option value="open_route" ${state.sim.action_type === 'open_route' ? 'selected' : ''}>Open / activate alternate route</option><option value="stagger_event" ${state.sim.action_type === 'stagger_event' ? 'selected' : ''}>Stagger event entry or release</option><option value="meter_entry" ${state.sim.action_type === 'meter_entry' ? 'selected' : ''}>Temporarily meter incoming flow</option><option value="none" ${state.sim.action_type === 'none' ? 'selected' : ''}>No action</option></select></div>
    <div id="dynamicParams">${dynamicParamsHTML()}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="runSim">Run simulation</button><button class="btn" id="useRecommendation">Use recommendation</button>${state.appliedScenario ? '<button class="btn sm" id="resetAppliedBtn3">Reset applied</button>' : ''}</div>
  </div>`;
}
function dynamicParamsHTML() {
  const z = state.zoneDetails[state.sim.zone];
  const neighbors = z?.neighbors || [];
  if (state.sim.action_type === 'redirect') return `<div class="ctrl"><label>Target zone</label><select id="targetZone">${neighbors.map((n) => `<option value="${n}" ${state.sim.params.target_zone === n ? 'selected' : ''}>Zone ${n}</option>`).join('')}</select></div><div class="ctrl"><label>Redirect share <b id="redirectVal">${state.sim.params.redirect_pct || 30}%</b></label><input type="range" min="10" max="60" step="5" value="${state.sim.params.redirect_pct || 30}" id="redirectPct"></div>`;
  if (state.sim.action_type === 'open_route') return `<div class="ctrl"><label>Outflow improvement <b id="boostVal">${state.sim.params.outflow_boost_pct || 30}%</b></label><input type="range" min="10" max="60" step="5" value="${state.sim.params.outflow_boost_pct || 30}" id="outflowBoost"></div>`;
  if (state.sim.action_type === 'stagger_event') return `<div class="ctrl"><label>Event pressure reduction <b id="pressureVal">${state.sim.params.pressure_reduction_pct || 40}%</b></label><input type="range" min="10" max="70" step="5" value="${state.sim.params.pressure_reduction_pct || 40}" id="pressureReduction"></div>`;
  if (state.sim.action_type === 'meter_entry') return `<div class="ctrl"><label>Entry reduction <b id="meterVal">${state.sim.params.meter_pct || 30}%</b></label><input type="range" min="10" max="60" step="5" value="${state.sim.params.meter_pct || 30}" id="meterPct"></div>`;
  return `<div class="note-box">No action selected. The simulator will show the baseline forecast only.</div>`;
}
function simulatorView() {
  const out = state.simResults ? simResultsHTML() : `<div class="card"><div class="empty-sim"><b>No scenario run yet</b><span>Choose an action, then run the simulation to compare before and after.</span></div></div>`;
  return `<div class="simu">${simControls()}<div class="space-y">${out}</div></div>`;
}
function scenarioLabel() {
  const p = state.sim;
  if (p.action_type === 'redirect') return `Redirect ${p.params.redirect_pct}% of incoming visitors to Zone ${p.params.target_zone}`;
  if (p.action_type === 'open_route') return `Open alternate route to boost outflow by ${p.params.outflow_boost_pct}%`;
  if (p.action_type === 'stagger_event') return `Reduce event pressure by ${p.params.pressure_reduction_pct}%`;
  if (p.action_type === 'meter_entry') return `Meter incoming flow by ${p.params.meter_pct}%`;
  return 'No action';
}
function simResultsHTML() {
  const res = state.simResults.results;
  const focus = res[state.sim.zone];
  const beforeZones = {}, afterZones = {};
  for (const [k, v] of Object.entries(res)) {
    beforeZones[k] = { zone: k, risk: v.before_risk, occupancy_now: v.current ? Math.round(v.current / v.capacity * 100) : 0, occupancy_future: v.before_pct };
    afterZones[k] = { zone: k, risk: v.after_risk, occupancy_now: v.current ? Math.round(v.current / v.capacity * 100) : 0, occupancy_future: v.after_pct };
  }
  let receiving = '';
  if (state.sim.action_type === 'redirect' && state.sim.params.target_zone && res[state.sim.params.target_zone]) {
    const t = res[state.sim.params.target_zone];
    receiving = `<div class="note-box">Receiving zone ${state.sim.params.target_zone}: ${fmt(t.before)} → ${fmt(t.after)} projected visitors · ${t.before_pct}% → ${t.after_pct}% · ${t.after_risk}</div>`;
  }
  return `<div class="card"><div class="card-h"><div><h2>Simulation result</h2><p class="muted small">Compare projected occupancy before and after the selected action</p></div>${pill(focus.after_risk, focus.before_risk + ' → ' + focus.after_risk)}</div>
    <div class="sim-kpis"><div class="kpi"><span class="muted small">Before</span><span class="v">${fmt(focus.before)}</span></div><div class="kpi attn"><span class="muted small">After</span><span class="v">${fmt(focus.after)}</span></div><div class="kpi"><span class="muted small">Change</span><span class="v">${focus.after - focus.before > 0 ? '+' : ''}${fmt(focus.after - focus.before)}</span></div><div class="kpi"><span class="muted small">Projected occupancy</span><span class="v">${focus.before_pct}% <small>→ ${focus.after_pct}%</small></span></div></div>
    <div class="before-after"><div><div class="small muted small" style="margin-bottom:8px">Before</div><div class="small-map">${siteMap(beforeZones, true)}</div></div><div class="arrow-mid">→</div><div><div class="small muted small" style="margin-bottom:8px">After</div><div class="small-map">${siteMap(afterZones, true)}</div></div></div>
    <div class="chart">${chartSVG(state.sim.zone, { forecast: focus.before, after: focus.after })}</div>${chartLegend(true)}
    ${receiving}
    <div class="inline-actions"><button class="btn primary" id="applyScenarioBtn">Apply to dashboard</button><button class="btn" id="backOverviewBtn">Go to overview</button></div>
  </div>`;
}
function applyScenario() {
  if (!state.simResults) return;
  state.appliedScenario = { zone: state.sim.zone, action_type: state.sim.action_type, params: { ...state.sim.params }, label: scenarioLabel(), results: state.simResults.results };
  const focus = state.simResults.results[state.sim.zone];
  state.decisionLog.unshift({ time: state.time, zone: `Zone ${state.sim.zone}`, action: scenarioLabel(), result: `Forecast ${fmt(focus.before)} → ${fmt(focus.after)}`, example: false });
  state.tab = 'overview';
  showToast('Scenario applied to dashboard');
  render();
}

function reportBarSVG(peaks) {
  const ORDER = Object.keys(peaks);
  const W = 520, H = 220, L = 40, B = 28, T = 12;
  const Y = (v) => T + (H - T - B) * (1 - v / 130);
  const bw = 44, gap = (W - L - 6 * bw) / 6;
  let bars = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peak occupancy by zone">`;
  [0, 50, 100].forEach((v) => bars += `<path d="M${L} ${Y(v)}H${W}" stroke="var(--line-2)"/><text x="${L - 8}" y="${Y(v) + 4}" font-size="11" fill="var(--muted)" text-anchor="end">${v}%</text>`);
  bars += `<path d="M${L} ${Y(100)}H${W}" stroke="var(--c)" stroke-dasharray="5 4"/>`;
  ORDER.forEach((k, i) => {
    const v = peaks[k];
    const x = L + gap / 2 + i * (bw + gap);
    const s = statusFromPct(v);
    bars += `<rect x="${x}" y="${Y(v)}" width="${bw}" height="${Y(0) - Y(v)}" rx="5" fill="${riskColor(s)}"/><text x="${x + bw / 2}" y="${Y(v) - 6}" font-size="11.5" fill="var(--ink)" text-anchor="middle" font-weight="600">${v}%</text><text x="${x + bw / 2}" y="${H - 8}" font-size="11" fill="var(--muted)" text-anchor="middle">Zone ${k}</text>`;
  });
  return bars + '</svg>';
}
function reportsView() {
  const zones = displayZones();
  const applied = !!state.appliedScenario;
  const peaks = {};
  for (const [k, z] of Object.entries(zones)) {
    const peak = Math.max(z.occupancy_now + 6, z.occupancy_future);
    peaks[k] = Math.round(peak);
  }
  const tl = [
    ['15:05', 'var(--w)', 'Zone A forecast reached 92%', 'Lanes opened at Gate 1, peak held below 90%'],
    ['16:15', 'var(--w)', 'Zone D dinner peak predicted', 'Seating released in waves, peak held below 90%'],
    ['17:45', 'var(--c)', `Zone ${highestZoneInfo().zone} ${highestZoneInfo().risk.toLowerCase()} forecast`, `${fmt(highestZoneInfo().predicted)} expected in 15 minutes`],
  ];
  if (applied) tl.push([state.time, 'var(--green)', `Zone ${state.appliedScenario.zone} action applied`, state.appliedScenario.label]);
  return `<div class="section-stack"><div style="display:flex;justify-content:flex-end"><span class="example">Example figures from simulated data</span></div>
    <div class="kpis"><div class="kpi"><span class="muted small">Congestion risks predicted</span><span class="v">7</span></div><div class="kpi"><span class="muted small">Avoided before they happened</span><span class="v">${applied ? 6 : 5} <small>of 7</small></span></div><div class="kpi"><span class="muted small">Average warning time</span><span class="v">14 <small>min</small></span></div><div class="kpi"><span class="muted small">Actions logged</span><span class="v">${state.decisionLog.length}</span></div></div>
    <div class="rep-grid"><div class="card"><div class="card-h"><h2>Peak occupancy today</h2><span class="muted small">Highest point per zone</span></div><div class="chart">${reportBarSVG(peaks)}</div></div>
      <div class="card"><h2>Today&apos;s events</h2><ul class="timeline">${tl.map(([t, c, a, b]) => `<li><span class="tm">${t}</span><span class="pt" style="background:${c}"></span><span><b style="font-weight:500">${a}</b><br><span class="muted small">${b}</span></span></li>`).join('')}</ul></div>
    </div>
  </div>`;
}

function render() {
  nav();
  $('#pageTitle').textContent = TABS.find((t) => t[0] === state.tab)[1];
  const view = $('#view');
  if (state.tab === 'overview') view.innerHTML = overviewView();
  if (state.tab === 'zones') view.innerHTML = zonesView();
  if (state.tab === 'predictions') view.innerHTML = predictionsView();
  if (state.tab === 'interventions') view.innerHTML = interventionsView();
  if (state.tab === 'simulator') view.innerHTML = simulatorView();
  if (state.tab === 'reports') view.innerHTML = reportsView();
  bindCommon();
}

function bindCommon() {
  bindZoneClicks();
  $$('#view tr[data-zone]').forEach((r) => r.onclick = () => { state.sel = r.dataset.zone; state.tab = 'overview'; render(); });
  $$('#view .alert').forEach((b) => b.onclick = () => { state.sel = b.dataset.zone; state.tab = 'overview'; render(); });
  $$('#view [data-zonepick]').forEach((b) => b.onclick = () => { state.sel = b.dataset.zonepick; render(); });
  const toSim = $('#toSimulatorBtn');
  if (toSim) toSim.onclick = () => { state.sim.zone = state.sel; const rec = state.zoneDetails[state.sel].recommendation; state.sim.action_type = rec.type === 'none' ? 'redirect' : rec.type; state.sim.params = normalizeRecParams(rec, state.sel); state.tab = 'simulator'; render(); };
  const toZones = $('#toZonesBtn');
  if (toZones) toZones.onclick = () => { state.tab = 'zones'; render(); };
  const zoneSim = $('#zoneSimBtn');
  if (zoneSim) zoneSim.onclick = () => { state.sim.zone = state.sel; const rec = state.zoneDetails[state.sel].recommendation; state.sim.action_type = rec.type === 'none' ? 'redirect' : rec.type; state.sim.params = normalizeRecParams(rec, state.sel); state.tab = 'simulator'; render(); };
  $$('#view [data-open-sim]').forEach((b) => b.onclick = () => { const conf = JSON.parse(b.getAttribute('data-open-sim')); state.sim = conf; state.tab = 'simulator'; render(); });
  $$('#view [data-pz]').forEach((b) => b.onclick = () => { state.sel = b.dataset.pz; render(); });
  const sZone = $('#simZone');
  if (sZone) sZone.onchange = () => { state.sim.zone = sZone.value; const rec = state.zoneDetails[state.sim.zone].recommendation; state.sim.action_type = rec.type === 'none' ? 'redirect' : rec.type; state.sim.params = normalizeRecParams(rec, state.sim.zone); render(); };
  const sAct = $('#simAction');
  if (sAct) sAct.onchange = () => { state.sim.action_type = sAct.value; state.sim.params = normalizeRecParams({ type: sAct.value, params: {} }, state.sim.zone); render(); };
  const red = $('#redirectPct'); if (red) red.oninput = () => { state.sim.params.redirect_pct = Number(red.value); $('#redirectVal').textContent = red.value + '%'; };
  const tgt = $('#targetZone'); if (tgt) tgt.onchange = () => state.sim.params.target_zone = tgt.value;
  const ob = $('#outflowBoost'); if (ob) ob.oninput = () => { state.sim.params.outflow_boost_pct = Number(ob.value); $('#boostVal').textContent = ob.value + '%'; };
  const pr = $('#pressureReduction'); if (pr) pr.oninput = () => { state.sim.params.pressure_reduction_pct = Number(pr.value); $('#pressureVal').textContent = pr.value + '%'; };
  const me = $('#meterPct'); if (me) me.oninput = () => { state.sim.params.meter_pct = Number(me.value); $('#meterVal').textContent = me.value + '%'; };
  const run = $('#runSim'); if (run) run.onclick = runSimulation;
  const use = $('#useRecommendation'); if (use) use.onclick = () => { const rec = state.zoneDetails[state.sim.zone].recommendation; state.sim.action_type = rec.type === 'none' ? 'redirect' : rec.type; state.sim.params = normalizeRecParams(rec, state.sim.zone); render(); };
  const applyBtn = $('#applyScenarioBtn'); if (applyBtn) applyBtn.onclick = applyScenario;
  const backBtn = $('#backOverviewBtn'); if (backBtn) backBtn.onclick = () => { state.tab = 'overview'; render(); };
  const reset1 = $('#resetAppliedBtn'); if (reset1) reset1.onclick = resetApplied;
  const reset2 = $('#resetAppliedBtn2'); if (reset2) reset2.onclick = resetApplied;
  const reset3 = $('#resetAppliedBtn3'); if (reset3) reset3.onclick = resetApplied;
}

async function runSimulation() {
  const payload = { time: state.time, zone: state.sim.zone, action_type: state.sim.action_type, params: state.sim.params };
  state.simResults = await getJSON('/api/simulate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  render();
  showToast('Scenario updated');
}

window.addEventListener('hashchange', () => {
  const t = location.hash.slice(1);
  if (TABS.some((v) => v[0] === t)) { state.tab = t; render(); }
});
$('#timeSelect').addEventListener('change', async (e) => {
  state.time = e.target.value;
  state.simResults = null;
  state.appliedScenario = null;
  await loadAll();
  render();
});
(async function init() {
  const t = location.hash.slice(1);
  if (TABS.some((v) => v[0] === t)) state.tab = t;
  await loadAll();
  render();
})();
