# 탄핵 청원 사이트

윤석열 대통령 탄핵 청원을 위한 웹 애플리케이션입니다.

## 주요 기능

### 사용자 기능
- 청원서 작성 및 제출
- 개인정보 수집 (연령대, 성별, 지역)
- IP 기반 제한 (1시간당 10회)
- Fingerprint ID 기반 제한 (24시간당 3회)
- 부적절한 단어 자동 마스킹
- 위치 기반 지역 자동 감지

### 관리자 기능
- 청원서 승인/거절/대기 처리
- Gemini API를 통한 자동 필터링
- 통계 대시보드
- 개인정보 보호를 위한 데이터 마이그레이션

### 데이터 처리
- BigQuery를 통한 데이터 분석
- Firestore를 통한 실시간 데이터 저장
- 개인정보 별도 저장 및 관리

## 기술 스택

### 프론트엔드
- Next.js 14
- TypeScript
- Tailwind CSS
- Firebase Authentication

### 백엔드
- Firebase Functions
- Firestore
- BigQuery
- Google Cloud Platform

### AI/ML
- Google Gemini API
  - 청원서 자동 필터링
  - 부적절한 내용 감지
  - 분당 15회 API 호출 제한 준수

## 보안 기능
- 관리자 인증
- 세션 기반 인증
- IP 마스킹
- 개인정보 분리 저장
- API 호출 제한

## 개인정보 처리 및 보안

### 개인정보 처리 과정
1. 수집 단계
   - 웹사이트에서 수집하는 정보: 연령, 성별, 위치 정보(위도/경도), 지역
   - 이 정보들은 통계 목적을 위해 일시적으로 수집됩니다.

2. 처리 단계
   - 수집된 정보는 서버에서 즉시 처리되어 개인을 식별할 수 없는 형태로 변환됩니다.
   - UUID를 사용하여 무작위 식별자로 저장되어 원본 데이터와의 연결이 불가능합니다.
   - 처리된 데이터는 더 이상 개인정보가 아닌 통계 데이터로 관리됩니다.

3. 저장 단계
   - 처리된 통계 데이터는 청원 내용과 완전히 분리되어 별도의 컬렉션에 저장됩니다.
   - 저장된 데이터는 개인을 식별할 수 없는 형태로만 보관됩니다.

### 보안 조치
1. 데이터 분리
   - 통계 데이터는 `personal_info` 컬렉션에 별도 저장
   - 청원 데이터와 통계 데이터는 완전히 분리되어 관리

2. 접근 제어
   - 통계 데이터 컬렉션에 대한 직접 접근 차단
   - Cloud Functions를 통해서만 통계 데이터 접근 가능
   - 모든 접근은 로그로 기록되어 관리

3. 데이터 보호
   - IP 주소는 마스킹 처리되어 저장
   - 통계 데이터는 암호화되어 저장
   - BigQuery 동기화 시 개인 식별 가능한 정보 제외

4. 관리자 권한
   - 통계 데이터 접근은 관리자 권한이 있는 사용자만 가능
   - 모든 관리자 작업은 세션 기반 인증 필요

### 데이터 보관
- 통계 데이터는 익명화되어 보관되며, 개인을 식별할 수 없는 형태로만 저장됩니다.
- 원본 개인정보는 서버에서 즉시 처리되어 저장되지 않습니다.


## 설치 및 실행

1. 저장소 클론
```bash
git clone [repository-url]
```

2. 의존성 설치
```bash
npm install
```

3. Firebase 프로젝트 설정
- Firebase Console에서 새 프로젝트 생성
- Authentication 활성화 (이메일/비밀번호 로그인)
- Firestore 데이터베이스 생성
- Firebase Functions 설정
- BigQuery 데이터셋 생성

4. 환경 변수 설정
- Next.js 웹 애플리케이션용 환경 변수:
  - `.env.example` 파일을 `.env.local`로 복사
  - Firebase Console의 프로젝트 설정에서 웹 앱 설정 정보를 복사하여 입력
  - `NEXT_PUBLIC_` 접두사가 붙은 환경 변수들은 클라이언트에서 사용됨

- Firebase Functions용 환경 변수:
  - Firebase Console의 Secret Manager를 통해 관리
  - `functions/.env.example` 파일을 참고하여 필요한 환경 변수 설정
  - 주요 환경 변수:
    - GEMINI_API_KEY: Gemini API 키 (Firebase Functions에서만 사용)

5. 개발 서버 실행
```bash
npm run dev
```

## 배포
- Firebase Hosting를 통한 웹 애플리케이션 배포
- Firebase Functions를 통한 서버리스 백엔드 배포

### Static Web 배포 주의사항
- Next.js의 static export를 사용하므로 클라이언트 사이드 라우팅만 지원됩니다.
- `/admin` 경로로의 직접 접근은 `/admin/login`으로 리다이렉트됩니다.
- 관리자 페이지 접근은 반드시 `/admin/login`을 통해 로그인 후 가능합니다.
- 환경 변수는 Firebase Functions에서만 사용되며, Firebase Console의 Secret Manager를 통해 관리됩니다.
- `NEXT_PUBLIC_` 접두사가 붙은 환경 변수만 클라이언트에서 사용 가능합니다.

## 라이선스
MIT License

