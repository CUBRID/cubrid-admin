# CUBRID Web Manager

CUBRID 데이터베이스 운영 관리를 위한 차세대 웹/데스크톱 애플리케이션입니다.

## 프로젝트 구조

```
cubrid-webmanager/
├── apps/
│   ├── web-manager/     # React 19 + Vite + Ant Design (프론트엔드)
│   ├── api-server/      # NestJS 11 + TypeScript (백엔드 API)
│   └── desktop/         # Electron 35 (데스크톱 래퍼)
├── libs/
│   └── api-interfaces/  # 공유 TypeScript 타입 (Request/Response)
├── scripts/             # 빌드 보조 스크립트
├── tools/               # 개발 도구 (HTTPS 프록시 등)
├── cwm.conf.sample      # 서버 배포용 설정 파일 샘플
└── package.json
```

## 시작하기

### 의존성 설치

```bash
npm install
```

---

## 개발 모드

### 방법 1 — 프론트 + API 각각 실행

```bash
npm run dev:web-manager   # React (Vite HMR, http://localhost:4200)
npm run dev:api-server    # NestJS (watch mode, https://localhost:8080)
```

개발 시 `.env` 또는 `apps/api-server/.env` 파일에 환경변수를 설정합니다:

```env
SEED=your-seed-value
SALT=your-salt-value
PORT=8080
```

### 방법 2 — HTTPS 스택 한번에 실행 (브라우저 테스트)

```bash
npm run dev:stack
```

NestJS API(:8080)와 HTTPS 프록시(:443)를 함께 실행합니다.
같은 자체 서명 인증서를 공유하므로 브라우저에서 한 번만 신뢰하면 됩니다.

---

## 빌드

```bash
npm run build:web-manager   # React만 빌드
npm run build:api-server    # NestJS만 빌드
npm run build:server        # 서버 배포용 통합 빌드 (아래 참고)
npm run build               # 전체 빌드
```

---

## 배포

### 방법 A — Node.js 직접 실행

```bash
npm run build:server
# → dist/apps/api-server/main.js + dist/apps/api-server/public/ 생성
```

배포 서버에서:
```bash
# cwm.conf 설정 후 실행
node dist/apps/api-server/main.js
```

### 방법 B — 단일 실행파일 패키징 (권장)

Node.js 없이 실행 가능한 실행파일로 패키징합니다.

```bash
npm run package:server           # 전 플랫폼 동시
npm run package:server:linux     # Linux용
npm run package:server:win       # Windows용
npm run package:server:mac       # macOS용
```

출력물 (`dist/executables/`):
```
dist/executables/
  ├── cubrid-web-manager-linux          # Linux 실행파일 (Node.js + 프론트엔드 내장)
  ├── cubrid-web-manager-macos          # macOS 실행파일
  ├── cubrid-web-manager.exe            # Windows 실행파일
  └── conf/
      └── cwm.conf.sample  # 설정 파일 샘플 → cwm.conf로 복사 후 편집
```

업데이트 시 실행파일만 교체하면 된다. `conf/`는 건드리지 않는다.

#### cwm.conf 설정

`conf/cwm.conf.sample`을 `conf/cwm.conf`로 복사 후 편집합니다:

```json
{
  "PORT": "8080",
  "ENVIRONMENT": "production",
  "STORAGE_PATH": "./data"
}
```

| 키 | 설명 | 기본값 |
|----|------|--------|
| `PORT` | 서버 포트 | `8080` |
| `ENVIRONMENT` | `production` / `development` | `production` |
| `STORAGE_PATH` | 데이터 저장 경로 | `./data` |
| `ALLOWED_ORIGINS` | CORS 허용 도메인 (쉼표 구분, 없으면 전체 허용) | — |
| `LISTEN_HOST` | 바인드할 네트워크 인터페이스 (예: `127.0.0.1`로 로컬 전용 제한) | 전체 인터페이스 |
| `SSL_CERT_PATH` | 공인 인증서 경로 (없으면 자체 서명 인증서 자동 생성) | — |
| `SSL_KEY_PATH` | 공인 인증서 키 경로 (`SSL_CERT_PATH`와 함께 설정 필요) | — |
| `AUTH_REGISTRATION_ENABLED` | 신규 계정 가입 허용 여부 (`false`로 초기 설정 후 잠그기) | `true` |
| `CMS_REJECT_UNAUTHORIZED` | CMS 접속 시 TLS 인증서 검증 여부 | `false` |
| `CMS_CA_CERT_PATH` | CMS가 자체 서명 인증서를 쓸 때 신뢰할 CA 인증서 경로 | — |
| `CMS_JOB_RETENTION_HOURS` | 완료된 백그라운드 작업(job) 기록 보관 시간 | `24` |
| `CMS_JOB_STALE_RUNNING_HOURS` | 응답 없는 job을 정지로 간주하는 시간 | `CMS_JOB_LONG_TIMEOUT_HOURS + 1` |
| `CMS_JOB_LONG_TIMEOUT_HOURS` | unload/load 등 장시간 job의 최대 대기 시간 | `12` |
| `CMS_JOB_RECOVER_ON_STARTUP` | 서버 재시작 시 진행 중이던 job 추적 재개 여부 | `true` |
| `SERVER_IP` | 자체 서명 인증서에 포함할 서버 IP (외부 접속 시 브라우저 경고 방지) | 네트워크 인터페이스 자동 감지 |
| `CWM_SSL_DIR` | 자체 서명 인증서를 저장/조회할 디렉토리 | 실행파일 옆 `ssl/` |
| `LOG_TO_FILE` | 콘솔 외에 파일에도 로그를 남길지 여부 | `true` |
| `LOG_DIR` | 로그 파일 디렉토리 | 실행파일 옆 `logs/` |
| `LOG_LEVEL` | 기록할 최소 레벨 (`error`/`warn`/`log`/`debug`/`verbose`, NestJS와 동일한 용어) | production `log`, 그 외 `debug` |
| `LOG_MAX_SIZE` | 이 크기를 넘으면 새 파일로 회전 (예: `20m`, `500k`) | `20m` |
| `LOG_MAX_FILES` | 회전된 파일 보관 기간(`14d` 같은 기간) 또는 개수(`20` 같은 숫자) | `14d` |
| `LOG_APPEND_ON_RESTART` | 재시작 시 기존 로그 파일에 이어 쓸지(`true`) 새로 시작할지(`false`) | `true` |

