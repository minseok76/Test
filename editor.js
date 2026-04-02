'use strict';

/* ============================================================
   tour-data.json 샘플 (core/loader.js 완성 후 fetch로 교체)
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
        { id: 'entrance', name: '정문',         thumb: '', panoSrc: '', markers: [] },
        { id: 'parking',  name: '자전거 거치대', thumb: '', panoSrc: '', markers: [] },
      ]
    },
    { id: 'g-1f', name: '1층', color: 'rgba(200,120,80,0.7)',  scenes: [] },
    { id: 'g-2f', name: '2층', color: 'rgba(180,200,80,0.6)',  scenes: [] },
  ],
  settings: {
    logo:      { slots: {}, size: 48, action: 'none' },
    watermark: { show: true, name: '아주청소년운영위원회 조타', sub: '', link: '', newTab: true },
    barrier:   { show: true, mode: 'auto', height: 40, opacity: 85, color: '#000000' },
    nadir:     { show: false, size: 25, opacity: 80, pitch: -90, src: '' },
    popup:     { enabled: true, delay: 0.5, duration: 5, noAgain: true, pcSrc: '', mobileSrc: '', linkUrl: '' },
    display:   { sceneTitle: true, fullscreen: true, thumbnail: true, coords: false },
    nav:       { fov: 90, sensitivity: 1.0, keyboard: true, gyro: true, projection: 'normal' },
    security:  { editorPin: '1234', monitorPin: '5678', showHint: false },
  }
};

let currentSceneId   = 'entrance';
let selectedMarkerId = null;
const _history = [];
const _redo    = [];

/* ============================================================
   PinGate — 에디터 진입 PIN 인증
   ============================================================ */
const PinGate = (() => {

  function init() {
    const gate = document.createElement('div');
    gate.id = 'pin-gate';
    gate.style.cssText = [
      'position:fixed;inset:0;background:#0a101a;z-index:1000;',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;',
      'transition:opacity 0.3s;'
    ].join('');
    gate.innerHTML = `
      <div style="width:44px;height:44px;border-radius:12px;
                  background:rgba(80,200,160,0.12);border:0.5px solid rgba(80,200,160,0.3);
                  display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="11" width="14" height="10" rx="2"
                stroke="rgba(80,200,160,0.8)" stroke-width="1.5"/>
          <path d="M8 11V7a4 4 0 018 0v4"
                stroke="rgba(80,200,160,0.8)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div style="text-align:center;">
        <div style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.85);">에디터 접근</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">PIN을 입력하세요</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;width:220px;">
        <input id="pin-input" type="password" placeholder="PIN 입력" maxlength="20"
               style="width:100%;background:rgba(255,255,255,0.06);
                      border:0.5px solid rgba(255,255,255,0.15);border-radius:9px;
                      padding:10px 14px;font-size:16px;color:#fff;outline:none;
                      text-align:center;letter-spacing:6px;font-family:monospace;"
               onkeydown="if(event.key==='Enter')PinGate.submit()"/>
        <div id="pin-error"
             style="font-size:11px;color:transparent;text-align:center;transition:color 0.2s;height:16px;">
          PIN이 올바르지 않습니다
        </div>
        <button onclick="PinGate.submit()"
                style="width:100%;padding:10px;border-radius:9px;cursor:pointer;
                       border:0.5px solid rgba(80,200,160,0.38);
                       background:rgba(80,200,140,0.14);
                       font-size:13px;font-weight:500;color:rgba(80,200,160,0.95);">
          확인
        </button>
      </div>
      <div style="font-size:10px;color:rgba(255,255,255,0.2);">기본 PIN: 1234</div>
    `;
    document.body.appendChild(gate);
    setTimeout(() => document.getElementById('pin-input')?.focus(), 120);
  }

  function submit() {
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    if (!input) return;

    if (input.value === tourData.settings.security.editorPin) {
      const gate = document.getElementById('pin-gate');
      gate.style.opacity = '0';
      setTimeout(() => gate.remove(), 300);
    } else {
      error.style.color = 'rgba(220,100,80,0.9)';
      input.style.borderColor = 'rgba(220,80,80,0.5)';
      input.value = '';
      setTimeout(() => {
        error.style.color = 'transparent';
        input.style.borderColor = 'rgba(255,255,255,0.15)';
      }, 1800);
      input.focus();
    }
  }

  return { init, submit };
})();


/* ============================================================
   Editor — 메인 컨트롤러
   ============================================================ */
