# 가상투어 프로젝트

Marzipano 기반 가상투어 웹 애플리케이션.
GitHub Pages 호스팅용으로 설계된 정적 파일 구조.

---

## 파일 구조

```
/project
├── viewer/
│   ├── index.html      ← 사용자 진입점
│   ├── viewer.js       ← 뷰어 로직
│   └── viewer.css      ← 뷰어 스타일
│
├── editor/
│   ├── index.html      ← 에디터 (PIN 보호)
│   ├── editor.js       ← 편집 로직
│   └── editor.css      ← 에디터 스타일
│
├── monitor/
│   ├── index.html      ← 모니터링 (PIN 보호)
│   ├── monitor.js      ← 통계 로직
│   └── monitor.css     ← 대시보드 스타일
│
├── core/
│   ├── loader.js       ← JSON 로드 + 캐시
│   ├── renderer.js     ← Marzipano 초기화
│   ├── hotspot.js      ← 핫스팟 DOM 생성 (viewer용)
│   ├── sceneManager.js ← 씬 전환 (페이드)
│   └── tracker.js      ← Firebase 수집
│
├── data/
│   └── tour.json       ← 모든 투어 데이터
│
├── assets/
│   ├── panos/          ← 파노라마 이미지 (equirectangular)
│   ├── thumbs/         ← 썸네일 이미지
│   └── icons/          ← 로고 등 아이콘
│
└── config.js           ← Firebase 키, 경로 상수
```

---

## 시작하기

### 1. 파노라마 이미지 추가
- 파노라마 원본: `assets/panos/파일명.jpg`
- 썸네일 (권장 320×200): `assets/thumbs/파일명.jpg`

### 2. tour.json 수정
`data/tour.json`에서 씬 경로, 핫스팟 위치, 투어 설정을 편집하거나
에디터를 사용해 JSON을 내보내기 하세요.

### 3. Firebase 설정 (모니터링 사용 시)
`config.js`의 `FIREBASE` 객체에 Firebase 프로젝트 정보를 입력하고,
`monitor/index.html`의 Firebase SDK 스크립트 주석을 해제하세요.

---

## 접근 방법

| 페이지 | URL | 접근 |
|--------|-----|------|
| 뷰어 | `/viewer/` | 공개 |
| 에디터 | `/editor/` | Ctrl+Shift+E → PIN |
| 모니터링 | `/monitor/` | Ctrl+Shift+S → PIN |

> 기본 PIN: 에디터 `1234` / 모니터링 `5678`  
> 에디터 → 투어 설정 → 보안 설정에서 변경하세요.

---

## 핵심 설계 원칙

- **Viewer**: JSON 읽기 전용. 렌더링만 담당
- **Editor**: JSON 생성/수정. 내보내기 후 `data/tour.json`에 교체
- **core/**: Viewer + Editor 공통 로직만 포함
- **모든 데이터**: `tour.json` 단일 파일 관리 (하드코딩 금지)

---

## tour.json 주요 구조

```json
{
  "tour":       { /* 제목, 시작씬, 자동회전 */ },
  "security":   { /* PIN 설정 */ },
  "display":    { /* 화면 표시 옵션 */ },
  "navigation": { /* FOV, 감도 */ },
  "branding":   { /* 로고, 제작자, 가림막, 나디르패치 */ },
  "startPopup": { /* 시작 팝업 */ },
  "groups":     [ /* 씬 그룹 탭 */ ],
  "scenes":     [ /* 씬 목록 + 핫스팟 */ ]
}
```

### 핫스팟 타입
- `"type": "link"` — 씬 이동 마커 (흰색 원형)
- `"type": "info"` — 정보 팝업 마커 (노란색 원형)

---

## GitHub Pages 배포

```bash
git init
git add .
git commit -m "initial"
git remote add origin https://github.com/YOUR/REPO.git
git push -u origin main
# Settings → Pages → Branch: main → Save
```

뷰어 URL: `https://YOUR.github.io/REPO/viewer/`
