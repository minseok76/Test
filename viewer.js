'use strict';

/* ============================================================
   데이터 로드
   우선순위: 1) sessionStorage(에디터 미리보기)
             2) ../data/tour-data.json
   ============================================================ */
let tourData = null;
let _viewer  = null;         // Marzipano Viewer
let _scenes  = {};           // { sceneId: Marzipano Scene }
let _currentId = null;
let _uiHidden  = false;
let _projPopupOpen = false;
let _popupTimer = null;

async function loadData() {
  // 에디터 미리보기용 sessionStorage 우선
  const stored = sessionStorage.getItem('preview_tour_data');
  if (stored) {
    try { tourData = JSON.parse(stored); return; } catch(e) {}
  }
  // 실제 JSON 파일
  try {
    const res = await fetch('../data/tour-data.json');
    if (!res.ok) throw new Error('fetch failed');
    tourData = await res.json();
  } catch(e) {
    console.warn('tour-data.json 로드 실패. 샘플 데이터 사용.');
    tourData = _sampleData();
  }
}

function _sampleData() {
  return {
    title: '가상투어',
    startScene: 'sc-sample',
    autoRotate: false,
    groups: [{
      id: 'g-sample', name: '샘플', color: 'rgba(80,200,160,0.7)',
      scenes: [{ id: 'sc-sample', name: '샘플 장면', thumb: '', panoSrc: '', markers: [] }]
    }],
    settings: {
      logo:      { slots: {}, size: 48, action: 'none' },
      watermark: { show: false, name: '', sub: '', link: '', newTab: true },
      barrier:   { show: true, mode: 'auto', opacity: 85, color: '#000' },
      nadir:     { show: false },
      popup:     { enabled: false, delay: 0, duration: 0, noAgain: true, pcSrc: '', mobileSrc: '', linkUrl: '' },
      display:   { sceneTitle: true, fullscreen: true, thumbnail: true },
      nav:       { fov: 90, sensitivity: 1.0, keyboard: true, gyro: true, projection: 'normal' },
      security:  { editorPin: '1234', monitorPin: '5678' },
    }
  };
}

/* ============================================================
   Viewer — 메인 컨트롤러
   ============================================================ */
