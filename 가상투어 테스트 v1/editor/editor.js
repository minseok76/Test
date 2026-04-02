'use strict';

/* ============================================================
   tour.json 샘플 구조 (실제 파일 로드 전 임시 데이터)
   core/loader.js 완성 후 fetch('/data/tour-data.json')으로 교체
   ============================================================ */
let tourData = {
  title: '아주청소년문화의집 가상투어',
  startScene: 'entrance',
  autoRotate: true,
  groups: [
    {
      id: 'g-out',
      name: '외부',
      color: 'rgba(80,160,220,0.7)',
      scenes: [
        { id: 'entrance', name: '정문',        thumb: '', panoSrc: '' },
        { id: 'parking',  name: '자전거 거치대', thumb: '', panoSrc: '' },
      ]
    },
    {
      id: 'g-1f',
      name: '1층',
      color: 'rgba(200,120,80,0.7)',
      scenes: []
    },
    {
      id: 'g-2f',
      name: '2층',
      color: 'rgba(180,200,80,0.6)',
      scenes: []
    },
  ],
  settings: {
    logo: {},
    watermark: { show: true, name: '아주청소년운영위원회 조타' },
    barrier: { show: true, mode: 'auto', opacity: 85 },
    popup: { enabled: true, delay: 0.5, duration: 5, noAgain: true },
    display: { sceneTitle: true, fullscreen: true, thumbnail: true },
    nav: { fov: 90, sensitivity: 1.0, keyboard: true, gyro: true },
    security: { editorPin: '1234', monitorPin: '5678' },
  }
};

let currentSceneId = 'entrance';
let selectedMarkerId = null;
const history = [];   // undo stack
const redoStack = [];

/* ============================================================
   Editor — 메인 컨트롤러
   ============================================================ */
