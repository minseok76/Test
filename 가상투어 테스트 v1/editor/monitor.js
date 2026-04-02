// monitor/monitor.js — 모니터링 메인 로직
import { loadTourData } from '../core/loader.js';
import CONFIG from '../config.js';

let tourData = null;
let db = null;
let currentPeriod = 'today';
let realtimeUnsub = null;

// ── PIN 인증 ─────────────────────────────────────
function checkPin() {
  const input = document.getElementById('pin-input');
  const err = document.getElementById('pin-err');
  // ✅ 수정: tourData 로딩 중일 때 사용자에게 피드백
  if (!tourData) {
    err.textContent = '데이터 로딩 중입니다. 잠시 후 시도하세요.';
    err.classList.add('show');
    setTimeout(() => err.classList.remove('show'), 2000);
    return;
  }
  // ✅ 수정: 옵셔널 체이닝으로 안전하게 접근
  if (input.value === tourData.security?.monitorPin) {
    document.getElementById('pin-screen').classList.add('hide');
    startMonitoring();
  } else {
    err.textContent = 'PIN이 올바르지 않습니다';
    err.classList.add('show');
    input.value = '';
    setTimeout(() => err.classList.remove('show'), 2000);
  }
}

// ── 초기화 ────────────────────────────────────────
async function init() {
  try {
    tourData = await loadTourData(CONFIG.DATA_PATH);
    document.querySelector('.h-title').textContent = tourData.tour.title;
  } catch (err) {
    console.error('Monitor 초기화 실패:', err);
  }
}

// ── Firebase 초기화 ───────────────────────────────
async function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK 미로드 — 더미 데이터로 표시');
    return false;
  }
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(CONFIG.FIREBASE);
    }
    db = firebase.firestore();
    return true;
  } catch (e) {
    console.error('Firebase 초기화 실패:', e);
    return false;
  }
}

// ── 모니터링 시작 ─────────────────────────────────
async function startMonitoring() {
  const fbOk = await initFirebase();
  if (fbOk) {
    await loadFromFirebase();
    subscribeRealtime();
  } else {
    renderDummyData(); // Firebase 없을 때 샘플 데이터
  }
}

// ── Firebase 데이터 로드 ──────────────────────────
async function loadFromFirebase() {
  if (!db) return;
  const tourId = tourData.tour.id;
  const now = new Date();
  let since = new Date(0);

  if (currentPeriod === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (currentPeriod === '7d') {
    since = new Date(now - 7 * 24 * 3600 * 1000);
  } else if (currentPeriod === '30d') {
    since = new Date(now - 30 * 24 * 3600 * 1000);
  }

  try {
    const visitsRef = db.collection('tours').doc(tourId).collection('visits');
    const q = currentPeriod === 'all'
      ? visitsRef.orderBy('timestamp', 'desc').limit(500)
      : visitsRef.where('timestamp', '>=', since).orderBy('timestamp', 'desc');

    const snap = await q.get();
    const visits = snap.docs.map(d => d.data());
    processAndRender(visits);
  } catch (e) {
    console.error('데이터 로드 실패:', e);
    renderDummyData();
  }
}

// ── 실시간 구독 ───────────────────────────────────
function subscribeRealtime() {
  if (!db) return;
  if (realtimeUnsub) realtimeUnsub();
  const tourId = tourData.tour.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  realtimeUnsub = db.collection('tours').doc(tourId).collection('visits')
    .where('timestamp', '>=', today)
    .onSnapshot(snap => {
      const visits = snap.docs.map(d => d.data());
      const kpiToday = document.getElementById('kpi-today');
      if (kpiToday) kpiToday.textContent = visits.length;
    });
}

// ── 데이터 처리 → 렌더 ──────────────────────────
function processAndRender(visits) {
  // KPI
  const totalVisits = visits.length;
  const avgDur = visits.length
    ? visits.reduce((s, v) => s + (v.durationSec || 0), 0) / visits.length
    : 0;
  const totalClicks = visits.reduce((s, v) => s + (v.markerClicks || 0), 0);

  renderKPI({ totalVisits, avgDur, totalClicks });

  // 시간대별
  const hourCounts = Array(24).fill(0);
  visits.forEach(v => {
    if (v.timestamp?.toDate) {
      hourCounts[v.timestamp.toDate().getHours()]++;
    }
  });
  renderBarChart(hourCounts);

  // 씬 TOP5
  const sceneCounts = {};
  visits.forEach(v => {
    (v.scenesViewed || []).forEach(id => {
      sceneCounts[id] = (sceneCounts[id] || 0) + 1;
    });
  });
  renderSceneTop5(sceneCounts);

  // 기기
  const deviceCounts = { pc: 0, mobile: 0, tablet: 0 };
  visits.forEach(v => { deviceCounts[v.device || 'pc']++; });
  renderDonut(deviceCounts, totalVisits);

  // 마커 클릭
  const markerCounts = {};
  visits.forEach(v => {
    Object.entries(v.markerClickMap || {}).forEach(([id, cnt]) => {
      markerCounts[id] = (markerCounts[id] || 0) + cnt;
    });
  });
  renderMarkerRanking(markerCounts);

  // 유입
  const sourceCounts = {};
  visits.forEach(v => { const s = v.source || '직접'; sourceCounts[s] = (sourceCounts[s] || 0) + 1; });
  renderSources(sourceCounts, totalVisits);

  // 지역별 접속
  renderRegions(visits);

  // 최근 방문 로그
  renderLogs(visits.slice(0, 10));
}

// ── KPI 렌더 ──────────────────────────────────────
function renderKPI({ totalVisits, avgDur, totalClicks }) {
  const fmt = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  setKpi('kpi-total', totalVisits, '');
  setKpi('kpi-dur', fmt(avgDur), '');
  setKpi('kpi-click', totalClicks, '');
}
function setKpi(id, val, sub) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
  const subEl = document.getElementById(id + '-sub');
  if (subEl && sub) subEl.textContent = sub;
}

