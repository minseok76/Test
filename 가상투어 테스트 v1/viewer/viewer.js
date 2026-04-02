// viewer/viewer.js — 뷰어 메인 로직
import { loadTourData, getScenesByGroup } from '../core/loader.js';
import { initViewer, buildScenes, getScene as getMarzipanoScene, setAutoRotate } from '../core/renderer.js';
import { initSceneManager, switchScene, onSceneChange, getCurrentSceneId } from '../core/sceneManager.js';
import { renderHotspots } from '../core/hotspot.js';
import CONFIG from '../config.js';

let tourData = null;
let uiVisible = true;
let gridOpen = false;
let projOpen = false;
let currentGroupId = null;
let infoSlideIdx = 0;
let infoSlideImages = [];
let startPopupTimer = null;

// ── 초기화 ──────────────────────────────────────
async function init() {
  try {
    tourData = await loadTourData(CONFIG.DATA_PATH);
    const panoEl = document.getElementById('pano');

    // Marzipano 초기화
    initViewer(panoEl);
    buildScenes(tourData);

    // 핫스팟 등록
    tourData.scenes.forEach(sceneData => {
      const mzScene = getMarzipanoScene(sceneData.id);
      if (mzScene) {
        renderHotspots(mzScene, sceneData, { onInfo: openInfoPopup });
      }
    });

    // 씬 변경 콜백
    onSceneChange(sceneId => {
      updateSceneTitle(sceneId);
      updateThumbActive(sceneId);
      updateGridActive(sceneId);
      if (tourData.tour.autoRotate) setAutoRotate(true, tourData.tour.autoRotateSpeed);
    });

    // UI 빌드
    buildGroupTabs();
    const startGroup = getGroupOfScene(tourData.tour.startSceneId);
    if (startGroup) selectGroup(startGroup);

    buildGridOverlay();
    buildWatermark();
    buildStartPopup();
    applyDisplay();

    // 씬 시작
    initSceneManager(tourData.tour.startSceneId);

    // 로딩 숨김
    setTimeout(() => document.getElementById('loading').classList.add('hide'), 400);

  } catch (err) {
    console.error('Viewer 초기화 실패:', err);
    document.getElementById('loading').innerHTML =
      `<p style="color:rgba(255,100,100,0.8)">데이터를 불러올 수 없습니다</p>`;
  }
}

// ── 그룹 탭 ──────────────────────────────────────
function buildGroupTabs() {
  const row = document.getElementById('group-row');
  row.innerHTML = '';
  tourData.groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'g-tab';
    btn.textContent = g.label;
    btn.dataset.groupId = g.id;
    btn.addEventListener('click', () => selectGroup(g.id));
    row.appendChild(btn);
  });
}

function selectGroup(groupId) {
  currentGroupId = groupId;
  document.querySelectorAll('.g-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.groupId === groupId);
  });
  buildThumbs(groupId);
}

// ── 썸네일 ──────────────────────────────────────
function buildThumbs(groupId) {
  const row = document.getElementById('thumb-row');
  row.innerHTML = '';
  const scenes = getScenesByGroup(tourData, groupId);
  const curId = getCurrentSceneId();
  scenes.forEach(s => {
    const item = document.createElement('div');
    item.className = 'thumb-item' + (s.id === curId ? ' active' : '');
    item.dataset.sceneId = s.id;
    item.innerHTML = `
      <img class="thumb-img" src="${s.thumbSrc}" alt="${s.label}"
           onerror="this.style.background='#1a2535';this.removeAttribute('src')">
      <div class="thumb-name">${s.label}</div>
    `;
    item.addEventListener('click', () => switchScene(s.id));
    row.appendChild(item);
  });
}

function updateThumbActive(sceneId) {
  document.querySelectorAll('.thumb-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sceneId === sceneId);
  });
  // 그룹이 달라지면 탭 자동 전환
  const group = getGroupOfScene(sceneId);
  if (group && group !== currentGroupId) selectGroup(group);
}

// ── 씬 타이틀 ──────────────────────────────────
function updateSceneTitle(sceneId) {
  const scene = tourData.scenes.find(s => s.id === sceneId);
  if (!scene) return;
  const title = document.getElementById('scene-title');
  if (title) title.textContent = `${tourData.tour.title} · ${scene.label}`;
}