const Editor = (() => {

  function init() {
    renderSceneList();
    renderCurrentScene();
    Settings.init();
    bindGlobalKeys();
    bindGlobalDrag();
  }

  /* ── 탭 전환 ── */
  function switchTab(tab) {
    const isScene = tab === 'scene';
    document.getElementById('panel-scene').style.display    = isScene ? 'flex'  : 'none';
    document.getElementById('panel-settings').style.display = isScene ? 'none'  : 'flex';
    document.getElementById('tab-scene').className    = 'tab' + (isScene  ? ' active' : '');
    document.getElementById('tab-settings').className = 'tab' + (!isScene ? ' active' : '');
  }

  /* ── 장면 목록 렌더링 ── */
  function renderSceneList() {
    const container = document.getElementById('scene-list');
    container.innerHTML = '';

    tourData.groups.forEach(grp => {
      const grpEl = document.createElement('div');
      grpEl.className = 'grp';
      grpEl.dataset.groupId = grp.id;

      const collapsed = grp._collapsed;
      const arrow = collapsed
        ? '<path d="M2.5 1L5.5 4L2.5 7" fill="none" stroke="white" stroke-width="1.2"/>'
        : '<path d="M1 2.5L4 5.5L7 2.5" fill="none" stroke="white" stroke-width="1.2"/>';

      grpEl.innerHTML = `
        <div class="grp-head" onclick="Editor.toggleGroup('${grp.id}')">
          <div class="grp-dot" style="background:${grp.color};"></div>
          <input class="grp-name" value="${grp.name}"
                 onclick="event.stopPropagation()"
                 onchange="Editor.renameGroup('${grp.id}', this.value)"/>
          <svg width="8" height="8" viewBox="0 0 8 8" style="opacity:0.28;flex-shrink:0;">${arrow}</svg>
        </div>
        <div class="grp-body" id="grp-body-${grp.id}" style="${collapsed ? 'display:none' : ''}">
          ${grp.scenes.map(sc => renderSceneCard(sc)).join('')}
          <div class="add-row">
            <div class="add-btn accent" onclick="PhotoModal.open('${grp.id}')">+ 사진 추가</div>
            <div class="add-btn" onclick="Editor.addGroup()">+ 그룹</div>
          </div>
        </div>
      `;
      container.appendChild(grpEl);
    });

    // 그룹 없을 때 기본 추가 버튼
    if (tourData.groups.length === 0) {
      container.innerHTML = `
        <div class="add-row">
          <div class="add-btn accent" onclick="PhotoModal.open(null)">+ 사진 추가</div>
          <div class="add-btn" onclick="Editor.addGroup()">+ 그룹</div>
        </div>`;
    }

    updateCurrentSceneLabel();
  }

  function renderSceneCard(sc) {
    const isCurrent = sc.id === currentSceneId;
    const thumbStyle = sc.thumb
      ? `background:url(${sc.thumb}) center/cover;`
      : `background:linear-gradient(135deg,#1e3a50,#2a4030);`;
    return `
      <div class="sc${isCurrent ? ' current' : ''}" onclick="Editor.selectScene('${sc.id}')">
        ${isCurrent ? '<div class="current-badge">현재</div>' : ''}
        <div class="sc-thumb" style="${thumbStyle}">
          ${!sc.thumb ? `<span style="font-size:8px;color:rgba(255,255,255,0.15);letter-spacing:2px;">${sc.name.toUpperCase().substring(0,8)}</span>` : ''}
        </div>
        <div class="sc-bottom">
          <div class="drag-handle">
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
          </div>
          <input class="sc-input" value="${sc.name}"
                 style="${isCurrent ? 'color:rgba(255,210,80,0.95);' : ''}"
                 onclick="event.stopPropagation()"
                 onchange="Editor.renameScene('${sc.id}', this.value)"/>
        </div>
      </div>`;
  }

  function renderCurrentScene() {
    const scene = findScene(currentSceneId);
    if (!scene) return;

    // 센터 배경
    const bg = document.getElementById('center-bg');
    bg.style.backgroundImage = scene.panoSrc ? `url(${scene.panoSrc})` : '';

    updateCurrentSceneLabel();
    renderMarkers(scene.markers || []);
  }

  function updateCurrentSceneLabel() {
    const scene = findScene(currentSceneId);
    const el = document.getElementById('current-scene-label');
    if (el && scene) el.textContent = '현재 장면: ' + scene.name;
  }

  /* ── 장면 선택 ── */
  function selectScene(id) {
    currentSceneId = id;
    selectedMarkerId = null;
    renderSceneList();
    renderCurrentScene();
    resetMarkerPanel();
  }

  /* ── 마커 렌더링 ── */
  function renderMarkers(markers) {
    const layer = document.getElementById('marker-layer');
    layer.innerHTML = '';
    markers.forEach(m => {
      const el = document.createElement('div');
      el.className = 'marker' + (m.id === selectedMarkerId ? ' active' : '');
      el.dataset.markerId = m.id;
      el.style.left = (m.yaw / 360 * 100 + 50) + '%';
      el.style.top  = (m.pitch / 180 * 100 + 50) + '%';
      el.innerHTML = `
        <div class="m-dot"><div class="m-dot-inner"></div></div>
        <div class="m-label">${m.label || ''}</div>`;
      el.addEventListener('click', () => selectMarker(m.id));
      el.addEventListener('mousedown', e => startMarkerDrag(e, m.id));
      layer.appendChild(el);
    });
  }

  /* ── 마커 선택 ── */
  function selectMarker(id) {
    selectedMarkerId = id;
    const scene = findScene(currentSceneId);
    const marker = (scene?.markers || []).find(m => m.id === id);
    if (!marker) return;
    renderMarkers(scene.markers);
    renderMarkerPanel(marker);
  }

  function renderMarkerPanel(marker) {
    document.getElementById('marker-status').textContent = '선택됨 · 드래그로 이동';
    const panel = document.getElementById('marker-panel');
    panel.innerHTML = `
      <div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">마커 이름</div>
        <input class="s-input" style="width:100%;flex:none;" value="${marker.label || ''}"
               oninput="Editor.updateMarkerField('${marker.id}','label',this.value)"/>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">마커 타입</div>
        <select class="s-select" style="flex:none;width:100%;"
                onchange="Editor.updateMarkerField('${marker.id}','type',this.value)">
          <option value="move" ${marker.type==='move'?'selected':''}>이동 마커</option>
          <option value="info" ${marker.type==='info'?'selected':''}>정보 마커</option>
        </select>
      </div>
      ${marker.type === 'move' ? renderMoveDest(marker) : ''}
      <div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">위치</div>
        <div style="display:flex;gap:5px;">
          <div style="flex:1;">
            <div style="font-size:9px;color:rgba(255,255,255,0.26);margin-bottom:2px;">YAW</div>
            <div style="font-size:11px;padding:5px 8px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.7);">
              ${marker.yaw?.toFixed(1) ?? 0}°
            </div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;color:rgba(255,255,255,0.26);margin-bottom:2px;">PITCH</div>
            <div style="font-size:11px;padding:5px 8px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;color:rgba(255,255,255,0.7);">
              ${marker.pitch?.toFixed(1) ?? 0}°
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMoveDest(marker) {
    const allScenes = getAllScenes();
    const options = allScenes
      .filter(s => s.id !== currentSceneId)
      .map(s => `<option value="${s.id}" ${marker.destScene===s.id?'selected':''}>${s.name}</option>`)
      .join('');
    return `
      <div>
        <div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">이동 장면</div>
        <select class="s-select" style="flex:none;width:100%;"
                onchange="Editor.updateMarkerField('${marker.id}','destScene',this.value)">
          <option value="">— 선택 —</option>
          ${options}
        </select>
      </div>`;
  }

  function resetMarkerPanel() {
    document.getElementById('marker-status').textContent = '마커를 선택하세요';
    document.getElementById('marker-panel').innerHTML = `
      <div class="empty-hint">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style="opacity:0.2;">
          <circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.2"/>
          <line x1="11" y1="8" x2="11" y2="14" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
          <circle cx="11" cy="16" r="0.6" fill="white"/>
        </svg>
        <span>마커를 클릭하거나<br>아래 버튼으로 추가하세요</span>
      </div>`;
  }

  /* ── 마커 드래그 ── */
  function startMarkerDrag(e, markerId) {
    e.preventDefault();
    const layer = document.getElementById('marker-layer');
    const rect  = layer.getBoundingClientRect();

    function onMove(ev) {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top)  / rect.height;
      const yaw   = (x - 0.5) * 360;
      const pitch = (y - 0.5) * 180;
      updateMarkerPos(markerId, yaw, pitch);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      pushHistory();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function updateMarkerPos(markerId, yaw, pitch) {
    const scene = findScene(currentSceneId);
    if (!scene?.markers) return;
    const m = scene.markers.find(m => m.id === markerId);
    if (!m) return;
    m.yaw   = Math.max(-180, Math.min(180, yaw));
    m.pitch = Math.max(-90,  Math.min(90,  pitch));
    renderMarkers(scene.markers);
    if (selectedMarkerId === markerId) renderMarkerPanel(m);
    document.getElementById('center-info').textContent =
      `yaw: ${m.yaw.toFixed(1)}° · pitch: ${m.pitch.toFixed(1)}°`;
  }

  /* ── 마커 추가 ── */
  function addMarker(type) {
    const scene = findScene(currentSceneId);
    if (!scene) return;
    if (!scene.markers) scene.markers = [];
    const id = 'm-' + Date.now();
    scene.markers.push({
      id, type,
      label: type === 'move' ? '이동' : '정보',
      yaw: 0, pitch: 0,
      destScene: null
    });
    pushHistory();
    renderMarkers(scene.markers);
    selectMarker(id);
  }

  /* ── 마커 필드 업데이트 ── */
  function updateMarkerField(markerId, field, value) {
    const scene = findScene(currentSceneId);
    const m = scene?.markers?.find(m => m.id === markerId);
    if (!m) return;
    m[field] = value;
    renderMarkers(scene.markers);
    renderMarkerPanel(m);
  }

  /* ── 마커 삭제 / 확정 ── */
  function deleteMarker() {
    if (!selectedMarkerId) return;
    const scene = findScene(currentSceneId);
    if (!scene?.markers) return;
    scene.markers = scene.markers.filter(m => m.id !== selectedMarkerId);
    selectedMarkerId = null;
    pushHistory();
    renderMarkers(scene.markers);
    resetMarkerPanel();
  }

  function confirmMarker() {
    selectedMarkerId = null;
    const scene = findScene(currentSceneId);
    renderMarkers(scene?.markers || []);
    resetMarkerPanel();
  }

  /* ── 그룹 관련 ── */
  function toggleGroup(groupId) {
    const grp = tourData.groups.find(g => g.id === groupId);
    if (!grp) return;
    grp._collapsed = !grp._collapsed;
    renderSceneList();
  }

  function addGroup() {
    const id = 'g-' + Date.now();
    const colors = ['rgba(80,200,160,0.7)','rgba(200,120,80,0.7)','rgba(100,160,220,0.7)','rgba(180,80,220,0.6)'];
    tourData.groups.push({
      id,
      name: '새 그룹',
      color: colors[tourData.groups.length % colors.length],
      scenes: []
    });
    pushHistory();
    renderSceneList();
  }

  function renameGroup(groupId, name) {
    const grp = tourData.groups.find(g => g.id === groupId);
    if (grp) { grp.name = name; pushHistory(); }
  }

  function renameScene(sceneId, name) {
    const scene = findScene(sceneId);
    if (scene) { scene.name = name; pushHistory(); updateCurrentSceneLabel(); }
  }

  /* ── FOV 토글 ── */
  function toggleSetFov() {
    const btn = document.getElementById('btn-set-fov');
    btn.classList.toggle('bb-on');
  }

  /* ── 미리보기 / 내보내기 ── */
  function preview() {
    window.open('../viewer/index.html', '_blank');
  }

  function exportJSON() {
    const json = JSON.stringify(tourData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tour-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function close() {
    if (confirm('에디터를 닫을까요? 저장되지 않은 변경사항이 있을 수 있습니다.')) {
      window.close();
    }
  }

  /* ── Undo / Redo ── */
  function pushHistory() {
    history.push(JSON.stringify(tourData));
    redoStack.length = 0;
    if (history.length > 50) history.shift();
    document.getElementById('save-label').textContent = '변경됨';
    updateUndoButtons();
  }

  function undo() {
    if (!history.length) return;
    redoStack.push(JSON.stringify(tourData));
    tourData = JSON.parse(history.pop());
    renderSceneList();
    renderCurrentScene();
    updateUndoButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    history.push(JSON.stringify(tourData));
    tourData = JSON.parse(redoStack.pop());
    renderSceneList();
    renderCurrentScene();
    updateUndoButtons();
  }

  function updateUndoButtons() {
    const undo = document.getElementById('btn-undo');
    const redo  = document.getElementById('btn-redo');
    if (undo) undo.classList.toggle('dim', history.length === 0);
    if (redo) redo.classList.toggle('dim', redoStack.length === 0);
  }

  /* ── 키보드 단축키 ── */
  function bindGlobalKeys() {
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === 'Escape') { selectedMarkerId = null; resetMarkerPanel(); }
    });
  }

  /* ── 전역 드래그 감지 (파일 드래그 시 모달 자동 오픈) ── */
  function bindGlobalDrag() {
    let counter = 0;
    document.addEventListener('dragenter', e => {
      if ([...e.dataTransfer.types].includes('Files')) {
        counter++;
        document.getElementById('drag-overlay').classList.add('show');
      }
    });
    document.addEventListener('dragleave', () => {
      counter--;
      if (counter <= 0) {
        counter = 0;
        document.getElementById('drag-overlay').classList.remove('show');
      }
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      counter = 0;
      document.getElementById('drag-overlay').classList.remove('show');
      const files = [...e.dataTransfer.files].filter(f => f.type.match(/image\/(jpeg|png)/));
      if (files.length) {
        // 모달 열고 바로 파일 처리
        PhotoModal.open(null);
        PhotoModal.processFiles(files);
      }
    });
  }

  /* ── 헬퍼 ── */
  function findScene(id) {
    for (const g of tourData.groups) {
      const s = g.scenes.find(s => s.id === id);
      if (s) return s;
    }
    return null;
  }

  function getAllScenes() {
    return tourData.groups.flatMap(g => g.scenes);
  }

  return {
    init, switchTab,
    renderSceneList, renderCurrentScene,
    selectScene,
    addMarker, updateMarkerField, deleteMarker, confirmMarker,
    toggleGroup, addGroup, renameGroup, renameScene,
    toggleSetFov,
    preview, exportJSON, close,
    undo, redo,
    findScene, getAllScenes,
    get tourData() { return tourData; },
    pushHistory,
  };
})();


/* ============================================================
   Settings — 투어 설정 탭
   ============================================================ */
const Settings = (() => {
  const MENUS = ['basic','logo','watermark','barrier','nadir','popup','display','nav','security','etc'];

  function init() {
    sw('basic');
  }

  function sw(key) {
    MENUS.forEach(k => {
      const m = document.getElementById('sm-' + k);
      if (m) m.className = 's-menu' + (k === key ? ' on' : '');
    });
    render(key);
  }

  function render(key) {
    const container = document.getElementById('settings-right');
    const s = tourData.settings;
    const templates = {

      basic: () => `
        <div class="s-sec show">
          <div class="s-title">기본 정보</div>
          <div class="s-row"><span class="s-label">투어 제목</span>
            <input class="s-input" style="flex:3;" value="${tourData.title}"
                   oninput="Settings.set('title',this.value)"/></div>
          <div class="s-row"><span class="s-label">시작 장면</span>
            <select class="s-select" onchange="Settings.set('startScene',this.value)">
              ${Editor.getAllScenes().map(sc =>
                `<option value="${sc.id}" ${tourData.startScene===sc.id?'selected':''}>${sc.name}</option>`
              ).join('')}
            </select></div>
          <div class="s-row"><span class="s-label">자동 회전</span>
            <div class="toggle ${tourData.autoRotate?'on':''}"
                 onclick="this.classList.toggle('on');Settings.set('autoRotate',this.classList.contains('on'))">
              <div class="toggle-knob"></div></div></div>
        </div>`,

      watermark: () => `
        <div class="s-sec show">
          <div class="s-title">제작자 표시</div>
          <div class="s-row"><span class="s-label">표시 여부</span>
            <div class="toggle ${s.watermark.show?'on':''}"
                 onclick="this.classList.toggle('on');Settings.setNested('watermark','show',this.classList.contains('on'))">
              <div class="toggle-knob"></div></div></div>
          <div class="s-row"><span class="s-label">제작자명</span>
            <input class="s-input" style="flex:3;" value="${s.watermark.name||''}"
                   oninput="Settings.setNested('watermark','name',this.value)"/></div>
          <div class="s-row"><span class="s-label">부가 텍스트</span>
            <input class="s-input" style="flex:3;" placeholder="기관명, 촬영일 등"
                   value="${s.watermark.sub||''}"
                   oninput="Settings.setNested('watermark','sub',this.value)"/></div>
        </div>`,

      barrier: () => `
        <div class="s-sec show">
          <div class="s-title">하단 가림막</div>
          <div class="s-desc">카메라 삼각대·장비를 가리는 하단 UI 배경 바</div>
          <div class="s-row"><span class="s-label">가림막 표시</span>
            <div class="toggle ${s.barrier.show?'on':''}"
                 onclick="this.classList.toggle('on');Settings.setNested('barrier','show',this.classList.contains('on'))">
              <div class="toggle-knob"></div></div></div>
          <div class="s-row"><span class="s-label">높이 모드</span>
            <select class="s-select" onchange="Settings.setNested('barrier','mode',this.value)">
              <option value="auto"   ${s.barrier.mode==='auto'  ?'selected':''}>자동 (텍스트 높이)</option>
              <option value="custom" ${s.barrier.mode==='custom'?'selected':''}>직접 지정</option>
            </select></div>
          <div class="s-row"><span class="s-label">불투명도</span>
            <input class="s-input" type="number" style="width:60px;flex:none;" value="${s.barrier.opacity}"
                   oninput="Settings.setNested('barrier','opacity',+this.value)"/>
            <span style="font-size:11px;color:var(--text-3);">%</span></div>
        </div>`,

      nav: () => `
        <div class="s-sec show">
          <div class="s-title">네비게이션</div>
          <div class="s-row"><span class="s-label">초기 FOV</span>
            <input class="s-input" type="number" style="width:60px;flex:none;" value="${s.nav.fov}"
                   oninput="Settings.setNested('nav','fov',+this.value)"/>
            <span style="font-size:11px;color:var(--text-3);">° (30~120)</span></div>
          <div class="s-row"><span class="s-label">마우스 감도</span>
            <input class="s-input" type="number" style="width:60px;flex:none;" step="0.1" value="${s.nav.sensitivity}"
                   oninput="Settings.setNested('nav','sensitivity',+this.value)"/></div>
          <div class="s-row"><span class="s-label">키보드 조작</span>
            <div class="toggle ${s.nav.keyboard?'on':''}"
                 onclick="this.classList.toggle('on');Settings.setNested('nav','keyboard',this.classList.contains('on'))">
              <div class="toggle-knob"></div></div></div>
          <div class="s-row"><span class="s-label">모바일 자이로</span>
            <div class="toggle ${s.nav.gyro?'on':''}"
                 onclick="this.classList.toggle('on');Settings.setNested('nav','gyro',this.classList.contains('on'))">
              <div class="toggle-knob"></div></div></div>
        </div>`,

      security: () => `
        <div class="s-sec show">
          <div class="s-title">보안 설정</div>
          <div class="s-row"><span class="s-label">에디터 PIN</span>
            <input class="s-input" type="password" style="width:90px;flex:none;" value="${s.security.editorPin}"
                   oninput="Settings.setNested('security','editorPin',this.value)"/></div>
          <div class="s-row"><span class="s-label">모니터 PIN</span>
            <input class="s-input" type="password" style="width:90px;flex:none;" value="${s.security.monitorPin}"
                   oninput="Settings.setNested('security','monitorPin',this.value)"/></div>
          <div class="s-desc" style="margin-top:4px;">PIN은 tour-data.json에 저장됩니다. GitHub Pages에서는 누구나 JSON을 볼 수 있으므로 중요 정보는 저장하지 마세요.</div>
        </div>`,

      etc: () => `
        <div class="s-sec show">
          <div class="s-title">기타 설정</div>
          <div style="border:0.5px dashed rgba(255,255,255,0.1);border-radius:10px;padding:32px;text-align:center;">
            <span style="font-size:11px;color:rgba(255,255,255,0.2);">준비 중인 설정입니다</span>
          </div>
        </div>`,
    };

    const render = templates[key];
    container.innerHTML = render
      ? render()
      : `<div class="s-sec show"><div class="s-title">${key}</div><div class="s-desc">준비 중</div></div>`;
  }

  function set(key, value) {
    tourData[key] = value;
    Editor.pushHistory();
  }

  function setNested(section, key, value) {
    if (!tourData.settings[section]) tourData.settings[section] = {};
    tourData.settings[section][key] = value;
    Editor.pushHistory();
  }

  return { init, sw, render, set, setNested };
})();


/* ============================================================
   PhotoModal — 사진 추가 모달
   ============================================================ */
const PhotoModal = (() => {

  let pendingFiles = [];   // { id, name, file, objectUrl, dup }
  let targetGroupId = null;
  let dragCounter   = 0;

  /* ── 열기 ── */
  function open(groupId) {
    targetGroupId = groupId;
    pendingFiles  = [];

    // 그룹 셀렉트 채우기
    const sel = document.getElementById('modal-group-select');
    sel.innerHTML = tourData.groups
      .map(g => `<option value="${g.id}" ${g.id === groupId ? 'selected' : ''}>${g.name}</option>`)
      .join('');

    resetUI();
    document.getElementById('modal-add-photo').style.display = 'flex';
  }

  /* ── 닫기 ── */
  function close() {
    pendingFiles.forEach(f => { if (f.objectUrl) URL.revokeObjectURL(f.objectUrl); });
    pendingFiles = [];
    document.getElementById('modal-add-photo').style.display = 'none';
  }

  /* ── 오버레이 클릭 시 닫기 ── */
  function onOverlayClick(e) {
    if (e.target === document.getElementById('modal-add-photo')) close();
  }

  /* ── 파일 피커 ── */
  function openFilePicker() {
    document.getElementById('modal-file-input').click();
  }

  function onFileSelect(e) {
    const files = [...e.target.files].filter(isImageFile);
    if (files.length) processFiles(files);
    e.target.value = '';
  }

  /* ── 드래그 이벤트 ── */
  function onDragOver(e) {
    e.preventDefault();
    document.getElementById('modal-dropzone').classList.add('hover');
  }

  function onDragLeave(e) {
    if (!document.getElementById('modal-dropzone').contains(e.relatedTarget)) {
      document.getElementById('modal-dropzone').classList.remove('hover');
    }
  }

  function onDrop(e) {
    e.preventDefault();
    document.getElementById('modal-dropzone').classList.remove('hover');
    const files = [...e.dataTransfer.files].filter(isImageFile);
    if (files.length) processFiles(files);
  }

  /* ── 파일 처리 ── */
  function processFiles(files) {
    const existingNames = Editor.getAllScenes().map(s => s.name);

    files.forEach(f => {
      const nameNoExt = f.name.replace(/\.[^.]+$/, '');
      const dup       = existingNames.includes(nameNoExt) || pendingFiles.some(p => p.name === nameNoExt);
      const id        = 'pf-' + Date.now() + Math.random().toString(36).slice(2);
      const objectUrl = URL.createObjectURL(f);
      pendingFiles.push({ id, name: nameNoExt, file: f, objectUrl, dup, progress: 0, done: false });
    });

    showFileList();
    renderFileGrid();
    updateConfirmBtn();

    // 업로드 진행 시뮬레이션
    pendingFiles.filter(f => !f.done).forEach(pf => simulateProgress(pf.id));
  }

  /* ── 진행 시뮬레이션 ── */
  function simulateProgress(id) {
    const tick = setInterval(() => {
      const pf = pendingFiles.find(f => f.id === id);
      if (!pf) { clearInterval(tick); return; }

      pf.progress = Math.min(100, pf.progress + Math.random() * 20 + 10);

      const bar = document.getElementById('pb-' + id);
      if (bar) bar.style.width = pf.progress + '%';

      if (pf.progress >= 100) {
        clearInterval(tick);
        pf.done = true;
        if (bar) bar.style.background = 'rgba(80,200,160,0.9)';
      }
    }, 80);
  }

  /* ── UI 상태 ── */
  function resetUI() {
    document.getElementById('modal-dropzone').style.display   = 'flex';
    document.getElementById('modal-file-list').style.display  = 'none';
    document.getElementById('mfl-grid').innerHTML             = '';
    updateConfirmBtn();
  }

  function showFileList() {
    document.getElementById('modal-dropzone').style.display  = 'none';
    document.getElementById('modal-file-list').style.display = 'flex';
  }

  function renderFileGrid() {
    const grid = document.getElementById('mfl-grid');
    grid.innerHTML = '';

    pendingFiles.forEach(pf => {
      const card = document.createElement('div');
      card.className = 'mfl-card' + (pf.dup ? ' dup' : '');
      card.id = 'card-' + pf.id;
      card.innerHTML = `
        <div class="mfl-thumb">
          <img src="${pf.objectUrl}" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
          <div class="mfl-overlay">
            <div class="mfl-remove" onclick="PhotoModal.removeFile('${pf.id}')">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <line x1="1" y1="1" x2="7" y2="7" stroke="white" stroke-width="1.5"/>
                <line x1="7" y1="1" x2="1" y2="7" stroke="white" stroke-width="1.5"/>
              </svg>
            </div>
          </div>
          <div class="mfl-progress"><div class="mfl-progress-bar" id="pb-${pf.id}" style="width:0%"></div></div>
        </div>
        <div class="mfl-foot">
          <input class="mfl-name-input" value="${pf.name}"
                 onclick="event.stopPropagation()"
                 oninput="PhotoModal.renamePending('${pf.id}',this.value)"/>
          ${pf.dup ? '<div class="mfl-warn" title="동일 이름 장면이 이미 있습니다">⚠</div>' : ''}
        </div>`;
      grid.appendChild(card);
    });

    document.getElementById('mfl-count').textContent = pendingFiles.length + '개 파일';
  }

  /* ── 파일 이름 변경 ── */
  function renamePending(id, name) {
    const pf = pendingFiles.find(f => f.id === id);
    if (pf) pf.name = name;
  }

  /* ── 파일 제거 ── */
  function removeFile(id) {
    const idx = pendingFiles.findIndex(f => f.id === id);
    if (idx === -1) return;
    URL.revokeObjectURL(pendingFiles[idx].objectUrl);
    pendingFiles.splice(idx, 1);

    if (pendingFiles.length === 0) {
      resetUI();
    } else {
      renderFileGrid();
    }
    updateConfirmBtn();
  }

  /* ── 전체 제거 ── */
  function clearAll() {
    pendingFiles.forEach(f => URL.revokeObjectURL(f.objectUrl));
    pendingFiles = [];
    resetUI();
  }

  /* ── 확정 버튼 ── */
  function updateConfirmBtn() {
    const btn = document.getElementById('modal-btn-confirm');
    if (!btn) return;
    if (pendingFiles.length === 0) {
      btn.classList.add('disabled');
    } else {
      btn.classList.remove('disabled');
    }
  }

  /* ── 장면 추가 확정 ── */
  function confirm() {
    if (pendingFiles.length === 0) return;

    const groupId = document.getElementById('modal-group-select').value || targetGroupId;
    let grp = tourData.groups.find(g => g.id === groupId);

    // 그룹이 없으면 첫 번째 그룹 사용, 그것도 없으면 생성
    if (!grp) {
      if (tourData.groups.length === 0) {
        grp = { id: 'g-default', name: '기본', color: 'rgba(80,200,160,0.7)', scenes: [] };
        tourData.groups.push(grp);
      } else {
        grp = tourData.groups[0];
      }
    }

    pendingFiles.forEach(pf => {
      const id = 'sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      grp.scenes.push({
        id,
        name:    pf.name,
        thumb:   pf.objectUrl,   // 실제 구현 시 서버 업로드 후 경로로 교체
        panoSrc: pf.objectUrl,
        markers: []
      });
    });

    Editor.pushHistory();
    Editor.renderSceneList();

    // 첫 번째 추가 파일을 현재 장면으로
    if (grp.scenes.length > 0) {
      const lastAdded = grp.scenes[grp.scenes.length - pendingFiles.length];
      if (lastAdded) Editor.selectScene(lastAdded.id);
    }

    pendingFiles = [];   // objectUrl은 씬에서 계속 사용하므로 revoke 안 함
    close();
  }

  /* ── 헬퍼 ── */
  function isImageFile(f) {
    return f.type === 'image/jpeg' || f.type === 'image/png';
  }

  return {
    open, close, onOverlayClick, openFilePicker,
    onFileSelect, onDragOver, onDragLeave, onDrop,
    processFiles, removeFile, clearAll, renamePending, confirm,
  };
})();


/* ============================================================
   진입점
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => Editor.init());