// ── 시간대 바 차트 ────────────────────────────────
function renderBarChart(hourCounts) {
  const chart = document.getElementById('bar-chart');
  if (!chart) return;
  chart.innerHTML = '';
  const max = Math.max(...hourCounts, 1);
  hourCounts.forEach((v, i) => {
    const h = Math.max(4, Math.round(v / max * 56));
    const w = document.createElement('div');
    w.className = 'bar-wrap';
    w.innerHTML = `<div class="bar" style="height:${h}px" title="${i}시 ${v}명"></div>`;
    chart.appendChild(w);
  });
}

// ── TOP5 씬 ───────────────────────────────────────
function renderSceneTop5(sceneCounts) {
  const el = document.getElementById('scene-list');
  if (!el) return;
  const sorted = Object.entries(sceneCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = sorted[0]?.[1] || 1;
  el.innerHTML = '';
  sorted.forEach(([id, cnt], i) => {
    const scene = tourData.scenes.find(s => s.id === id);
    const pct = Math.round(cnt / max * 100);
    el.innerHTML += `
      <div class="scene-row">
        <div class="sc-rank">${i + 1}</div>
        <img class="sc-thumb" src="${scene?.thumbSrc || ''}" alt="" onerror="this.style.background='#1a2535';this.removeAttribute('src')">
        <div class="sc-name">${scene?.label || id}</div>
        <div class="sc-bar-wrap"><div class="sc-bar" style="width:${pct}%"></div></div>
        <div class="sc-pct">${pct}%</div>
      </div>`;
  });
}

// ── 도넛 차트 ────────────────────────────────────
function renderDonut({ pc, mobile, tablet }, total) {
  const circ = 2 * Math.PI * 20; // r=20
  const pPc  = total ? pc / total : 0.6;
  const pMob = total ? mobile / total : 0.33;
  const pTab = total ? tablet / total : 0.07;
  const seg = (p) => circ * p;
  const off = (prev) => -circ * prev;

  const svg = document.getElementById('donut-svg');
  if (!svg) return;

  svg.innerHTML = `
    <circle cx="27" cy="27" r="20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
    <circle cx="27" cy="27" r="20" fill="none" stroke="rgba(80,200,160,0.65)" stroke-width="10"
      stroke-dasharray="${seg(pPc).toFixed(1)} ${(circ - seg(pPc)).toFixed(1)}"
      stroke-dashoffset="0"/>
    <circle cx="27" cy="27" r="20" fill="none" stroke="rgba(100,160,255,0.55)" stroke-width="10"
      stroke-dasharray="${seg(pMob).toFixed(1)} ${(circ - seg(pMob)).toFixed(1)}"
      stroke-dashoffset="${off(pPc).toFixed(1)}"/>
    <circle cx="27" cy="27" r="20" fill="none" stroke="rgba(255,180,60,0.5)" stroke-width="10"
      stroke-dasharray="${seg(pTab).toFixed(1)} ${(circ - seg(pTab)).toFixed(1)}"
      stroke-dashoffset="${off(pPc + pMob).toFixed(1)}"/>
  `;

  const legend = document.getElementById('donut-legend');
  if (legend) {
    legend.innerHTML = `
      <div class="legend-item"><div class="legend-dot" style="background:rgba(80,200,160,0.8)"></div><span class="legend-label">PC</span><span class="legend-val">${Math.round(pPc*100)}%</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:rgba(100,160,255,0.8)"></div><span class="legend-label">모바일</span><span class="legend-val">${Math.round(pMob*100)}%</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:rgba(255,180,60,0.8)"></div><span class="legend-label">태블릿</span><span class="legend-val">${Math.round(pTab*100)}%</span></div>
    `;
  }
}

// ── 마커 클릭 순위 ────────────────────────────────
function renderMarkerRanking(markerCounts) {
  const el = document.getElementById('marker-list');
  if (!el) return;
  const sorted = Object.entries(markerCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  el.innerHTML = '';
  sorted.forEach(([id, cnt]) => {
    const hs = tourData.scenes.flatMap(s => s.hotspots).find(h => h.id === id);
    const isInfo = hs?.type === 'info';
    el.innerHTML += `
      <div class="marker-item">
        <div class="marker-dot" style="background:${isInfo ? 'rgba(255,220,80,0.8)' : 'rgba(255,255,255,0.6)'}"></div>
        <div class="marker-name">${hs?.label || id}</div>
        <div class="marker-cnt">${cnt}</div>
      </div>`;
  });
}

// ── 지역별 접속 현황 ──────────────────────────────
function renderRegions(visits) {
  const el = document.getElementById('region-list');
  if (!el) return;
  const regionCounts = {};
  visits.forEach(v => {
    const r = v.region || '알 수 없음';
    regionCounts[r] = (regionCounts[r] || 0) + 1;
  });
  const sorted = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  el.innerHTML = '';
  sorted.slice(0, 8).forEach(([region, cnt]) => {
    const pct = Math.round(cnt / max * 100);
    el.innerHTML += `
      <div class="region-item">
        <div class="region-name">${region}</div>
        <div class="region-bar-wrap"><div class="region-bar" style="width:${pct}%"></div></div>
        <div class="region-cnt">${cnt}</div>
      </div>`;
  });
}

// ── 유입 경로 ────────────────────────────────────
function renderSources(sourceCounts, total) {
  const el = document.getElementById('source-list');
  if (!el) return;
  el.innerHTML = '';
  Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1]).forEach(([name, cnt]) => {
    const pct = total ? Math.round(cnt / total * 100) : 0;
    el.innerHTML += `
      <div class="source-item">
        <div class="source-icon" style="background:rgba(80,200,160,0.15)">
          <svg viewBox="0 0 12 12" fill="none" style="width:8px;height:8px"><circle cx="6" cy="6" r="4" stroke="rgba(255,255,255,0.5)" stroke-width="1.2"/></svg>
        </div>
        <div class="source-name">${name}</div>
        <div class="source-val">${cnt}</div>
        <div class="source-pct">(${pct}%)</div>
      </div>`;
  });
}

