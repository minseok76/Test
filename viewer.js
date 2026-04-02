/**
 * viewer.js — 가상투어 뷰어 메인 로직
 * tour.json → Marzipano 씬 빌드 → UI 렌더
 */

// ─── 전역 상태 ───────────────────────────────────────────
let _data = null;          // tour.json 전체
let _viewer = null;        // Marzipano 뷰어
let _scenes = {};          // { sceneId: { mzScene, data } }
let _currentId = null;     // 현재 씬 ID
let _uiHidden = false;     // UI 숨김 여부
let _projOpen = false;     // 프로젝션 팝업 열림
let _gridOpen = false;     // 그리드 오버레이 열림
let _slideIdx = 0;         // 정보팝업 슬라이드 인덱스
let _slideData = [];       // 현재 슬라이드 이미지 배열

// ─── 초기화 ──────────────────────────────────────────────
async function init() {
  try {
    // 1. tour.json 로드
    const res = await fetch('../data/tour.json');
    if (!res.ok) throw new Error('tour.json 로드 실패');
    _data = await res.json();

    // 2. Marzipano 뷰어 생성
    const panoEl = document.getElementById('pano');
    _viewer = new Marzipano.Viewer(panoEl, {
      controls: { mouseViewMode: 'drag' }
    });

    // 3. 씬 전체 빌드
    buildScenes();

    // 4. UI 렌더
    renderGroups();
    applyBranding();
    applyBarrier();

    // 5. 시작 씬으로 이동
    const startId = _data.tour.startScene || _data.scenes[0].id;
    switchScene(startId, false);

    // 6. 로딩 화면 제거
    hideLoader();

    // 7. 자동 회전
    if (_data.tour.autoRotate) {
      _viewer.startMovement(Marzipano.autorotate({ yawSpeed: 0.3 }));
      _viewer.setIdleMovement(3000, Marzipano.autorotate({ yawSpeed: 0.3 }));
    }

    // 8. 시작 팝업
    if (_data.startPopup?.enabled) {
      setTimeout(showStartPopup, (_data.startPopup.delay || 0.5) * 1000);
    }

  } catch (e) {
    console.error('뷰어 초기화 오류:', e);
    document.getElementById('loader').querySelector('.loader-txt').textContent = '로드 실패. 이미지 경로를 확인하세요.';
  }
}

// ─── Marzipano 씬 빌드 ───────────────────────────────────
function buildScenes() {
  const limiter = Marzipano.RectilinearView.limit.traditional(
    4096, 120 * Math.PI / 180
  );

  _data.scenes.forEach(sc => {
    const src = Marzipano.ImageUrlSource.fromString(sc.panoSrc);
    const geo = new Marzipano.EquirectGeometry([{ width: 4096 }]);
    const view = new Marzipano.RectilinearView(
      { yaw: sc.initialYaw || 0, pitch: sc.initialPitch || 0, fov: (_data.navigation?.fov || 90) * Math.PI / 180 },
      limiter
    );
    const mzScene = _viewer.createScene({ source: src, geometry: geo, view: view });
    _scenes[sc.id] = { mzScene, data: sc };
  });
}

// ─── 씬 전환 (페이드) ────────────────────────────────────
function switchScene(id, fade = true) {
  if (!_scenes[id]) return;
  const fade$ = document.getElementById('fade');

  const doSwitch = () => {
    _scenes[id].mzScene.switchTo();
    _currentId = id;
    renderHotspots(id);
    updateNavUI(id);
    updateSceneTitle(id);
    closeInfoPopup();
  };

  if (fade) {
    fade$.classList.add('in');
    setTimeout(() => {
      doSwitch();
      fade$.classList.remove('in');
    }, 350);
  } else {
    doSwitch();
  }
}

// ─── 핫스팟(마커) 렌더 ───────────────────────────────────
function renderHotspots(sceneId) {
  const { mzScene, data } = _scenes[sceneId];
  // 기존 핫스팟 제거
  mzScene.hotspotContainer().destroyAll();

  (data.hotspots || []).forEach(hs => {
    const el = createHotspotEl(hs);
    mzScene.hotspotContainer().createHotspot(el, { yaw: hs.yaw * Math.PI / 180, pitch: hs.pitch * Math.PI / 180 });
  });
}

