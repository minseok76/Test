// core/loader.js — JSON 로드 + 캐시
let _cache = null;

export async function loadTourData(path) {
  if (_cache) return _cache;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`tour.json 로드 실패: ${res.status}`);
  _cache = await res.json();
  return _cache;
}

export function invalidateCache() { _cache = null; }

export function getScene(data, sceneId) {
  return data.scenes.find(s => s.id === sceneId) || null;
}

export function getGroup(data, groupId) {
  return data.groups.find(g => g.id === groupId) || null;
}

export function getScenesByGroup(data, groupId) {
  return data.scenes.filter(s => s.groupId === groupId);
}