// ── 최근 방문 로그 ────────────────────────────────
function renderLogs(visits) {
  const el = document.getElementById('log-list');
  if (!el) return;
  el.innerHTML = '';
  visits.forEach(v => {
    const ts = v.timestamp?.toDate?.() || new Date();
    const date = `${String(ts.getMonth()+1).padStart(2,'0')}/${String(ts.getDate()).padStart(2,'0')}`;
    const time = `${String(ts.getHours()).padStart(2,'0')}:${String(ts.getMinutes()).padStart(2,'0')}`;
    const isMobile = v.device === 'mobile';
    const sceneName = tourData.scenes.find(s => s.id === v.startSceneId)?.label || '?';
    const dur = v.durationSec
      ? `${Math.floor(v.durationSec/60)}:${String(Math.floor(v.durationSec%60)).padStart(2,'0')}`
      : '--:--';
    const region = v.region || '—';
    const icon = isMobile
      ? '<rect x="2" y="1" width="8" height="10" rx="1.5"/><circle cx="6" cy="9.2" r="0.5" fill="rgba(255,255,255,0.3)" stroke="none"/>'
      : '<rect x="1" y="2" width="10" height="7" rx="1.2"/><line x1="3.5" y1="10" x2="8.5" y2="10"/>';
    el.innerHTML += `
      <div class="log-row">
        <div class="log-date">${date}</div>
        <div class="log-time">${time}</div>
        <div class="log-device"><svg viewBox="0 0 12 12">${icon}</svg></div>
        <div class="log-scene">${sceneName}</div>
        <div class="log-region">${region}</div>
        <div class="log-dur">${dur}</div>
      </div>`;
  });
}

