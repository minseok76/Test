// core/hotspot.js — 핫스팟 DOM 생성 (viewer용 렌더링)
import { switchScene } from './sceneManager.js';

// 씬의 모든 핫스팟을 Marzipano scene에 등록
export function renderHotspots(marzipanoScene, sceneData, { onInfo } = {}) {
  const container = marzipanoScene.hotspotContainer();

  sceneData.hotspots.forEach(hs => {
    const el = hs.type === 'link'
      ? createLinkHotspot(hs)
      : createInfoHotspot(hs, onInfo);

    const pos = {
      yaw:   hs.yaw   * Math.PI / 180,
      pitch: hs.pitch * Math.PI / 180
    };
    container.createHotspot(el, pos);
  });
}

function createLinkHotspot(hs) {
  const wrap = document.createElement('div');
  wrap.className = 'hs-wrap hs-link';
  wrap.innerHTML = `
    ${hs.labelMode !== 'click' ? `<div class="hs-label">${hs.label}</div>` : ''}
    <div class="hs-circle hs-circle-white">
      <div class="hs-pulse"></div>
      <div class="hs-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </div>
  `;
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hs.targetSceneId) switchScene(hs.targetSceneId);
  });
  if (hs.labelMode === 'hover') {
    const lbl = wrap.querySelector('.hs-label');
    if (lbl) { lbl.style.display = 'none'; }
    wrap.addEventListener('mouseenter', () => { if(lbl) lbl.style.display = 'block'; });
    wrap.addEventListener('mouseleave', () => { if(lbl) lbl.style.display = 'none'; });
  }
  return wrap;
}

function createInfoHotspot(hs, onInfo) {
  const wrap = document.createElement('div');
  wrap.className = 'hs-wrap hs-info';
  wrap.innerHTML = `
    ${hs.labelMode !== 'click' ? `<div class="hs-label hs-label-info">${hs.label}</div>` : ''}
    <div class="hs-circle hs-circle-yellow">
      <div class="hs-pulse hs-pulse-yellow"></div>
      <div class="hs-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/>
        </svg>
      </div>
    </div>
  `;
  wrap.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onInfo) onInfo(hs);
  });
  if (hs.labelMode === 'hover') {
    const lbl = wrap.querySelector('.hs-label');
    if (lbl) { lbl.style.display = 'none'; }
    wrap.addEventListener('mouseenter', () => { if(lbl) lbl.style.display = 'block'; });
    wrap.addEventListener('mouseleave', () => { if(lbl) lbl.style.display = 'none'; });
  }
  return wrap;
}