> `SEED`/`SALT`는 `cwm.conf`에 넣어도 무시됩니다 (안전장치) — 최초 실행 시 자동 생성되어 `cwm-vault/secrets.json`에 저장되며, 이 방식이 기본값입니다.

전체 키와 예시 값은 [`cwm.conf.reference.md`](cwm.conf.reference.md) 참고 (패키징된 실행파일에도 `conf/` 폴더에 함께 포함됩니다).

#### cwm-vault (자동 관리 — 편집 금지)

암호화 키(SEED/SALT)는 `cwm-vault/secrets.json`에 자동 생성됩니다. Electron 데스크톱 앱과 동일한 구조입니다.

```
cwm-vault/
  secrets.json   ← 자동 생성, 절대 편집/삭제 금지
```

> **주의**: `cwm-vault/`를 삭제하면 저장된 모든 데이터를 복호화할 수 없습니다.

#### 포트 변경

`conf/cwm.conf`의 `PORT` 값을 수정하고 재시작합니다.

```json
{
  "PORT": "9090"
}
```

이후 `https://서버IP:9090`으로 접속합니다.

#### 첫 실행 동작

1. `SEED` / `SALT` 없으면 자동 생성 후 `cwm-vault/secrets.json`에 저장
2. `ssl/` 폴더에 자체 서명 인증서 자동 생성 (없을 때)
3. 브라우저에서 `https://서버IP:PORT` 접속 → 인증서 한 번 신뢰 → 이후 정상 사용

#### 업데이트

새 버전 배포 시 `cwm-*` 실행파일과 `public/` 폴더만 교체합니다.
`conf/cwm.conf`는 절대 덮어쓰지 않습니다 — `SEED`/`SALT`가 초기화되면 데이터를 잃습니다.

#### 실행

```bash
# Linux
./cubrid-web-manager-linux

# Windows
cubrid-web-manager.exe

# macOS
./cubrid-web-manager-macos
```

### 방법 C — Electron 데스크톱 앱

별도 브랜치(`project/electron-desktop`)에서 관리됩니다.

---

## 빌드된 서버 로컬 실행

```bash
npm run build:server
npm run start
# → https://localhost:8080 에서 실행
```

---

## 테스트 / 린트

```bash
npm run test                   # 전체 테스트
npm run test:api-server        # API 서버만
npm run lint                   # 전체 린트
npm run typecheck:api-server   # 타입 체크
npm run ci                     # 타입 체크 + 빌드 (CI용)
npm run e2e:web                # 공유 UI 시나리오 — Chromium
npm run e2e:shared:electron    # 동일한 공유 UI 시나리오 — Electron
npm run e2e:electron:platform  # Electron 전용 workspace/protocol/IPC 테스트
npm run e2e:electron:packaged  # 패키징된 실행파일과 내장 리소스 테스트
npm run e2e:electron           # 공유 UI + Electron 전용 전체 테스트
```

E2E 환경과 실제 CMS 테스트 규칙은 [`e2e/README.md`](e2e/README.md)를 참고하세요.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 19, Vite 7, Ant Design 5, Redux Toolkit, Tailwind CSS 4 |
| Backend | NestJS 11, TypeScript, Passport JWT |
| Desktop | Electron 35 |
| Tooling | Nx 22, Webpack, pkg, Jest, ESLint |

---

## 환경변수 전체 목록

개발 시 `.env` 파일, 배포 시 `cwm.conf` 또는 시스템 환경변수로 설정합니다.

| 변수 | 설명 | 필수 |
|------|------|------|
| `SEED` | 암호화 시드 | ✅ (cwm.conf에서 자동 생성) |
| `SALT` | 암호화 솔트 | ✅ (cwm.conf에서 자동 생성) |
| `PORT` | API 서버 포트 (기본: 8080) | — |
| `ENVIRONMENT` | `development` / `production` | — |
| `STORAGE_PATH` | 데이터 저장 경로 | — |
| `SSL_CERT_PATH` | SSL 인증서 경로 (없으면 자동 생성) | — |
| `SSL_KEY_PATH` | SSL 키 경로 | — |
| `ALLOWED_ORIGINS` | CORS 허용 도메인 (쉼표 구분) | — |
| `CWM_DESKTOP` | Electron 모드 (`1`) | — |
