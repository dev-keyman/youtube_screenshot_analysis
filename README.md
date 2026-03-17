# Moondream2 + Transformers.js 화면분석

유튜브 영상을 다운로드하고, 원하는 장면에서 일시정지한 뒤 **Moondream2 AI 모델**로 화면을 분석하는 웹 애플리케이션입니다.
AI 추론은 브라우저 내에서 완전히 실행되며 외부 API를 사용하지 않습니다.

---

## 주요 기능

- 유튜브 URL 입력 → 영상 자동 다운로드 및 재생
- 원하는 장면에서 일시정지 → **화면 분석** 버튼으로 AI 분석
- [Moondream2](https://huggingface.co/Xenova/moondream2) + [Transformers.js](https://huggingface.co/docs/transformers.js) 로 브라우저에서 직접 추론
- WebGPU 지원 브라우저에서 GPU 가속 자동 적용

---

## 사전 요구사항

아래 세 가지를 먼저 설치해야 합니다.

### 1. Node.js (v18 이상 권장)

https://nodejs.org 에서 LTS 버전 다운로드 후 설치

설치 확인:
```bash
node --version
```

### 2. Python (3.8 이상)

https://www.python.org 에서 다운로드 후 설치
> ⚠️ 설치 시 **"Add Python to PATH"** 옵션을 반드시 체크하세요.

설치 확인:
```bash
python --version
```

### 3. yt-dlp

유튜브 영상 다운로드에 사용됩니다.

```bash
pip install yt-dlp
```

설치 확인:
```bash
python -m yt_dlp --version
```

---

## 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/dev-keyman/youtube_screenshot_analysis.git
cd youtube_screenshot_analysis
```

### 2. Node.js 패키지 설치

```bash
npm install
```

### 3. 서버 실행

```bash
npm start
```

아래와 같은 메시지가 나오면 정상입니다:

```
서버 실행 중: http://localhost:3000
```

### 4. 브라우저에서 접속

```
http://localhost:3000
```

---

## 사용 방법

1. **유튜브 URL 입력** — 상단 입력창에 유튜브 링크를 붙여넣고 **다운로드** 버튼 클릭
2. **영상 재생** — 다운로드 완료 후 자동으로 영상이 재생됩니다
3. **장면 선택** — 분석하고 싶은 장면에서 영상을 일시정지
4. **화면 분석** — 좌측 하단 **화면 분석** 버튼 클릭
   - 최초 실행 시 Moondream2 모델을 HuggingFace에서 다운로드합니다 (약 2GB, 이후 브라우저 캐시 사용)
   - 분석이 완료되면 우측 패널에 결과가 표시됩니다

### 분석 설정 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| Max Tokens | 생성할 최대 토큰 수 | 512 |
| Temperature | 0: 결정적 / 높을수록 창의적 | 0 |
| 이미지 크기 | 캡처 프레임 해상도 (클수록 느림) | 448px |

### 프롬프트 팁

Moondream2는 **영어 전용 모델**입니다. 영어 프롬프트를 사용해야 정확한 결과가 나옵니다.

```
Describe this image in detail.
What text is visible in this image?
What is happening in this scene?
Describe the people in this image.
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | Node.js + Express |
| 유튜브 다운로드 | yt-dlp |
| AI 모델 | Moondream2 (Xenova/moondream2) |
| AI 추론 | Transformers.js v3 (Web Worker) |
| 연산 장치 | WebGPU (지원 시) / WASM CPU (폴백) |

---

## 권장 브라우저

WebGPU를 지원하는 브라우저에서 GPU 가속 추론이 가능합니다.

- **Chrome 113+** (권장)
- **Edge 113+**
- Firefox, Safari — WASM CPU 모드로 동작 (느릴 수 있음)

---

## 문제 해결

**`yt-dlp`를 찾을 수 없다는 오류가 날 때**
```bash
pip install yt-dlp
# 또는
pip3 install yt-dlp
```

**모델 로드가 너무 오래 걸릴 때**
최초 실행 시 약 2GB의 모델 파일을 다운로드합니다. 이후 실행부터는 브라우저 캐시를 사용하므로 빠릅니다.

**WebGPU를 사용하려면**
Chrome 또는 Edge 최신 버전을 사용하고, `chrome://flags` 에서 WebGPU가 활성화되어 있는지 확인하세요.