// ── 그리드 오버레이 ──────────────────────────────
function buildGridOverlay() {
  const content = document.getElementById('grid-content');
  content.innerHTML = '';
  tourData.groups.forEach(g => {
    const scenes = getScenesByGroup(tourData, g.id);
    if (!scenes.length) return;
    const group = document.createElement('div');
    const curId = getCurrentSceneId();
    group.innerHTML = `<div class="grid-group-label">${g.label}</div>`;
    const row = document.createElement('div');
    row.className = 'grid-scene-row';
    scenes.forEach(s => {
      const item = document.createElement('div');
      item.className = 'grid-item' + (s.id === curId ? ' current' : '');
      item.dataset.sceneId = s.id;
      item.innerHTML = `
        <img src="${s.thumbSrc}" alt="${s.label}"
             onerror="this.style.background='#1a2535';this.removeAttribute('src')">
        <div class="grid-item-name">${s.label}</div>
      `;
      item.addEventListener('click', () => { toggleGrid(false); switchScene(s.id); });
      row.appendChild(item);
    });
    group.appendChild(row);
    content.appendChild(group);
  });
}

function updateGridActive(sceneId) {
  document.querySelectorAll('.grid-item').forEach(el => {
    el.classList.toggle('current', el.dataset.sceneId === sceneId);
  });
}

function toggleGrid(force) {
  gridOpen = force !== undefined ? force : !gridOpen;
  document.getElementById('grid-overlay').classList.toggle('show', gridOpen);
  document.getElementById('btn-grid').classList.toggle('active', gridOpen);
}

// ── 프로젝션 팝업 ──────────────────────────────
function toggleProj() {
  projOpen = !projOpen;
  document.getElementById('proj-popup').classList.toggle('show', projOpen);
  document.getElementById('btn-proj').classList.toggle('active', projOpen);
}