function createHotspotEl(hs) {
  const wrap = document.createElement('div');
  wrap.className = 'hs-wrap';

  // 라벨
  if (hs.labelVisible) {
    const lbl = document.createElement('div');
    lbl.className = `hs-label ${hs.type}`;
    lbl.textContent = hs.label || '';
    wrap.appendChild(lbl);
  }

  // 원형 컨테이너
  const inner = document.createElement('div');
  inner.style.position = 'relative';
  inner.style.width = '32px';
  inner.style.margin = '0 auto';

  // 펄스
  const pulse = document.createElement('div');
  pulse.className = `hs-pulse ${hs.type}`;
  pulse.style.width = '32px';
  pulse.style.height = '32px';
  inner.appendChild(pulse);

  // 원
  const circle = document.createElement('div');
  circle.className = `hs-circle ${hs.type}`;
  circle.style.width = '32px';
  circle.style.height = '32px';
  circle.innerHTML = hs.type === 'link'
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5a3a00" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="#5a3a00" stroke="none"/></svg>`;
  inner.appendChild(circle);
  wrap.appendChild(inner);

  // 클릭 이벤트
  wrap.addEventListener('click', e => {
    e.stopPropagation();
    if (hs.type === 'link') {
      switchScene(hs.destScene);
    } else {
      openInfoPopup(hs);
    }
  });

  return wrap;
}

// ─── 그룹 탭 + 썸네일 렌더 ───────────────────────────────
function renderGroups() {
  const gRow = document.getElementById('g-row');
  const tRow = document.getElementById('t-row');
  const groups = _data.groups || [];

  gRow.innerHTML = '';
  groups.forEach((g, i) => {
    const tab = document.createElement('div');
    tab.className = 'g-tab' + (i === 0 ? ' active' : '');
    tab.textContent = g.name;
    tab.dataset.gid = g.id;
    tab.addEventListener('click', () => selectGroup(g.id, tab));
    gRow.appendChild(tab);
  });

  // 첫 그룹 썸네일 렌더
  if (groups.length) renderThumbs(groups[0].id);
}

function selectGroup(gid, tabEl) {
  document.querySelectorAll('.g-tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  renderThumbs(gid);
}

function renderThumbs(gid) {
  const tRow = document.getElementById('t-row');
  tRow.innerHTML = '';
  const scenes = _data.scenes.filter(s => s.groupId === gid);

  scenes.forEach(sc => {
    const wrap = document.createElement('div');
    wrap.className = 'thumb' + (sc.id === _currentId ? ' active' : '');
    wrap.dataset.sid = sc.id;

    // 이미지 or fallback
    const imgEl = document.createElement('img');
    imgEl.src = sc.thumbSrc;
    imgEl.alt = sc.name;
    imgEl.onerror = function() {
      this.style.display = 'none';
      const fb = document.createElement('div');
      fb.className = 'thumb-fallback';
      fb.textContent = sc.name.slice(0, 2);
      wrap.insertBefore(fb, wrap.firstChild);
    };
    wrap.appendChild(imgEl);

    const name = document.createElement('div');
    name.className = 'thumb-name';
    name.textContent = sc.name;
    wrap.appendChild(name);

    wrap.addEventListener('click', () => switchScene(sc.id));
    tRow.appendChild(wrap);
  });
}

// ─── 씬 전환 시 UI 업데이트 ──────────────────────────────
function updateNavUI(id) {
  // 썸네일 active 표시
  document.querySelectorAll('.thumb').forEach(el => {
    el.classList.toggle('active', el.dataset.sid === id);
  });

  // 그리드 아이템 active 표시
  document.querySelectorAll('.grid-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sid === id);
  });

  // 해당 씬의 그룹 탭 활성화
  const sc = _data.scenes.find(s => s.id === id);
  if (!sc) return;
  const gid = sc.groupId;
  const tabs = document.querySelectorAll('.g-tab');
  let targetTab = null;
  tabs.forEach(t => {
    if (t.dataset.gid === gid) targetTab = t;
    t.classList.remove('active');
  });
  if (targetTab) {
    targetTab.classList.add('active');
    renderThumbs(gid);
    // 전환 후 thumb active 재설정
    setTimeout(() => {
      document.querySelectorAll('.thumb').forEach(el => {
        el.classList.toggle('active', el.dataset.sid === id);
      });
    }, 10);
  }
}

function updateSceneTitle(id) {
  const sc = _data.scenes.find(s => s.id === id);
  if (!sc) return;
  const titleEl = document.getElementById('scene-title');
  const tourTitle = _data.tour.title || '가상투어';
  titleEl.textContent = `${tourTitle} · ${sc.name}`;
}

