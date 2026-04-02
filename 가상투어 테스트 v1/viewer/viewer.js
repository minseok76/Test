'use strict';

/* ============================================================
   데이터 로드
   우선순위: 1) sessionStorage(에디터 미리보기)
             2) ../data/tour.json
   ============================================================ */
let tourData = null;
let _viewer  = null;
let _scenes  = {};
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
  // ✅ 수정 1: 파일명 tour-data.json → tour.json
  try {
    const res = await fetch('../data/tour.json');
    if (!res.ok) throw new Error('fetch failed');
    tourData = await res.json();
  } catch(e) {
    console.warn('tour.json 로드 실패. 샘플 데이터 사용.');
    tourData = _sampleData();
  }
}

function _sampleData() {
  // ✅ 수정 2: tour.json 구조에 맞춘 샘플 데이터
  return {
    tour: {
      id: 'sample',
      title: '가상투어',
      startSceneId: 'sc-sample',
      autoRotate: false,
      autoRotateSpeed: 0.3
    },
    security: { editorPin: '1234', monitorPin: '5678' },
    display: { showSceneTitle: true, showFullscreenBtn: true, showNavigation: true },
    navigation: { fov: { min: 30, max: 120, default: 90 }, gyroscope: true, keyboardControl: true },
    branding: {
      watermark: { show: false, name: '', linkEnabled: false },
      barrier: { show: true },
      nadirPatch: { enabled: false },
      logos: []
    },
    startPopup: { enabled: false },
    groups: [{ id: 'g-sample', label: '샘플', color: '#50C8A0' }],
    scenes: [{
      id: 'sc-sample', groupId: 'g-sample', label: '샘플 장면',
      panoSrc: '', thumbSrc: '',
      initialView: { yaw: 0, pitch: 0, fov: 90 },
      hotspots: []
    }]
  };
}

/* ============================================================
   Viewer — 메인 컨트롤러
   ============================================================ */
