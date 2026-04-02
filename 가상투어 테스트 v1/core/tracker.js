// core/tracker.js — Firebase 방문 데이터 수집 (viewer에서 사용)
// viewer.js에서 import해서 사용

let _db = null;
let _tourId = null;
let _sessionId = null;
let _startTime = null;
let _currentSceneId = null;
let _sceneTimes = {};
let _markerClickMap = {};
let _markerClicks = 0;
let _device = 'pc';
let _source = '직접 접속';

export async function initTracker(tourId, firebaseConfig) {
  _tourId = tourId;
  _sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  _startTime = Date.now();
  _device = detectDevice();
  _source = detectSource();

  try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    if (typeof firebase !== 'undefined') {
      _db = firebase.firestore();
    }
  } catch (e) {
    console.warn('Tracker: Firebase 초기화 실패 (수집 비활성)');
  }

  // 세션 종료 시 저장
  window.addEventListener('beforeunload', flushSession);
  // 30초마다 중간 저장
  setInterval(flushSession, 30000);
}

export function trackSceneChange(sceneId) {
  if (_currentSceneId) {
    _sceneTimes[_currentSceneId] = (_sceneTimes[_currentSceneId] || 0)
      + (Date.now() - (_sceneStart || _startTime));
  }
  _currentSceneId = sceneId;
  _sceneStart = Date.now();
}
let _sceneStart = null;

export function trackMarkerClick(hsId) {
  _markerClickMap[hsId] = (_markerClickMap[hsId] || 0) + 1;
  _markerClicks++;
}

export async function flushSession() {
  if (!_db || !_tourId) return;
  // 마지막 씬 시간 반영
  if (_currentSceneId) {
    _sceneTimes[_currentSceneId] = (_sceneTimes[_currentSceneId] || 0)
      + (Date.now() - (_sceneStart || _startTime));
  }

  const durationSec = Math.round((Date.now() - _startTime) / 1000);

  // 지역 정보 (IP 기반 무료 API)
  let region = '';
  try {
    const geo = await fetch('https://ipapi.co/json/');
    const geoData = await geo.json();
    region = geoData.region || geoData.city || '';
  } catch (e) {}

  const data = {
    sessionId: _sessionId,
    tourId: _tourId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    durationSec,
    device: _device,
    source: _source,
    region,
    startSceneId: _currentSceneId,
    scenesViewed: Object.keys(_sceneTimes),
    sceneTimes: _sceneTimes,
    markerClicks: _markerClicks,
    markerClickMap: _markerClickMap,
  };

  try {
    await _db.collection('tours').doc(_tourId).collection('visits')
      .doc(_sessionId).set(data, { merge: true });
  } catch (e) {
    console.warn('Tracker: 저장 실패', e);
  }
}

function detectDevice() {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'pc';
}

function detectSource() {
  const ref = document.referrer;
  if (!ref) return '직접 접속';
  if (ref.includes('google') || ref.includes('naver') || ref.includes('daum')) return '검색';
  return '공유 링크';
}