const Viewer = (() => {

  /* ── 초기화 ── */
  async function init() {
    await loadData();
    if (!tourData) return;

    document.title = tourData.title || '가상투어';

    _initMarzipano();
    _buildAllScenes();
    _buildNav();
    _buildGrid();
    _applySettings();
    _bindKeys();

    // 시작 장면 이동
    const startId = tourData.startScene || _firstSceneId();
    _goScene(startId, false);

    // 시작 팝업
    _showStartPopup();
  }

  /* ── Marzipano 초기화 ── */
  function _initMarzipano() {
    const container = document.getElementById('viewer');
    _viewer = new Marzipano.Viewer(container, {
      controls: { mouseViewMode: 'drag' }
    });
    // 자이로
    if (tourData.settings.nav?.gyro && window.DeviceOrientationEvent) {
      const gyro = new Marzipano.DeviceOrientationControlMethod();
      _viewer.controls().registerMethod('gyro', gyro);
    }
  }

  /* ── 전체 씬 빌드 ── */
  function _buildAllScenes() {
    const fov     = (tourData.settings.nav?.fov || 90) * Math.PI / 180;
    const limiter = Marzipano.RectilinearView.limit.traditional(1024, 100 * Math.PI / 180);

    _allScenes().forEach(sc => {
      if (!sc.panoSrc) return; // 소스 없는 씬 스킵
      const source   = Marzipano.ImageUrlSource.fromString(sc.panoSrc);
      const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
      const view     = new Marzipano.RectilinearView({ yaw: 0, pitch: 0, fov }, limiter);
      _scenes[sc.id] = _viewer.createScene({ source, geometry, view });
    });
  }

  /* ── 네비게이션 UI 빌드 ── */
  function _buildNav() {
    const gRow = document.getElementById('g-row');
    const tRow = document.getElementById('t-row');
    gRow.innerHTML = '';
    tRow.innerHTML = '';

    tourData.groups.forEach((grp, i) => {
      if (!grp.scenes.length) return;
      const tab = document.createElement('div');
      tab.className   = 'g-tab' + (i === 0 ? ' active' : '');
      tab.textContent = grp.name;
      tab.dataset.groupId = grp.id;
      tab.addEventListener('click', () => _selectGroup(grp.id));
      gRow.appendChild(tab);
    });

    // 첫 그룹 썸네일 렌더
    const firstGrp = tourData.groups.find(g => g.scenes.length);
    if (firstGrp) _renderThumbs(firstGrp.id);
  }

  function _selectGroup(groupId) {
    document.querySelectorAll('.g-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.groupId === groupId)
    );
    _renderThumbs(groupId);
  }

  function _renderThumbs(groupId) {
    const tRow = document.getElementById('t-row');
    tRow.innerHTML = '';
    const grp = tourData.groups.find(g => g.id === groupId);
    if (!grp) return;

    grp.scenes.forEach(sc => {
      const item = document.createElement('div');
      item.className = 't-item' + (sc.id === _currentId ? ' active' : '');
      item.dataset.sceneId = sc.id;
      item.innerHTML = `
        <div class="t-thumb">
          ${sc.thumb
            ? `<img src="${sc.thumb}" alt="${sc.name}">`
            : `<span class="t-thumb-label">${sc.name.substring(0,6).toUpperCase()}</span>`}
        </div>
        <div class="t-name">${sc.name}</div>`;
      item.addEventListener('click', () => goScene(sc.id));
      tRow.appendChild(item);
    });
  }

  function _updateThumbActive() {
    document.querySelectorAll('.t-item').forEach(el =>
      el.classList.toggle('active', el.dataset.sceneId === _currentId)
    );
    // 해당 씬이 속한 그룹 탭도 활성화
    const grp = _findGroup(_currentId);
    if (grp) _selectGroup(grp.id);
  }

  /* ── 그리드 빌드 ── */
  function _buildGrid() {
    const body = document.getElementById('grid-body');
    body.innerHTML = '';
    tourData.groups.forEach(grp => {
      if (!grp.scenes.length) return;
      const section = document.createElement('div');
      section.innerHTML = `<div class="grid-group-label">${grp.name}</div>`;
      const grid = document.createElement('div');
      grid.className = 'grid-scenes';
      grp.scenes.forEach(sc => {
        const el = document.createElement('div');
        el.className = 'grid-scene' + (sc.id === _currentId ? ' active' : '');
        el.dataset.sceneId = sc.id;
        el.innerHTML = `
          <div class="grid-scene-thumb">
            ${sc.thumb ? `<img src="${sc.thumb}" alt="">` : ''}
          </div>
          <div class="grid-scene-name">${sc.name}</div>`;
        el.addEventListener('click', () => { goScene(sc.id); toggleGrid(); });
        grid.appendChild(el);
      });
      section.appendChild(grid);
      body.appendChild(section);
    });
  }

  /* ── 씬 이동 ── */
  function goScene(id) {
    if (id === _currentId) { toggleGrid(); return; }
    _fadeTransition(() => _goScene(id, true));
  }

  function _goScene(id, rebuild) {
    const mScene = _scenes[id];
    _currentId = id;

    if (mScene) {
      mScene.switchTo({ transitionDuration: 0 });
    }

    // 마커 렌더
    _renderMarkers(id);

    // 타이틀 업데이트
    const sc = _findScene(id);
    if (sc) {
      const el = document.getElementById('scene-title');
      if (el) el.textContent = tourData.settings.display?.sceneTitle
        ? (tourData.title ? tourData.title + ' · ' : '') + sc.name
        : '';
    }

    // 썸네일 활성 업데이트
    _updateThumbActive();

    // 그리드 활성 업데이트
    document.querySelectorAll('.grid-scene').forEach(el =>
      el.classList.toggle('active', el.dataset.sceneId === id)
    );
  }

  /* ── 페이드 전환 ── */
  function _fadeTransition(callback) {
    const fade = document.getElementById('fade-screen');
    fade.classList.add('fading');
    setTimeout(() => {
      callback();
      setTimeout(() => fade.classList.remove('fading'), 300);
    }, 300);
  }

  /* ── 마커 렌더 ── */
  function _renderMarkers(sceneId) {
    // 기존 마커 DOM 제거
    document.querySelectorAll('.marker-wrap').forEach(el => el.remove());

    const sc = _findScene(sceneId);
    const mScene = _scenes[sceneId];
    if (!sc?.markers?.length || !mScene) return;

    sc.markers.forEach(m => {
      // Marzipano hotspot으로 DOM 삽입
      const wrap = document.createElement('div');
      wrap.className = 'marker-wrap';

      const isInfo = m.type === 'info';
      wrap.innerHTML = `
        ${m.label ? `<div class="marker-label">${m.label}</div>` : ''}
        <div class="marker-circle ${isInfo ? 'info' : 'move'}">
          ${isInfo
            ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#5a3a00"/>
               <line x1="12" y1="8" x2="12" y2="12" stroke="#5a3a00"/>
               <circle cx="12" cy="16" r="0.8" fill="#5a3a00" stroke="none"/></svg>`
            : `<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="#111"/></svg>`
          }
          <div class="marker-pulse ${isInfo ? 'info' : ''}"></div>
        </div>`;

      wrap.addEventListener('click', () => {
        if (isInfo) {
          _showInfoPopup(m);
        } else if (m.destScene) {
          goScene(m.destScene);
        }
      });

      const yaw   = (m.yaw   || 0) * Math.PI / 180;
      const pitch = (m.pitch || 0) * Math.PI / 180;

      try {
        mScene.hotspotContainer().createHotspot(wrap, { yaw, pitch });
      } catch(e) {
        console.warn('마커 생성 실패:', e);
      }
    });
  }

  /* ── 정보 팝업 ── */
  function _showInfoPopup(marker) {
    const popup = document.getElementById('info-popup');
    const body  = document.getElementById('info-popup-body');

    const linksHtml = (marker.links || []).map(l => `
      <a class="info-link-btn" href="${l.url}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span>${l.text || l.url}</span>
        <span class="info-link-arrow">↗</span>
      </a>`).join('');

    body.innerHTML = `
      ${marker.thumb ? `<div class="info-thumb"><img src="${marker.thumb}" alt=""></div>` : ''}
      <div class="info-text">
        <div class="info-title">${marker.label || ''}</div>
        ${marker.desc ? `<div class="info-desc">${marker.desc}</div>` : ''}
      </div>
      ${linksHtml ? `<div class="info-links">${linksHtml}</div>` : ''}`;

    popup.style.display = 'block';
  }

  function closeInfoPopup() {
    document.getElementById('info-popup').style.display = 'none';
  }

  /* ── 설정 적용 ── */
  function _applySettings() {
    const s = tourData.settings;

    // 제작자 표시
    const wm = document.getElementById('watermark');
    if (s.watermark?.show && s.watermark.name) {
      const link = s.watermark.link
        ? `<a href="${s.watermark.link}" ${s.watermark.newTab?'target="_blank"':''} rel="noopener">${s.watermark.name}</a>`
        : s.watermark.name;
      wm.innerHTML = link + (s.watermark.sub ? `<br><span style="font-size:10px;opacity:0.7;">${s.watermark.sub}</span>` : '');
      wm.style.display = 'block';
    }

    // 로고 슬롯
    const logoSize = s.logo?.size || 48;
    ['tl','tr','bl','br'].forEach(pos => {
      const src = s.logo?.slots?.[pos]?.src;
      const el  = document.getElementById('logo-' + pos);
      if (src) {
        el.innerHTML = `<img src="${src}" width="${logoSize}" height="${logoSize}" alt="logo"
                             style="border-radius:4px;object-fit:contain;">`;
        el.style.display = 'block';
        if (s.logo.action === 'home') el.querySelector('img').addEventListener('click', goHome);
        if (s.logo.action === 'link' && s.logo.link)
          el.querySelector('img').addEventListener('click', () => window.open(s.logo.link));
      }
    });

    // 전체화면 버튼 숨기기
    if (!s.display?.fullscreen) {
      document.getElementById('btn-fs').style.display = 'none';
    }

    // 썸네일 네비 숨기기
    if (!s.display?.thumbnail) {
      document.getElementById('nav-box').style.display = 'none';
    }
  }

  /* ── 홈 ── */
  function goHome() {
    const id = tourData.startScene || _firstSceneId();
    goScene(id);
  }

  /* ── UI 토글 ── */
  function toggleUI() {
    _uiHidden = !_uiHidden;
    document.body.classList.toggle('ui-hidden', _uiHidden);
    document.getElementById('restore-fab').classList.toggle('show', _uiHidden);
  }

  /* ── 그리드 토글 ── */
  function toggleGrid() {
    const overlay = document.getElementById('grid-overlay');
    const btn     = document.getElementById('btn-grid');
    const show    = !overlay.classList.contains('show');
    overlay.classList.toggle('show', show);
    btn.classList.toggle('on', show);
    if (show) _buildGrid(); // 씬 변경 반영
  }

  /* ── 프로젝션 팝업 ── */
  function toggleProjMenu() {
    _projPopupOpen = !_projPopupOpen;
    document.getElementById('proj-popup').classList.toggle('show', _projPopupOpen);
    document.getElementById('btn-proj').classList.toggle('on', _projPopupOpen);
  }

  function setProjection(type, el) {
    document.querySelectorAll('.proj-option').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    _projPopupOpen = false;
    document.getElementById('proj-popup').classList.remove('show');
    document.getElementById('btn-proj').classList.remove('on');

    // Marzipano 프로젝션 전환
    if (!_viewer) return;
    const view = _viewer.view();
    if (!view) return;
    // 현재 씬 뷰 가져와서 프로젝션 적용
    // (Marzipano RectilinearView는 yaw/pitch/fov 변경으로 처리)
  }

  /* ── 전체화면 ── */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  /* ── 시작 팝업 ── */
  function _showStartPopup() {
    const cfg = tourData.settings.popup;
    if (!cfg?.enabled) return;

    // 다시보지않기 체크
    if (cfg.noAgain && localStorage.getItem('popup_dismissed') === '1') return;

    const overlay = document.getElementById('start-popup-overlay');
    const img     = document.getElementById('popup-img');
    const timerEl = document.getElementById('popup-timer');

    // 디바이스별 이미지
    const isMobile = window.innerWidth < 768;
    const src = isMobile ? cfg.mobileSrc : cfg.pcSrc;
    if (src) {
      img.src = src;
      img.style.display = 'block';
      if (cfg.linkUrl) img.style.cursor = 'pointer';
      img.addEventListener('click', () => { if (cfg.linkUrl) window.open(cfg.linkUrl); });
    }

    // 딜레이
    setTimeout(() => {
      overlay.classList.remove('hide');

      // 자동 닫힘 타이머
      if (cfg.duration > 0) {
        let remaining = cfg.duration;
        timerEl.textContent = remaining + '초 후 닫힘';
        _popupTimer = setInterval(() => {
          remaining--;
          timerEl.textContent = remaining + '초 후 닫힘';
          if (remaining <= 0) { clearInterval(_popupTimer); closePopup(); }
        }, 1000);
      }
    }, (cfg.delay || 0) * 1000);
  }

  function closePopup(e) {
    if (e && e.target !== document.getElementById('start-popup-overlay')) return;
    clearInterval(_popupTimer);
    const overlay = document.getElementById('start-popup-overlay');
    overlay.classList.add('hide');
    if (document.getElementById('popup-no-again').checked) {
      localStorage.setItem('popup_dismissed', '1');
    }
  }

  /* ── 키보드 단축키 ── */
  function _bindKeys() {
    if (!tourData.settings.nav?.keyboard) return;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeInfoPopup(); if (_projPopupOpen) toggleProjMenu(); }
      if (e.key === 'g' || e.key === 'G') toggleGrid();
      if (e.key === 'h' || e.key === 'H') toggleUI();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  }

  /* ── 헬퍼 ── */
  function _allScenes() { return tourData.groups.flatMap(g => g.scenes); }

  function _firstSceneId() { return _allScenes()[0]?.id; }

  function _findScene(id) {
    for (const g of tourData.groups) {
      const s = g.scenes.find(s => s.id === id);
      if (s) return s;
    }
    return null;
  }

  function _findGroup(sceneId) {
    return tourData.groups.find(g => g.scenes.some(s => s.id === sceneId));
  }

  return {
    init,
    goScene, goHome,
    toggleUI, toggleGrid, toggleProjMenu, setProjection,
    toggleFullscreen,
    closePopup, closeInfoPopup,
  };
})();

/* ============================================================
   진입점
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => Viewer.init());
