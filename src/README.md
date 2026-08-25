# 소스 코드 안내

이 폴더의 TypeScript 파일들이 플러그인의 개발 원본입니다. `npm run build`를 실행하면 파일들이 `tsconfig.json`에 적힌 순서대로 합쳐지고 `markdown-it` 브라우저 빌드가 포함되어, 루트의 단일 배포 파일 `summon_author_v1.1.3.js`가 됩니다.

## 파일별 역할

- `00-header.ts`: 플러그인 메타데이터, 공통 타입, 기본 프롬프트와 저장 키
- `01-state.ts`: 기본 설정과 실행 중 공유 상태
- `02-utils.ts`: HTML, 마크다운 렌더러 설정, 토큰 추정 등의 공통 함수
- `03-storage.ts`: 설정·작업공간 저장, 정규화, 구버전 마이그레이션
- `04-cbs.ts`: CBS 문법 평가와 화면 표시
- `05-context-regex.ts`: 작가 컨텍스트 정규식 처리
- `06-context-sources.ts`: 캐릭터·페르소나·메모리·본편 대화 수집
- `07-lore.ts`: 로어북 분류와 ON/OFF/AUTO 활성화 판정
- `08-context-builder.ts`: Writer Context 조립과 토큰 합계
- `09-memo-injection.ts`: 본편 요청 메모 주입과 시각적 표시
- `10-memo-actions.ts`: 작가가 제안한 메모 작업의 적용과 실행 취소
- `11-writer-request.ts`: 작가 모델 요청, 스트리밍, 취소와 대화 기록
- `12-ui-render.ts`: 네 탭의 HTML 렌더링
- `13-ui-events.ts`: 클릭·입력·변경·드래그 이벤트 처리
- `14-ui-styles.ts`: 플러그인 iframe 내부 스타일
- `15-panel.ts`: 플로팅 패널 이동·크기 조절·최소화
- `16-main.ts`: 플러그인 초기화, 메뉴 버튼 등록과 종료 정리

## 편집 규칙

- 배포용 `summon_author_v1.1.3.js`는 직접 수정하지 않습니다.
- 기능에 맞는 `src` 파일을 수정한 뒤 `npm run check`, `npm run build`, `npm run test:built`를 실행합니다.
- 이 파일들은 하나의 전역 스크립트로 합쳐지므로 현재 구조에서는 `import`나 `export`를 추가하지 않습니다.
- 마크다운 라이브러리 조립과 제3자 라이선스 포함은 `scripts/build.cjs`에서 처리합니다.
- 새 파일을 추가하면 `tsconfig.json`의 `files` 목록에도 실행 순서에 맞게 추가합니다.
- 저장 키나 스키마 버전을 변경할 때는 기존 사용자의 저장 데이터 마이그레이션을 함께 검토합니다.
