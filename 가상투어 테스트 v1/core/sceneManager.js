// core/sceneManager.js — 씬 전환 (페이드 인/아웃)
import { getScene } from './renderer.js';

let _currentSceneId = null;
let _onChangeCallbacks = [];

export function getCurrentSceneId() { return _currentSceneId; }

export function onSceneChange(cb) { _onChangeCallbacks.push(cb); }

export function switchScene(sceneId, options = {}) {
  const scene = getScene(sceneId);
  if (!scene) { console.warn(`Scene not found: ${sceneId}`); return; }
  if (_currentSceneId === sceneId) return;

  const fadeMs = options.fadeMs ?? 600;

  // 블랙 스크린 페이드
  const overlay = document.getElementById('fade-overlay');
  if (overlay) {
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'all';
  }

  setTimeout(() => {
    scene.switchTo();
    _currentSceneId = sceneId;
    _onChangeCallbacks.forEach(cb => cb(sceneId));

    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => { overlay.style.pointerEvents = 'none'; }, fadeMs);
    }
  }, fadeMs / 2);
}

export function initSceneManager(startSceneId) {
  const scene = getScene(startSceneId);
  if (!scene) return;
  scene.switchTo();
  _currentSceneId = startSceneId;
  _onChangeCallbacks.forEach(cb => cb(startSceneId));
}