const Viewer = (() => {

  async function init() {
    await loadData();
    if (!tourData) return;

    // ✅ 수정 3: tour.json 구조 기준 (tourData.tour.title)
    document.title = tourData.tour?.title || '가상투어';

    _initMarzipano();
    _buildAllScenes();
    _buildNav();
    _buildGrid();
    _applySettings();
    _bindKeys();

    // ✅ 수정 4: startSceneId (tour.json 필드명)
    const startId = tourData.tour?.startSceneId || tourData.scenes[0]?.id;
    _goScene(startId, false);

    // ✅ 수정 9: 팝업 enabled 체크 후 클래스 처리
    const overlay = document.getElementById('start-popup-overlay');
    if (!tourData.startPopup?.enabled) {
      overlay.classList.add('hide');
    } else {
      _showStartPopup();
    }
  }

  /* ── Marzipano 초기화 ── */
  function _initMarzipano() {
    const container = document.getElementById('viewer');
    _viewer = new Marzipano.Viewer(container, {
      controls: { mouseViewMode: 'drag' }
    });
    // ✅ 수정 5: navigation.gyroscope (tour.json 필드명)
    if (tourData.navigation?.gyroscope && window.DeviceOrientationEvent) {
      const gyro = new Marzipano.DeviceOrientationControlMethod();
      _viewer.controls().registerMethod('gyro', gyro);
    }
  }

  /* ── 전체 씬 빌드 ── */
  function _buildAllScenes() {
    // ✅ 수정 6: navigation.fov.default, scenes[] flat 구조
    const fovDeg  = tourData.navigation?.fov?.default || 90;
    const fov     = fovDeg * Math.PI / 180;
    const fovMin  = (tourData.navigation?.fov?.min || 30)  * Math.PI / 180;
    const fovMax  = (tourData.navigation?.fov?.max || 120) * Math.PI / 180;
    const limiter = Marzipano.RectilinearView.limit.traditional(fovMax, fovMin);

    tourData.scenes.forEach(sc => {
      if (!sc.panoSrc) return;
      const source   = Marzipano.ImageUrlSource.fromString(sc.panoSrc);
      const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
      const initYaw   = (sc.initialView?.yaw   || 0) * Math.PI / 180;
      const initPitch = (sc.initialView?.pitch  || 0) * Math.PI / 180;
      const initFov   = (sc.initialView?.fov    || fovDeg) * Math.PI / 180;
      const view = new Marzipano.RectilinearView({ yaw: initYaw, pitch: initPitch, fov: initFov }, limiter);
      _scenes[sc.id] = _viewer.createScene({ source, geometry, view });
    });
  }

  /* ── 네비게이션 UI 빌드 ── */
  function _buildNav() {
    const gRow = document.getElementById('g-row');
    const tRow = document.getElementById('t-row');
    gRow.innerHTML = '';
    tRow.innerHTML = '';

    // ✅ 수정 7: groups[] + scenes[] 분리 구조
    tourData.groups.forEach((grp, i) => {
      const hasScenes = tourData.scenes.some(s => s.groupId === grp.id);
      if (!hasScenes) return;
      const tab = document.createElement('div');
      tab.className = 'g-tab' + (i === 0 ? ' active' : '');
      tab.textContent = grp.label;  // ✅ name → label
      tab.dataset.groupId = grp.id;
      tab.addEventListener('click', () => _selectGroup(grp.id));
      gRow.appendChild(tab);
    });

    const firstGrp = tourData.groups.find(g => tourData.scenes.some(s => s.groupId === g.id));
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
    // ✅ 수정: scenes[] flat 구조에서 groupId로 필터
    const scenes = tourData.scenes.filter(s => s.groupId === groupId);
    scenes.forEach(sc => {
      const item = document.createElement('div');
      item.className = 't-item' + (sc.id === _currentId ? ' active' : '');
      item.dataset.sceneId = sc.id;
      item.innerHTML = `
        <div class="t-thumb">
          ${sc.thumbSrc
            ? `<img src="${sc.thumbSrc}" alt="${sc.label}">`
            : `<span class="t-thumb-label">${sc.label.substring(0,6).toUpperCase()}</span>`}
        </div>
        <div class="t-name">${sc.label}</div>`;  // ✅ name → label, thumb → thumbSrc
      item.addEventListener('click', () => goScene(sc.id));
      tRow.appendChild(item);
    });
  }

  function _updateThumbActive() {
    document.querySelectorAll('.t-item').forEach(el =>
      el.classList.toggle('active', el.dataset.sceneId === _currentId)
    );
    const grp = _findGroup(_currentId);
    if (grp) _selectGroup(grp.id);
  }

  /* ── 그리드 빌드 ── */
  function _buildGrid() {
    const body = document.getElementById('grid-body');
    body.innerHTML = '';
    tourData.groups.forEach(grp => {
      const scenes = tourData.scenes.filter(s => s.groupId === grp.id);
      if (!scenes.length) return;
      const section = document.createElement('div');
      section.innerHTML = `<div class="grid-group-label">${grp.label}</div>`; // ✅ name → label
      const grid = document.createElement('div');
      grid.className = 'grid-scenes';
      scenes.forEach(sc => {
        const el = document.createElement('div');
        el.className = 'grid-scene' + (sc.id === _currentId ? ' active' : '');
        el.dataset.sceneId = sc.id;
        el.innerHTML = `
          <div class="grid-scene-thumb">
            ${sc.thumbSrc ? `<img src="${sc.thumbSrc}" alt="">` : ''}
          </div>
          <div class="grid-scene-name">${sc.label}</div>`; // ✅ thumb → thumbSrc, name → label
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

    _renderMarkers(id);

    const sc = tourData.scenes.find(s => s.id === id); // ✅ flat 구조
    if (sc) {
      const el = document.getElementById('scene-title');
      // ✅ display.showSceneTitle, sc.label
      if (el) el.textContent = tourData.display?.showSceneTitle
        ? (tourData.tour?.title ? tourData.tour.title + ' · ' : '') + sc.label
        : '';
    }

    _updateThumbActive();

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
    document.querySelectorAll('.marker-wrap').forEach(el => el.remove());

    const sc = tourData.scenes.find(s => s.id === sceneId); // ✅ flat 구조
    const mScene = _scenes[sceneId];
    if (!sc?.hotspots?.length || !mScene) return; // ✅ markers → hotspots

    sc.hotspots.forEach(m => { // ✅ markers → hotspots
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
        } else if (m.targetSceneId) { // ✅ 수정 8: destScene → targetSceneId
          goScene(m.targetSceneId);
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

    // ✅ 수정 5: content.links[].label (tour.json 구조)
    const linksHtml = (marker.content?.links || []).map(l => `
      <a class="info-link-btn" href="${l.url}" target="${l.newTab ? '_blank' : '_self'}" rel="noopener">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        <span>${l.label || l.url}</span>  
        <span class="info-link-arrow">↗</span>
      </a>`).join('');

    // ✅ 수정 5: content.description, content.images[0]
    const imgSrc = marker.content?.images?.[0] || '';
    body.innerHTML = `
      ${imgSrc ? `<div class="info-thumb"><img src="${imgSrc}" alt=""></div>` : ''}
      <div class="info-text">
        <div class="info-title">${marker.content?.title || marker.label || ''}</div>
        ${marker.content?.description ? `<div class="info-desc">${marker.content.description}</div>` : ''}
      </div>
      ${linksHtml ? `<div class="info-links">${linksHtml}</div>` : ''}`;

    popup.style.display = 'block';
  }

  function closeInfoPopup() {
    document.getElementById('info-popup').style.display = 'none';
  }

  /* ── 설정 적용 ── */
  function _applySettings() {
    // ✅ 수정: tour.json branding 구조
    const wm = document.getElementById('watermark');
    const watermark = tourData.branding?.watermark;
    if (watermark?.show && watermark.name) {
      const link = watermark.linkEnabled && watermark.linkUrl
        ? `<a href="${watermark.linkUrl}" ${watermark.linkNewTab ? 'target="_blank"' : ''} rel="noopener">${watermark.name}</a>`
        : watermark.name;
      wm.innerHTML = link + (watermark.subtext ? `<br><span style="font-size:10px;opacity:0.7;">${watermark.subtext}</span>` : '');
      wm.style.display = 'block';
    }

    // 로고 슬롯
    const logos = tourData.branding?.logos || [];
    logos.forEach(logo => {
      const el = document.getElementById('logo-' + logo.position);
      if (!el || !logo.src) return;
      const size = logo.size || 48;
      el.innerHTML = `<img src="${logo.src}" width="${size}" height="${size}" alt="logo" style="border-radius:4px;object-fit:contain;">`;
      el.style.display = 'block';
    });

    // 전체화면 버튼
    if (!tourData.display?.showFullscreenBtn) {
      document.getElementById('btn-fs').style.display = 'none';
    }

    // 썸네일 네비
    if (!tourData.display?.showNavigation) {
      document.getElementById('nav-box').style.display = 'none';
    }
  }

  /* ── 홈 ── */
  function goHome() {
    const id = tourData.tour?.startSceneId || tourData.scenes[0]?.id;
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
    if (show) _buildGrid();
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
    const cfg = tourData.startPopup;
    if (!cfg?.enabled) return;

    if (cfg.showDontShowAgain && localStorage.getItem('popup_dismissed') === '1') return;

    const overlay = document.getElementById('start-popup-overlay');
    const img     = document.getElementById('popup-img');
    const timerEl = document.getElementById('popup-timer');

    // ✅ 수정: pc.imageSrc / mobile.imageSrc (tour.json 구조)
    const isMobile = window.innerWidth < 768;
    const src = isMobile ? cfg.mobile?.imageSrc : cfg.pc?.imageSrc;
    const linkUrl = isMobile ? cfg.mobile?.linkUrl : cfg.pc?.linkUrl;

    if (src) {
      img.src = src;
      img.style.display = 'block';
      if (linkUrl) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => window.open(linkUrl));
      }
    }

    setTimeout(() => {
      overlay.classList.remove('hide');

      if (cfg.autoCloseMs > 0) {
        let remaining = Math.round(cfg.autoCloseMs / 1000);
        timerEl.textContent = remaining + '초 후 닫힘';
        _popupTimer = setInterval(() => {
          remaining--;
          timerEl.textContent = remaining + '초 후 닫힘';
          if (remaining <= 0) { clearInterval(_popupTimer); closePopup(); }
        }, 1000);
      }
    }, cfg.delayMs || 0);
  }

  function closePopup(e) {
    if (e && e.target !== document.getElementById('start-popup-overlay')) return;
    clearInterval(_popupTimer);
    document.getElementById('start-popup-overlay').classList.add('hide');
    if (document.getElementById('popup-no-again')?.checked) {
      localStorage.setItem('popup_dismissed', '1');
    }
  }

  /* ── 키보드 단축키 ── */
  function _bindKeys() {
    if (!tourData.navigation?.keyboardControl) return;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeInfoPopup(); if (_projPopupOpen) toggleProjMenu(); }
      if (e.key === 'g' || e.key === 'G') toggleGrid();
      if (e.key === 'h' || e.key === 'H') toggleUI();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    });
  }

  /* ── 헬퍼 ── */
  function _findGroup(sceneId) {
    const sc = tourData.scenes.find(s => s.id === sceneId);
    if (!sc) return null;
    return tourData.groups.find(g => g.id === sc.groupId) || null;
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