// ─── 브랜딩 적용 ─────────────────────────────────────────
function applyBranding() {
  const b = _data.branding;

  // 로고
  const logoBtn = document.getElementById('logo-btn');
  const tl = b?.logos?.tl;
  if (tl?.src) {
    logoBtn.innerHTML = `<img src="${tl.src}" alt="로고">`;
    if (tl.link) {
      logoBtn.style.cursor = 'pointer';
      logoBtn.onclick = () => window.open(tl.link, '_blank');
    }
  } else {
    // 기본 로고 SVG
    logoBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="11" stroke="#1a6fc4" stroke-width="1.5"/><path d="M8 13L13 7L18 13" stroke="#1a6fc4" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="13" cy="14" r="3" fill="#1a6fc4" opacity="0.65"/></svg>`;
  }

  // 제작자 표시
  const wm = b?.watermark;
  const wmEl = document.getElementById('watermark');
  if (wm?.show && wm.name) {
    const inner = wm.linkEnabled && wm.url
      ? `<a href="${wm.url}" target="${wm.newTab ? '_blank' : '_self'}">${wm.name}${wm.sub ? '<br>' + wm.sub : ''}</a>`
      : `${wm.name}${wm.sub ? '<br>' + wm.sub : ''}`;
    wmEl.innerHTML = `제작<br>${inner}`;
    wmEl.style.display = '';
  } else {
    wmEl.style.display = 'none';
  }
}

function applyBarrier() {
  const bar = _data.branding?.barrier;
  const el = document.getElementById('barrier');
  if (!bar?.show) return;
  const h = bar.mode === 'auto' ? 48 : (bar.height || 40);
  const op = (bar.opacity || 85) / 100;
  el.style.height = h + 'px';
  el.style.background = `rgba(0,0,0,${op})`;
  el.style.display = 'block';
}

// ─── 그리드 오버레이 ─────────────────────────────────────
function buildGridOverlay() {
  const body = document.getElementById('grid-body');
  body.innerHTML = '';
  const groups = _data.groups || [];

  groups.forEach(g => {
    const scenes = _data.scenes.filter(s => s.groupId === g.id);
    if (!scenes.length) return;

    const section = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.className = 'grid-label';
    lbl.textContent = g.name;
    section.appendChild(lbl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px;';

    scenes.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'grid-item' + (sc.id === _currentId ? ' active' : '');
      item.dataset.sid = sc.id;

      const img = document.createElement('img');
      img.src = sc.thumbSrc;
      img.alt = sc.name;
      img.onerror = function() {
        this.style.display = 'none';
        const fb = document.createElement('div');
        fb.className = 'grid-item-fallback';
        item.insertBefore(fb, item.firstChild);
      };
      item.appendChild(img);

      const name = document.createElement('div');
      name.className = 'grid-item-name';
      name.textContent = sc.name;
      item.appendChild(name);

      item.addEventListener('click', () => {
        toggleGrid();
        switchScene(sc.id);
      });
      grid.appendChild(item);
    });

    section.appendChild(grid);
    body.appendChild(section);
  });
}

function toggleGrid() {
  _gridOpen = !_gridOpen;
  const overlay = document.getElementById('grid-overlay');
  const btn = document.getElementById('grid-btn');
  if (_gridOpen) {
    buildGridOverlay();
    overlay.classList.add('show');
    btn.classList.add('on');
  } else {
    overlay.classList.remove('show');
    btn.classList.remove('on');
  }
  if (_projOpen) closeProj();
}

// ─── 프로젝션 팝업 ───────────────────────────────────────
function toggleProj() {
  _projOpen = !_projOpen;
  document.getElementById('proj-popup').classList.toggle('show', _projOpen);
  document.getElementById('proj-btn').classList.toggle('on', _projOpen);
}

function closeProj() {
  _projOpen = false;
  document.getElementById('proj-popup').classList.remove('show');
  document.getElementById('proj-btn').classList.remove('on');
}

function selectProj(mode, el) {
  document.querySelectorAll('#proj-popup .po').forEach(o => o.classList.remove('on'));
  el.classList.add('on');
  closeProj();

  if (!_viewer) return;
  if (mode === 'n') {
    _viewer.setStageType(Marzipano.WebGlStage);
  } else if (mode === 'm') {
    // Mirror ball — 구형 프로젝션
    _viewer.setStageType && _viewer.setStageType(Marzipano.WebGlStage);
  } else if (mode === 'p') {
    // Little planet — pitch를 -90으로
    const sc = _scenes[_currentId];
    if (sc) sc.mzScene.view().setParameters({ pitch: -Math.PI / 2, fov: 2.0 });
  }
}

// ─── UI 숨기기 ───────────────────────────────────────────
function toggleHide() {
  _uiHidden = !_uiHidden;
  document.body.classList.toggle('ui-hidden', _uiHidden);
  document.getElementById('restore-btn').classList.toggle('vis', _uiHidden);
}

// ─── 홈으로 ─────────────────────────────────────────────
function goHome() {
  const startId = _data.tour.startScene || _data.scenes[0].id;
  switchScene(startId);
}

// ─── 전체화면 ────────────────────────────────────────────
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

// ─── 정보 팝업 ───────────────────────────────────────────
function openInfoPopup(hs) {
  const popup = document.getElementById('info-popup');
  const c = hs.content || {};
  let html = `<div class="popup-close" onclick="closeInfoPopup()"><svg viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg></div>`;

  // 슬라이드 이미지
  const imgs = c.images || [];
  if (imgs.length) {
    _slideData = imgs;
    _slideIdx = 0;
    html += `<div class="slide-area" style="height:130px;" id="slide-area">
      <img id="slide-img" src="${imgs[0]}" alt="">
      ${imgs.length > 1 ? `
      <div class="slide-arr" style="left:5px;" onclick="changeSlide(-1)"><svg viewBox="0 0 14 14"><path d="M9 2L4 7L9 12"/></svg></div>
      <div class="slide-arr" style="right:5px;" onclick="changeSlide(1)"><svg viewBox="0 0 14 14"><path d="M5 2L10 7L5 12"/></svg></div>
      <div class="slide-nav" id="slide-nav">${imgs.map((_,i)=>`<div class="slide-dot${i===0?' on':''}" onclick="goSlide(${i})"></div>`).join('')}</div>
      ` : ''}
    </div>`;
  }

  // 텍스트
  if (c.title || c.desc) {
    html += `<div class="popup-body">`;
    if (c.title) html += `<div class="popup-title">${c.title}</div>`;
    if (c.desc) html += `<div class="popup-desc">${c.desc}</div>`;
    html += `</div>`;
  }

  // 유튜브
  if (c.youtube) {
    const vid = extractYtId(c.youtube);
    html += `<div style="padding:0 12px 8px;">
      <div class="yt-area" style="height:80px;border-radius:7px;overflow:hidden;" onclick="window.open('https://youtube.com/watch?v=${vid}','_blank')">
        <img src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" style="width:100%;height:100%;object-fit:cover;opacity:0.6;">
        <div style="position:absolute;"><div class="yt-play"><svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7V5z"/></svg></div></div>
      </div>
    </div>`;
  }

  // 링크 버튼
  if (c.link?.url) {
    html += `<div style="padding:0 12px 10px;">
      <a class="link-btn" href="${c.link.url}" target="_blank">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span class="link-btn-text">${c.link.text || '링크 바로가기'}</span>
        <span class="link-btn-arrow">↗</span>
      </a>
    </div>`;
  }

  popup.innerHTML = html;
  popup.classList.add('show');
}

function closeInfoPopup() {
  document.getElementById('info-popup').classList.remove('show');
}

function changeSlide(d) {
  _slideIdx = (_slideIdx + d + _slideData.length) % _slideData.length;
  updateSlide();
}
function goSlide(i) { _slideIdx = i; updateSlide(); }
function updateSlide() {
  const img = document.getElementById('slide-img');
  if (img) img.src = _slideData[_slideIdx];
  const dots = document.querySelectorAll('#slide-nav .slide-dot');
  dots.forEach((dot, i) => dot.classList.toggle('on', i === _slideIdx));
}

function extractYtId(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return m ? m[1] : '';
}

// ─── 시작 팝업 ───────────────────────────────────────────
function showStartPopup() {
  // 추후 구현 (이미지 없으면 스킵)
  const sp = _data.startPopup;
  const isMobile = window.innerWidth < 600;
  const src = isMobile ? sp.mobile?.src : sp.pc?.src;
  if (!src) return;
  // TODO: 시작 팝업 UI
}

// ─── 로딩 숨기기 ─────────────────────────────────────────
function hideLoader() {
  const l = document.getElementById('loader');
  l.classList.add('hide');
  setTimeout(() => l.style.display = 'none', 400);
}

// ─── 외부 클릭 시 팝업 닫기 ──────────────────────────────
document.addEventListener('click', e => {
  const pp = document.getElementById('proj-popup');
  const pb = document.getElementById('proj-btn');
  if (_projOpen && pp && !pp.contains(e.target) && !pb.contains(e.target)) closeProj();
});

// ─── 실행 ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init);
