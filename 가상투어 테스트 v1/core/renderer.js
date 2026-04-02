// core/renderer.js — Marzipano 초기화 + 씬 렌더링
import CONFIG from '../config.js';

let _viewer = null;
let _marzipanoScenes = {};

export function initViewer(container, options = {}) {
  if (!window.Marzipano) throw new Error('Marzipano not loaded');
  const viewerOpts = {
    stage: { progressive: true },
    controls: { mouseViewMode: 'drag' }
  };
  _viewer = new window.Marzipano.Viewer(container, viewerOpts);
  return _viewer;
}

export function buildScenes(data) {
  if (!_viewer) throw new Error('Viewer not initialized');
  _marzipanoScenes = {};

  data.scenes.forEach(sceneData => {
    const source = Marzipano.ImageUrlSource.fromString(sceneData.panoSrc);
    const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
    const limiter = Marzipano.RectilinearView.limit.traditional(
      data.navigation.fov.max * Math.PI / 180,
      data.navigation.fov.min * Math.PI / 180
    );
    const view = new Marzipano.RectilinearView(
      {
        yaw:   sceneData.initialView.yaw   * Math.PI / 180,
        pitch: sceneData.initialView.pitch * Math.PI / 180,
        fov:   sceneData.initialView.fov   * Math.PI / 180
      },
      limiter
    );
    const scene = _viewer.createScene({ source, geometry, view });
    _marzipanoScenes[sceneData.id] = scene;
  });

  return _marzipanoScenes;
}

export function getScene(sceneId) {
  return _marzipanoScenes[sceneId] || null;
}

export function getViewer() { return _viewer; }

export function setAutoRotate(enabled, speed = 0.3) {
  if (!_viewer) return;
  if (enabled) {
    _viewer.startMovement(Marzipano.autorotate({ yawSpeed: speed, targetPitch: 0, interruptible: true }));
  } else {
    _viewer.stopMovement();
  }
}