function setProjection(mode, el) {
  document.querySelectorAll('.proj-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  projOpen = false;
  document.getElementById('proj-popup').classList.remove('show');
  document.getElementById('btn-proj').classList.remove('active');
  // Marzipano 프로젝션 변경
  const viewer = window._viewer;
  if (!viewer) return;
  // 실제 Marzipano에서는 scene.view()로 프로젝션 변경
}

// ── UI 숨기기/복원 ──────────────────────────────
function toggleUI() {
  uiVisible = !uiVisible;
  ['#bottom-ui','#top-ui','#watermark','#bottom-grad'].forEach(sel => {
    document.querySelector(sel)?.classList.toggle('ui-hide', !uiVisible);
  });
  document.getElementById('restore-btn').classList.toggle('show', !uiVisible);
}

// ── 전체화면 ──────────────────────────────────
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ── 정보 팝업 ──────────────────────────────────
function openInfoPopup(hs) {
  const popup = document.getElementById('info-popup');
  const c = hs.content;

  // 슬라이드 이미지
  infoSlideImages = c.images || [];
  infoSlideIdx = 0;
  renderSlide();

  // 텍스트
  popup.querySelector('.popup-title').textContent = c.title || '';
  popup.querySelector('.popup-desc').textContent = c.description || '';

  // 유튜브
  const yt = popup.querySelector('.popup-youtube');
  if (c.youtubeUrl) {
    yt.style.display = 'flex';
    yt.onclick = () => window.open(c.youtubeUrl, '_blank');
  } else {
    yt.style.display = 'none';
  }

  // 링크
  const linksEl = popup.querySelector('.popup-links');
  linksEl.innerHTML = '';
  (c.links || []).forEach(lnk => {
    const a = document.createElement('a');
    a.className = 'popup-link-btn';
    a.href = lnk.url;
    if (lnk.newTab) a.target = '_blank';
    a.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      <span>${lnk.label}</span><span class="arrow">↗</span>
    `;
    linksEl.appendChild(a);
  });

  popup.classList.add('show');
}

function renderSlide() {
  const area = document.querySelector('.popup-slide-area');
  if (!infoSlideImages.length) {
    area.innerHTML = '<div class="no-img">NO IMAGE</div>';
    return;
  }
  const img = infoSlideImages[infoSlideIdx];
  area.innerHTML = `
    <img src="${img.src}" alt="${img.alt || ''}">
    ${infoSlideImages.length > 1 ? `
      <div class="slide-arr" style="left:5px" onclick="window._slideChange(-1)">
        <svg viewBox="0 0 14 14"><path d="M9 2L4 7L9 12"/></svg>
      </div>
      <div class="slide-arr" style="right:5px" onclick="window._slideChange(1)">
        <svg viewBox="0 0 14 14"><path d="M5 2L10 7L5 12"/></svg>
      </div>
      <div class="slide-dots">${infoSlideImages.map((_,i)=>`<div class="slide-dot${i===infoSlideIdx?' active':''}" onclick="window._goSlide(${i})"></div>`).join('')}</div>
    ` : ''}
  `;
}

window._slideChange = (d) => {
  infoSlideIdx = (infoSlideIdx + d + infoSlideImages.length) % infoSlideImages.length;
  renderSlide();
};
window._goSlide = (i) => { infoSlideIdx = i; renderSlide(); };

function closeInfoPopup() {
  document.getElementById('info-popup').classList.remove('show');
}

// ── 시작 팝업 ──────────────────────────────────
function buildStartPopup() {
  const sp = tourData.startPopup;
  if (!sp.enabled) return;

  const dontShow = localStorage.getItem('sp_hide_' + tourData.tour.id);
  if (dontShow) return;

  const isMobile = window.innerWidth < 768;
  const imgData = isMobile ? sp.mobile : sp.pc;
  if (!imgData.imageSrc) return;

  const popup = document.getElementById('start-popup');
  const modal = popup.querySelector('.sp-modal');
  modal.innerHTML = `
    <a href="${imgData.linkUrl || '#'}" ${imgData.linkUrl ? 'target="_blank"' : ''}>
      <img class="sp-img" src="${imgData.imageSrc}" alt="안내">
    </a>
    <div class="sp-footer">
      ${sp.showDontShowAgain ? `<span class="sp-skip" id="sp-skip">다시 보지 않기</span>` : '<span></span>'}
      <span class="sp-timer" id="sp-timer">${sp.autoCloseMs > 0 ? sp.autoCloseMs/1000 + '초 후 닫힘' : ''}</span>
      <span class="sp-close" id="sp-close">닫기 ✕</span>
    </div>
  `;

  setTimeout(() => popup.classList.add('show'), sp.delayMs);

  document.getElementById('sp-close')?.addEventListener('click', closeStartPopup);
  document.getElementById('sp-skip')?.addEventListener('click', () => {
    localStorage.setItem('sp_hide_' + tourData.tour.id, '1');
    closeStartPopup();
  });

  if (sp.autoCloseMs > 0) {
    let rem = sp.autoCloseMs / 1000;
    startPopupTimer = setInterval(() => {
      rem--;
      const el = document.getElementById('sp-timer');
      if (el) el.textContent = rem + '초 후 닫힘';
      if (rem <= 0) closeStartPopup();
    }, 1000);
  }
}

function closeStartPopup() {
  document.getElementById('start-popup').classList.remove('show');
  if (startPopupTimer) clearInterval(startPopupTimer);
}

// ── 제작자 표시 ──────────────────────────────────
function buildWatermark() {
  const wm = tourData.branding.watermark;
  const el = document.getElementById('watermark');
  if (!wm.show) { el.style.display = 'none'; return; }
  el.innerHTML = wm.linkEnabled
    ? `<a href="${wm.linkUrl}" ${wm.linkNewTab ? 'target="_blank"' : ''}>
         <div class="wm-name">${wm.name}</div>
         ${wm.subtext ? `<div class="wm-sub">${wm.subtext}</div>` : ''}
       </a>`
    : `<div class="wm-name">${wm.name}</div>
       ${wm.subtext ? `<div class="wm-sub">${wm.subtext}</div>` : ''}`;
}

// ── display 설정 적용 ────────────────────────────
function applyDisplay() {
  const d = tourData.display;
  const titleEl = document.getElementById('scene-title');
  if (titleEl) titleEl.style.display = d.showSceneTitle ? '' : 'none';
  const navBox = document.getElementById('nav-box');
  if (navBox) navBox.style.display = d.showNavigation ? '' : 'none';
  const fsBtn = document.getElementById('btn-fs');
  if (fsBtn) fsBtn.style.display = d.showFullscreenBtn ? '' : 'none';
}

// ── 유틸 ──────────────────────────────────────
function getGroupOfScene(sceneId) {
  const scene = tourData?.scenes.find(s => s.id === sceneId);
  return scene?.groupId || null;
}

// ── 전역 이벤트 바인딩 (HTML에서 호출) ────────────
window.onViewerLoad = init;
window.toggleGrid = toggleGrid;
window.toggleProj = toggleProj;
window.setProjection = setProjection;
window.toggleUI = toggleUI;
window.toggleFullscreen = toggleFullscreen;
window.goHome = () => switchScene(tourData.tour.startSceneId);
window.closeInfoPopup = closeInfoPopup;
window.closeStartPopup = closeStartPopup;

// ── 관리자 단축키 ─────────────────────────────────
document.addEventListener('keydown', e => {
  if (!e.ctrlKey || !e.shiftKey) return;
  if (e.key === 'E' || e.key === 'e') {
    e.preventDefault();
    window.location.href = '../editor/index.html';
  }
  if (e.key === 'S' || e.key === 's') {
    e.preventDefault();
    window.location.href = '../monitor/index.html';
  }
});

// 팝업 외부 클릭 닫기
document.addEventListener('click', e => {
  const projBtn = document.getElementById('btn-proj');
  const projPopup = document.getElementById('proj-popup');
  if (projOpen && projPopup && !projPopup.contains(e.target) && e.target !== projBtn) {
    projOpen = false;
    projPopup.classList.remove('show');
    projBtn?.classList.remove('active');
  }
});