// ── 더미 데이터 (Firebase 없을 때) ───────────────
function renderDummyData() {
  const hourData = [0,0,0,0,0,1,2,4,8,12,15,18,22,25,20,18,24,28,22,15,10,6,3,1];
  renderBarChart(hourData);
  renderSceneTop5({
    scene_entrance: 82, scene_lobby: 65, scene_playroom: 58
  });
  renderDonut({ pc: 60, mobile: 33, tablet: 7 }, 100);
  renderMarkerRanking({
    hs_info_entrance: 48, hs_to_lobby: 41, hs_info_play: 35
  });
  renderSources({ '직접 접속': 142, '공유 링크': 89, '기타': 16 }, 247);

  // 지역 더미
  const dummyRegions = document.getElementById('region-list');
  if (dummyRegions) {
    const regions = [
      { name:'경상남도', cnt:89, pct:100 },
      { name:'서울특별시', cnt:62, pct:70 },
      { name:'부산광역시', cnt:41, pct:46 },
      { name:'경기도',    cnt:28, pct:31 },
      { name:'알 수 없음',cnt:27, pct:30 },
    ];
    dummyRegions.innerHTML = regions.map(r => `
      <div class="region-item">
        <div class="region-name">${r.name}</div>
        <div class="region-bar-wrap"><div class="region-bar" style="width:${r.pct}%"></div></div>
        <div class="region-cnt">${r.cnt}</div>
      </div>`).join('');
  }

  document.getElementById('kpi-total').textContent = '247';
  document.getElementById('kpi-today').textContent = '38';
  document.getElementById('kpi-dur').textContent = '4:32';
  document.getElementById('kpi-click').textContent = '183';

  const logs = [
    { time:'14:32', date:'04/02', mobile:false, scene:'플레이실', region:'경상남도', dur:'6:12' },
    { time:'14:28', date:'04/02', mobile:true,  scene:'정문',     region:'서울특별시', dur:'2:34' },
    { time:'14:21', date:'04/02', mobile:false, scene:'로비',     region:'경상남도', dur:'8:05' },
    { time:'14:15', date:'04/02', mobile:true,  scene:'플레이실', region:'부산광역시', dur:'3:44' },
  ];
  const el = document.getElementById('log-list');
  if (el) {
    el.innerHTML = '';
    logs.forEach(l => {
      const icon = l.mobile
        ? '<rect x="2" y="1" width="8" height="10" rx="1.5"/><circle cx="6" cy="9.2" r="0.5" fill="rgba(255,255,255,0.3)" stroke="none"/>'
        : '<rect x="1" y="2" width="10" height="7" rx="1.2"/><line x1="3.5" y1="10" x2="8.5" y2="10"/>';
      el.innerHTML += `
        <div class="log-row">
          <div class="log-date">${l.date}</div>
          <div class="log-time">${l.time}</div>
          <div class="log-device"><svg viewBox="0 0 12 12">${icon}</svg></div>
          <div class="log-scene">${l.scene}</div>
          <div class="log-region">${l.region}</div>
          <div class="log-dur">${l.dur}</div>
        </div>`;
    });
  }
}

// ── 기간 변경 ────────────────────────────────────
function setPeriod(period, el) {
  currentPeriod = period;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  if (db) loadFromFirebase();
}

window.checkPin = checkPin;
window.setPeriod = setPeriod;

window.addEventListener('DOMContentLoaded', init);