const Editor = (() => {

  function init() {
    PinGate.init();
    renderSceneList();
    renderCurrentScene();
    Settings.init();
    _bindKeys();
    _bindGlobalDrag();
  }

  /* ── 탭 전환 ── */
  function switchTab(tab) {
    const isScene = tab === 'scene';
    document.getElementById('panel-scene').style.display    = isScene ? 'flex' : 'none';
    document.getElementById('panel-settings').style.display = isScene ? 'none' : 'flex';
    document.getElementById('tab-scene').className    = 'tab' + (isScene  ? ' active' : '');
    document.getElementById('tab-settings').className = 'tab' + (!isScene ? ' active' : '');
  }

  /* ── 장면 목록 렌더링 ── */
  function renderSceneList() {
    const container = document.getElementById('scene-list');
    container.innerHTML = '';

    tourData.groups.forEach(grp => {
      const el = document.createElement('div');
      el.className = 'grp';
      el.dataset.groupId = grp.id;
      const collapsed = grp._collapsed;
      const arrow = collapsed
        ? '<path d="M2.5 1L5.5 4L2.5 7" fill="none" stroke="white" stroke-width="1.2"/>'
        : '<path d="M1 2.5L4 5.5L7 2.5" fill="none" stroke="white" stroke-width="1.2"/>';
      el.innerHTML = `
        <div class="grp-head" onclick="Editor.toggleGroup('${grp.id}')">
          <div class="grp-dot" style="background:${grp.color};"></div>
          <input class="grp-name" value="${grp.name}"
                 onclick="event.stopPropagation()"
                 onchange="Editor.renameGroup('${grp.id}',this.value)"/>
          <svg width="8" height="8" viewBox="0 0 8 8" style="opacity:0.28;flex-shrink:0;">${arrow}</svg>
        </div>
        <div class="grp-body" id="grp-body-${grp.id}" style="${collapsed?'display:none':''}">
          ${grp.scenes.map(sc => _sceneCard(sc)).join('')}
          <div class="add-row">
            <div class="add-btn accent" onclick="PhotoModal.open('${grp.id}')">+ 사진 추가</div>
          </div>
        </div>`;
      container.appendChild(el);
    });

    // 하단 공통 버튼
    const foot = document.createElement('div');
    foot.className = 'add-row';
    foot.innerHTML = `
      <div class="add-btn accent" onclick="PhotoModal.open(null)">+ 사진 추가</div>
      <div class="add-btn" onclick="Editor.addGroup()">+ 그룹</div>`;
    container.appendChild(foot);

    _updateSceneLabel();
  }

  function _sceneCard(sc) {
    const cur   = sc.id === currentSceneId;
    const thumb = sc.thumb
      ? `background:url('${sc.thumb}') center/cover no-repeat;`
      : `background:linear-gradient(135deg,#1e3a50,#2a4030);`;
    return `
      <div class="sc${cur?' current':''}" onclick="Editor.selectScene('${sc.id}')">
        ${cur?'<div class="current-badge">현재</div>':''}
        <div class="sc-thumb" style="${thumb}">
          ${!sc.thumb?`<span style="font-size:8px;color:rgba(255,255,255,0.15);letter-spacing:2px;">
            ${sc.name.toUpperCase().substring(0,8)}</span>`:''}
        </div>
        <div class="sc-bottom">
          <div class="drag-handle">
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
            <div class="drag-row"><div class="drag-dot"></div><div class="drag-dot"></div></div>
          </div>
          <input class="sc-input" value="${sc.name}"
                 style="${cur?'color:rgba(255,210,80,0.95);':''}"
                 onclick="event.stopPropagation()"
                 onchange="Editor.renameScene('${sc.id}',this.value)"/>
        </div>
      </div>`;
  }

  // Marzipano 뷰어 인스턴스 (최초 1회 생성)
  let _viewer = null;

  function renderCurrentScene() {
    const scene = findScene(currentSceneId);
    if (!scene) return;
    _updateSceneLabel();
    renderMarkers(scene.markers || []);

    const container = document.getElementById('center-view');
    const bg        = document.getElementById('center-bg');

    // Marzipano 없거나 파노 소스 없으면 그라디언트 폴백
    if (typeof Marzipano === 'undefined' || !scene.panoSrc) {
      bg.style.cssText = scene.panoSrc
        ? `position:absolute;inset:0;background:url('${scene.panoSrc}') center/cover no-repeat;`
        : `position:absolute;inset:0;background:linear-gradient(160deg,#1a3040,#243d30 50%,#1e3548);`;
      return;
    }

    // 폴백 배경 숨기기
    bg.style.cssText = 'position:absolute;inset:0;';

    // 뷰어 최초 1회 초기화
    if (!_viewer) {
      _viewer = new Marzipano.Viewer(container, {
        controls: { mouseViewMode: 'drag' }
      });
    }

    // equirectangular 씬 빌드
    const source   = Marzipano.ImageUrlSource.fromString(scene.panoSrc);
    const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
    const limiter  = Marzipano.RectilinearView.limit.traditional(
      1024, 100 * Math.PI / 180
    );
    const view = new Marzipano.RectilinearView(
      { yaw: 0, pitch: 0, fov: (tourData.settings.nav.fov || 90) * Math.PI / 180 },
      limiter
    );
    const mScene = _viewer.createScene({ source, geometry, view });
    mScene.switchTo({ transitionDuration: 500 });
  }

  function _updateSceneLabel() {
    const sc = findScene(currentSceneId);
    const el = document.getElementById('current-scene-label');
    if (el) el.textContent = '현재 장면: ' + (sc?.name ?? '—');
  }

  /* ── 장면 선택 ── */
  function selectScene(id) {
    currentSceneId   = id;
    selectedMarkerId = null;
    renderSceneList();
    renderCurrentScene();
    _resetMarkerPanel();
  }

  /* ── 마커 렌더링 ── */
  function renderMarkers(markers) {
    const layer = document.getElementById('marker-layer');
    layer.innerHTML = '';
    markers.forEach(m => {
      const el = document.createElement('div');
      el.className = 'marker' + (m.id === selectedMarkerId ? ' active' : '');
      el.style.left = (m.yaw   / 360 * 100 + 50) + '%';
      el.style.top  = (m.pitch / 180 * 100 + 50) + '%';
      el.innerHTML  = `<div class="m-dot"><div class="m-dot-inner"></div></div>
                       <div class="m-label">${m.label||''}</div>`;
      el.addEventListener('click',     () => _selectMarker(m.id));
      el.addEventListener('mousedown', e  => _startDrag(e, m.id));
      layer.appendChild(el);
    });
  }

  function _selectMarker(id) {
    selectedMarkerId = id;
    const scene  = findScene(currentSceneId);
    const marker = scene?.markers?.find(m => m.id === id);
    if (!marker) return;
    renderMarkers(scene.markers);
    _renderMarkerPanel(marker);
  }

  function _renderMarkerPanel(marker) {
    document.getElementById('marker-status').textContent = '선택됨 · 드래그로 이동';
    const destHTML = marker.type === 'move' ? `
      <div>
        <div class="fl">이동 장면</div>
        <select class="s-select" style="flex:none;width:100%;"
                onchange="Editor.updateMarkerField('${marker.id}','destScene',this.value)">
          <option value="">— 선택 —</option>
          ${getAllScenes().filter(s=>s.id!==currentSceneId).map(s=>
            `<option value="${s.id}" ${marker.destScene===s.id?'selected':''}>${s.name}</option>`).join('')}
        </select>
      </div>` : `
      <div>
        <div class="fl">설명</div>
        <textarea class="s-input" rows="3" style="width:100%;flex:none;resize:vertical;"
                  oninput="Editor.updateMarkerField('${marker.id}','desc',this.value)">${marker.desc||''}</textarea>
      </div>`;

    document.getElementById('marker-panel').innerHTML = `
      <div>
        <div class="fl">마커 이름</div>
        <input class="s-input" style="width:100%;flex:none;" value="${marker.label||''}"
               oninput="Editor.updateMarkerField('${marker.id}','label',this.value)"/>
      </div>
      <div>
        <div class="fl">마커 타입</div>
        <select class="s-select" style="flex:none;width:100%;"
                onchange="Editor.updateMarkerField('${marker.id}','type',this.value)">
          <option value="move" ${marker.type==='move'?'selected':''}>이동 마커 (흰색)</option>
          <option value="info" ${marker.type==='info'?'selected':''}>정보 마커 (노란색)</option>
        </select>
      </div>
      ${destHTML}
      <div>
        <div class="fl">위치</div>
        <div style="display:flex;gap:5px;">
          <div style="flex:1;">
            <div style="font-size:9px;color:rgba(255,255,255,0.26);margin-bottom:2px;">YAW</div>
            <div class="fv" style="font-size:11px;text-align:center;">${(marker.yaw||0).toFixed(1)}°</div>
          </div>
          <div style="flex:1;">
            <div style="font-size:9px;color:rgba(255,255,255,0.26);margin-bottom:2px;">PITCH</div>
            <div class="fv" style="font-size:11px;text-align:center;">${(marker.pitch||0).toFixed(1)}°</div>
          </div>
        </div>
      </div>`;
  }

  function _resetMarkerPanel() {
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
  function _startDrag(e, markerId) {
    e.preventDefault(); e.stopPropagation();
    const rect = document.getElementById('marker-layer').getBoundingClientRect();
    const move = ev => {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top)  / rect.height;
      const scene = findScene(currentSceneId);
      const m     = scene?.markers?.find(m => m.id === markerId);
      if (!m) return;
      m.yaw   = Math.max(-180, Math.min(180, (x-0.5)*360));
      m.pitch = Math.max(-90,  Math.min(90,  (y-0.5)*180));
      renderMarkers(scene.markers);
      if (selectedMarkerId === markerId) _renderMarkerPanel(m);
      document.getElementById('center-info').textContent =
        `yaw: ${m.yaw.toFixed(1)}° · pitch: ${m.pitch.toFixed(1)}°`;
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup',   up);
      pushHistory();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup',   up);
  }

  /* ── 마커 CRUD ── */
  function addMarker(type) {
    const scene = findScene(currentSceneId);
    if (!scene) return;
    if (!scene.markers) scene.markers = [];
    const id = 'm-' + Date.now();
    scene.markers.push({ id, type, label: type==='move'?'이동':'정보', yaw:0, pitch:0 });
    pushHistory();
    renderMarkers(scene.markers);
    _selectMarker(id);
  }

  function updateMarkerField(markerId, field, value) {
    const scene = findScene(currentSceneId);
    const m     = scene?.markers?.find(m => m.id === markerId);
    if (!m) return;
    m[field] = value;
    renderMarkers(scene.markers);
    _renderMarkerPanel(m);
  }

  function deleteMarker() {
    if (!selectedMarkerId) return;
    const scene = findScene(currentSceneId);
    if (!scene?.markers) return;
    scene.markers = scene.markers.filter(m => m.id !== selectedMarkerId);
    selectedMarkerId = null;
    pushHistory();
    renderMarkers(scene.markers);
    _resetMarkerPanel();
  }

  function confirmMarker() {
    selectedMarkerId = null;
    renderMarkers(findScene(currentSceneId)?.markers || []);
    _resetMarkerPanel();
  }

  /* ── 그룹 ── */
  function toggleGroup(id) {
    const g = tourData.groups.find(g => g.id === id);
    if (g) { g._collapsed = !g._collapsed; renderSceneList(); }
  }

  function addGroup() {
    const colors = ['rgba(80,200,160,0.7)','rgba(200,120,80,0.7)','rgba(100,160,220,0.7)','rgba(180,80,220,0.6)'];
    tourData.groups.push({
      id: 'g-' + Date.now(), name: '새 그룹',
      color: colors[tourData.groups.length % colors.length], scenes: []
    });
    pushHistory(); renderSceneList();
  }

  function renameGroup(id, name) {
    const g = tourData.groups.find(g => g.id === id);
    if (g) { g.name = name; pushHistory(); }
  }

  function renameScene(id, name) {
    const s = findScene(id);
    if (s) { s.name = name; pushHistory(); _updateSceneLabel(); }
  }

  /* ── 기타 액션 ── */
  function toggleSetFov() { document.getElementById('btn-set-fov').classList.toggle('bb-on'); }
  function preview() {
    // viewer/index.html 완성 후 연결 예정
    // 현재 데이터를 sessionStorage에 저장해두면 viewer에서 읽을 수 있음
    sessionStorage.setItem('preview_tour_data', JSON.stringify(tourData));
    const w = window.open('../viewer/index.html', '_blank');
    if (!w) alert('viewer/index.html이 준비되지 않았습니다.\n데이터는 sessionStorage에 저장됐습니다.');
  }
  function exportJSON() {
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(new Blob([JSON.stringify(tourData, null, 2)], {type:'application/json'})),
      download: 'tour-data.json'
    });
    a.click(); URL.revokeObjectURL(a.href);
  }
  function close() { if (confirm('에디터를 닫을까요?')) window.close(); }

  /* ── Undo / Redo ── */
  function pushHistory() {
    _history.push(JSON.stringify(tourData));
    _redo.length = 0;
    if (_history.length > 50) _history.shift();
    document.getElementById('save-label').textContent = '변경됨';
    _syncButtons();
  }

  function undo() {
    if (!_history.length) return;
    _redo.push(JSON.stringify(tourData));
    tourData = JSON.parse(_history.pop());
    renderSceneList(); renderCurrentScene(); _syncButtons();
  }

  function redo() {
    if (!_redo.length) return;
    _history.push(JSON.stringify(tourData));
    tourData = JSON.parse(_redo.pop());
    renderSceneList(); renderCurrentScene(); _syncButtons();
  }

  function _syncButtons() {
    document.getElementById('btn-undo')?.classList.toggle('dim', !_history.length);
    document.getElementById('btn-redo')?.classList.toggle('dim', !_redo.length);
  }

  /* ── 단축키 ── */
  function _bindKeys() {
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key==='z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (ctrl && (e.key==='y' || (e.key==='z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key==='Escape') { selectedMarkerId=null; _resetMarkerPanel(); }
    });
  }

  /* ── 전역 드래그 ── */
  function _bindGlobalDrag() {
    let cnt = 0;
    document.addEventListener('dragenter', e => {
      if ([...e.dataTransfer.types].includes('Files')) {
        cnt++;
        document.getElementById('drag-overlay').classList.add('show');
      }
    });
    document.addEventListener('dragleave', () => {
      if (--cnt <= 0) { cnt=0; document.getElementById('drag-overlay').classList.remove('show'); }
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
      cnt = 0;
      document.getElementById('drag-overlay').classList.remove('show');
      const files = [...e.dataTransfer.files].filter(f => /image\/(jpeg|png)/.test(f.type));
      if (files.length) { PhotoModal.open(null); PhotoModal.processFiles(files); }
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
  function getAllScenes() { return tourData.groups.flatMap(g => g.scenes); }

  return {
    init, switchTab, renderSceneList, renderCurrentScene, selectScene,
    addMarker, updateMarkerField, deleteMarker, confirmMarker,
    toggleGroup, addGroup, renameGroup, renameScene,
    toggleSetFov, preview, exportJSON, close,
    undo, redo, pushHistory, findScene, getAllScenes,
    get tourData() { return tourData; },
  };
})();


/* ============================================================
   Settings — 투어 설정 탭
   ============================================================ */
const Settings = (() => {
  const MENUS = ['basic','logo','watermark','barrier','nadir','popup','display','nav','security','etc'];

  function init() { sw('basic'); }

  function sw(key) {
    MENUS.forEach(k => {
      const m = document.getElementById('sm-'+k);
      if (m) m.className = 's-menu'+(k===key?' on':'');
    });
    _render(key);
  }

  function _render(key) {
    const el = document.getElementById('settings-right');
    const s  = tourData.settings;

    const T = {

      basic: () => `
        <div class="s-title">기본 정보</div>
        <div class="s-row"><span class="s-label">투어 제목</span>
          <input class="s-input" style="flex:3;" value="${tourData.title}"
                 oninput="Settings.set('title',this.value)"/></div>
        <div class="s-row"><span class="s-label">시작 장면</span>
          <select class="s-select" onchange="Settings.set('startScene',this.value)">
            ${Editor.getAllScenes().map(sc=>
              `<option value="${sc.id}" ${tourData.startScene===sc.id?'selected':''}>${sc.name}</option>`
            ).join('')}
          </select></div>
        <div class="s-row"><span class="s-label">자동 회전</span>
          <div class="toggle${tourData.autoRotate?' on':''}"
               onclick="Settings.set('autoRotate',!tourData.autoRotate);Settings.sw('basic')">
            <div class="toggle-knob"></div></div></div>`,

      logo: () => `
        <div class="s-title">로고 배치</div>
        <div class="s-desc">뷰어 4모서리에 로고 이미지를 배치합니다.</div>
        ${[['tl','좌측 상단'],['tr','우측 상단'],['bl','좌측 하단'],['br','우측 하단']].map(([pos,lbl]) => `
          <div class="s-row">
            <span class="s-label">${lbl}</span>
            <input class="s-input" style="flex:3;" placeholder="이미지 경로 또는 URL"
                   value="${s.logo.slots?.[pos]?.src||''}"
                   oninput="Settings.setDeep('logo','slots','${pos}',{src:this.value})"/>
          </div>`).join('')}
        <div class="s-row"><span class="s-label">크기</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" value="${s.logo.size||48}"
                 oninput="Settings.setNested('logo','size',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">px</span></div>
        <div class="s-row"><span class="s-label">클릭 동작</span>
          <select class="s-select" onchange="Settings.setNested('logo','action',this.value)">
            <option value="none" ${s.logo.action==='none'?'selected':''}>없음</option>
            <option value="link" ${s.logo.action==='link'?'selected':''}>링크 열기</option>
            <option value="home" ${s.logo.action==='home'?'selected':''}>처음 장면으로</option>
          </select></div>`,

      watermark: () => `
        <div class="s-title">제작자 표시</div>
        <div class="s-row"><span class="s-label">표시 여부</span>
          <div class="toggle${s.watermark.show?' on':''}"
               onclick="Settings.setNested('watermark','show',!s.watermark.show);Settings.sw('watermark')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">제작자명</span>
          <input class="s-input" style="flex:3;" value="${s.watermark.name||''}"
                 oninput="Settings.setNested('watermark','name',this.value)"/></div>
        <div class="s-row"><span class="s-label">부가 텍스트</span>
          <input class="s-input" style="flex:3;" placeholder="기관명, 촬영일 등"
                 value="${s.watermark.sub||''}"
                 oninput="Settings.setNested('watermark','sub',this.value)"/></div>
        <div class="s-row"><span class="s-label">링크 URL</span>
          <input class="s-input" style="flex:3;" placeholder="https://"
                 value="${s.watermark.link||''}"
                 oninput="Settings.setNested('watermark','link',this.value)"/></div>
        <div class="s-row"><span class="s-label">새 탭 열기</span>
          <div class="toggle${s.watermark.newTab?' on':''}"
               onclick="Settings.setNested('watermark','newTab',!s.watermark.newTab);Settings.sw('watermark')">
            <div class="toggle-knob"></div></div></div>`,

      barrier: () => `
        <div class="s-title">하단 바 설정</div>
        <div class="s-desc">네비게이션 UI 뒤의 불투명 바. 카메라 삼각대·장비도 가립니다.</div>
        <div class="s-row"><span class="s-label">표시 여부</span>
          <div class="toggle${s.barrier.show?' on':''}"
               onclick="Settings.setNested('barrier','show',!s.barrier.show);Settings.sw('barrier')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">높이 모드</span>
          <select class="s-select" onchange="Settings.setNested('barrier','mode',this.value);Settings.sw('barrier')">
            <option value="auto"   ${s.barrier.mode==='auto'  ?'selected':''}>자동 (텍스트 높이)</option>
            <option value="custom" ${s.barrier.mode==='custom'?'selected':''}>직접 지정</option>
          </select></div>
        ${s.barrier.mode==='custom' ? `
        <div class="s-row"><span class="s-label">높이</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" value="${s.barrier.height}"
                 oninput="Settings.setNested('barrier','height',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">px</span></div>` : ''}
        <div class="s-row"><span class="s-label">불투명도</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" min="0" max="100"
                 value="${s.barrier.opacity}"
                 oninput="Settings.setNested('barrier','opacity',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">%</span></div>
        <div class="s-row"><span class="s-label">색상</span>
          <input type="color" value="${s.barrier.color||'#000000'}"
                 style="width:36px;height:28px;border:0.5px solid rgba(255,255,255,0.12);
                        border-radius:5px;cursor:pointer;background:none;"
                 oninput="Settings.setNested('barrier','color',this.value)"/></div>`,

      nadir: () => `
        <div class="s-title">나디르패치</div>
        <div class="s-desc">파노라마 바닥(천저점)에 원형 로고를 오버레이합니다.</div>
        <div class="s-row"><span class="s-label">사용 여부</span>
          <div class="toggle${s.nadir.show?' on':''}"
               onclick="Settings.setNested('nadir','show',!s.nadir.show);Settings.sw('nadir')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">이미지 경로</span>
          <input class="s-input" style="flex:3;" placeholder="assets/icons/nadir.png"
                 value="${s.nadir.src||''}"
                 oninput="Settings.setNested('nadir','src',this.value)"/></div>
        <div class="s-row"><span class="s-label">크기</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" min="5" max="80"
                 value="${s.nadir.size}"
                 oninput="Settings.setNested('nadir','size',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">% (FOV 기준)</span></div>
        <div class="s-row"><span class="s-label">불투명도</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" min="0" max="100"
                 value="${s.nadir.opacity}"
                 oninput="Settings.setNested('nadir','opacity',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">%</span></div>
        <div class="s-row"><span class="s-label">피치 조정</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" min="-90" max="-60"
                 value="${s.nadir.pitch}"
                 oninput="Settings.setNested('nadir','pitch',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">° (−90 = 정바닥)</span></div>`,

      popup: () => `
        <div class="s-title">시작 팝업</div>
        <div class="s-row"><span class="s-label">팝업 사용</span>
          <div class="toggle${s.popup.enabled?' on':''}"
               onclick="Settings.setNested('popup','enabled',!s.popup.enabled);Settings.sw('popup')">
            <div class="toggle-knob"></div></div></div>
        <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);
                    border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:9px;">
          <div style="font-size:10px;color:rgba(255,255,255,0.38);">타이밍</div>
          <div class="s-row"><span class="s-label">표시 시간</span>
            <input class="s-input" type="number" style="width:60px;flex:none;" value="${s.popup.duration}"
                   oninput="Settings.setNested('popup','duration',+this.value)"/>
            <span style="font-size:11px;color:var(--text-3);">초 (0=수동)</span></div>
          <div class="s-row"><span class="s-label">딜레이</span>
            <input class="s-input" type="number" style="width:60px;flex:none;" step="0.5"
                   value="${s.popup.delay}"
                   oninput="Settings.setNested('popup','delay',+this.value)"/>
            <span style="font-size:11px;color:var(--text-3);">초 후 등장</span></div>
          <div class="s-row"><span class="s-label">다시 보지 않기</span>
            <div class="toggle${s.popup.noAgain?' on':''}"
                 onclick="Settings.setNested('popup','noAgain',!s.popup.noAgain);Settings.sw('popup')">
              <div class="toggle-knob"></div></div></div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);
                    border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:9px;">
          <div style="font-size:10px;color:rgba(255,255,255,0.38);">이미지 &amp; 링크</div>
          <div class="s-row"><span class="s-label">PC 이미지</span>
            <input class="s-input" style="flex:3;" placeholder="assets/popup-pc.jpg"
                   value="${s.popup.pcSrc||''}"
                   oninput="Settings.setNested('popup','pcSrc',this.value)"/></div>
          <div class="s-row"><span class="s-label">모바일 이미지</span>
            <input class="s-input" style="flex:3;" placeholder="assets/popup-mobile.jpg"
                   value="${s.popup.mobileSrc||''}"
                   oninput="Settings.setNested('popup','mobileSrc',this.value)"/></div>
          <div class="s-row"><span class="s-label">클릭 URL</span>
            <input class="s-input" style="flex:3;" placeholder="https://"
                   value="${s.popup.linkUrl||''}"
                   oninput="Settings.setNested('popup','linkUrl',this.value)"/></div>
        </div>`,

      display: () => `
        <div class="s-title">화면 표시</div>
        <div class="s-row"><span class="s-label">씬 타이틀</span>
          <div class="toggle${s.display.sceneTitle?' on':''}"
               onclick="Settings.setNested('display','sceneTitle',!s.display.sceneTitle);Settings.sw('display')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">좌표 표시</span>
          <div class="toggle${s.display.coords?' on':''}"
               onclick="Settings.setNested('display','coords',!s.display.coords);Settings.sw('display')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">썸네일 네비</span>
          <div class="toggle${s.display.thumbnail?' on':''}"
               onclick="Settings.setNested('display','thumbnail',!s.display.thumbnail);Settings.sw('display')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">전체화면 버튼</span>
          <div class="toggle${s.display.fullscreen?' on':''}"
               onclick="Settings.setNested('display','fullscreen',!s.display.fullscreen);Settings.sw('display')">
            <div class="toggle-knob"></div></div></div>`,

      nav: () => `
        <div class="s-title">네비게이션</div>
        <div class="s-row"><span class="s-label">초기 FOV</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" min="30" max="120"
                 value="${s.nav.fov}"
                 oninput="Settings.setNested('nav','fov',+this.value)"/>
          <span style="font-size:11px;color:var(--text-3);">° (30~120)</span></div>
        <div class="s-row"><span class="s-label">마우스 감도</span>
          <input class="s-input" type="number" style="width:60px;flex:none;" step="0.1"
                 value="${s.nav.sensitivity}"
                 oninput="Settings.setNested('nav','sensitivity',+this.value)"/></div>
        <div class="s-row"><span class="s-label">키보드 조작</span>
          <div class="toggle${s.nav.keyboard?' on':''}"
               onclick="Settings.setNested('nav','keyboard',!s.nav.keyboard);Settings.sw('nav')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">모바일 자이로</span>
          <div class="toggle${s.nav.gyro?' on':''}"
               onclick="Settings.setNested('nav','gyro',!s.nav.gyro);Settings.sw('nav')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-row"><span class="s-label">기본 프로젝션</span>
          <select class="s-select" onchange="Settings.setNested('nav','projection',this.value)">
            <option value="normal"      ${s.nav.projection==='normal'      ?'selected':''}>Normal</option>
            <option value="mirrorball"  ${s.nav.projection==='mirrorball'  ?'selected':''}>Mirror Ball</option>
            <option value="littleplanet"${s.nav.projection==='littleplanet'?'selected':''}>Little Planet</option>
          </select></div>`,

      security: () => `
        <div class="s-title">보안 설정</div>
        <div class="s-row"><span class="s-label">에디터 PIN</span>
          <input class="s-input" type="password" style="width:110px;flex:none;"
                 value="${s.security.editorPin}"
                 oninput="Settings.setNested('security','editorPin',this.value)"/></div>
        <div class="s-row"><span class="s-label">모니터링 PIN</span>
          <input class="s-input" type="password" style="width:110px;flex:none;"
                 value="${s.security.monitorPin}"
                 oninput="Settings.setNested('security','monitorPin',this.value)"/></div>
        <div class="s-row"><span class="s-label">PIN 힌트 표시</span>
          <div class="toggle${s.security.showHint?' on':''}"
               onclick="Settings.setNested('security','showHint',!s.security.showHint);Settings.sw('security')">
            <div class="toggle-knob"></div></div></div>
        <div class="s-desc" style="margin-top:4px;">
          ⚠ GitHub Pages는 정적 호스팅이므로 JSON 파일이 공개됩니다.<br>
          PIN은 단순 접근 제어용이며 민감한 정보는 저장하지 마세요.
        </div>`,

      etc: () => `
        <div class="s-title">기타 설정</div>
        <div style="border:0.5px dashed rgba(255,255,255,0.1);border-radius:10px;padding:32px;text-align:center;">
          <span style="font-size:11px;color:rgba(255,255,255,0.2);">준비 중인 설정입니다</span>
        </div>`,
    };

    el.innerHTML = `<div class="s-sec show">${(T[key] ?? T.etc)()}</div>`;
  }

  function set(key, value) { tourData[key] = value; Editor.pushHistory(); }

  function setNested(section, key, value) {
    if (!tourData.settings[section]) tourData.settings[section] = {};
    tourData.settings[section][key] = value;
    Editor.pushHistory();
  }

  function setDeep(section, sub, key, value) {
    const s = tourData.settings;
    if (!s[section])      s[section]      = {};
    if (!s[section][sub]) s[section][sub] = {};
    s[section][sub][key] = value;
    Editor.pushHistory();
  }

  return { init, sw, set, setNested, setDeep };
})();


/* ============================================================
   PhotoModal — 사진 추가 모달
   ============================================================ */
const PhotoModal = (() => {

  let _pending = [];
  let _targetGroup = null;

  /* ── 열기 ── */
  function open(groupId) {
    _targetGroup = groupId;
    _pending     = [];

    const sel = document.getElementById('modal-group-select');
    sel.innerHTML =
      `<option value="">그룹 없음 (미분류)</option>` +
      tourData.groups.map(g =>
        `<option value="${g.id}" ${g.id===groupId?'selected':''}>${g.name}</option>`
      ).join('');
    if (groupId) sel.value = groupId;

    _resetUI();
    document.getElementById('modal-add-photo').style.display = 'flex';
  }

  /* ── 닫기 ── */
  function close() {
    _pending.forEach(f => URL.revokeObjectURL(f.objectUrl));
    _pending = [];
    document.getElementById('modal-add-photo').style.display = 'none';
  }

  function onOverlayClick(e) {
    if (e.target.id === 'modal-add-photo') close();
  }

  function openFilePicker() { document.getElementById('modal-file-input').click(); }

  function onFileSelect(e) {
    const files = [...e.target.files].filter(_isImg);
    if (files.length) processFiles(files);
    e.target.value = '';
  }

  function onDragOver(e) {
    e.preventDefault();
    document.getElementById('modal-dropzone').classList.add('hover');
  }
  function onDragLeave(e) {
    const dz = document.getElementById('modal-dropzone');
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('hover');
  }
  function onDrop(e) {
    e.preventDefault();
    document.getElementById('modal-dropzone').classList.remove('hover');
    const files = [...e.dataTransfer.files].filter(_isImg);
    if (files.length) processFiles(files);
  }

  /* ── 파일 처리 ── */
  function processFiles(files) {
    const existing = Editor.getAllScenes().map(s => s.name);
    files.forEach(f => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const dup  = existing.includes(name) || _pending.some(p => p.name === name);
      const id   = 'pf-' + Date.now() + Math.random().toString(36).slice(2, 7);
      _pending.push({ id, name, file: f, objectUrl: URL.createObjectURL(f), dup, progress: 0, done: false });
    });
    _showFileList();
    _renderGrid();
    _updateBtn();
    _pending.filter(p => !p.done).forEach(p => _simProgress(p.id));
  }

  function _simProgress(id) {
    const tick = setInterval(() => {
      const p = _pending.find(f => f.id === id);
      if (!p) { clearInterval(tick); return; }
      p.progress = Math.min(100, p.progress + Math.random() * 22 + 10);
      const bar  = document.getElementById('pb-' + id);
      if (bar) bar.style.width = p.progress + '%';
      if (p.progress >= 100) {
        clearInterval(tick); p.done = true;
        if (bar) bar.style.background = 'rgba(80,200,160,0.9)';
      }
    }, 80);
  }

  function _resetUI() {
    document.getElementById('modal-dropzone').style.display  = 'flex';
    document.getElementById('modal-file-list').style.display = 'none';
    document.getElementById('mfl-grid').innerHTML = '';
    _updateBtn();
  }

  function _showFileList() {
    document.getElementById('modal-dropzone').style.display  = 'none';
    document.getElementById('modal-file-list').style.display = 'flex';
  }

  function _renderGrid() {
    const grid = document.getElementById('mfl-grid');
    grid.innerHTML = '';
    _pending.forEach(pf => {
      const card = document.createElement('div');
      card.className = 'mfl-card' + (pf.dup ? ' dup' : '');
      card.id = 'card-' + pf.id;
      card.innerHTML = `
        <div class="mfl-thumb">
          <img src="${pf.objectUrl}" alt=""
               style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">
          <div class="mfl-overlay">
            <div class="mfl-remove" onclick="PhotoModal.removeFile('${pf.id}')">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <line x1="1" y1="1" x2="7" y2="7" stroke="white" stroke-width="1.5"/>
                <line x1="7" y1="1" x2="1" y2="7" stroke="white" stroke-width="1.5"/>
              </svg>
            </div>
          </div>
          <div class="mfl-progress">
            <div class="mfl-progress-bar" id="pb-${pf.id}" style="width:0%"></div>
          </div>
        </div>
        <div class="mfl-foot">
          <input class="mfl-name-input" value="${pf.name}"
                 onclick="event.stopPropagation()"
                 oninput="PhotoModal.renamePending('${pf.id}',this.value)"/>
          ${pf.dup ? '<div class="mfl-warn" title="동일 이름 장면이 이미 있습니다">⚠</div>' : ''}
        </div>`;
      grid.appendChild(card);
    });
    document.getElementById('mfl-count').textContent = _pending.length + '개 파일';
  }

  function renamePending(id, name) {
    const p = _pending.find(f => f.id === id);
    if (p) p.name = name;
  }

  function removeFile(id) {
    const idx = _pending.findIndex(f => f.id === id);
    if (idx === -1) return;
    URL.revokeObjectURL(_pending[idx].objectUrl);
    _pending.splice(idx, 1);
    if (_pending.length === 0) _resetUI();
    else _renderGrid();
    _updateBtn();
  }

  function clearAll() {
    _pending.forEach(f => URL.revokeObjectURL(f.objectUrl));
    _pending = [];
    _resetUI();
  }

  function _updateBtn() {
    document.getElementById('modal-btn-confirm')
      ?.classList.toggle('disabled', _pending.length === 0);
  }

  /* ── 확정 ── */
  function confirm() {
    if (_pending.length === 0) return;

    const groupId = document.getElementById('modal-group-select').value;
    let grp = groupId ? tourData.groups.find(g => g.id === groupId) : null;

    // 그룹 없음 선택 시 → 미분류 그룹 사용/생성
    if (!grp) {
      grp = tourData.groups.find(g => g.id === 'g-unassigned');
      if (!grp) {
        grp = { id:'g-unassigned', name:'미분류', color:'rgba(120,120,120,0.6)', scenes:[] };
        tourData.groups.push(grp);
      }
    }

    const ids = _pending.map((pf, i) => {
      const id = 'sc-' + Date.now() + '-' + i;
      grp.scenes.push({ id, name: pf.name, thumb: pf.objectUrl, panoSrc: pf.objectUrl, markers: [] });
      return id;
    });

    Editor.pushHistory();
    Editor.renderSceneList();
    if (ids.length) Editor.selectScene(ids[0]);

    _pending = [];  // objectUrl 씬에서 계속 참조하므로 revoke 안 함
    document.getElementById('modal-add-photo').style.display = 'none';
  }

  function _isImg(f) { return /image\/(jpeg|png)/.test(f.type); }

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
