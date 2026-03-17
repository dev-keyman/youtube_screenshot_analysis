// ===== DOM 요소 =====
const urlInput = document.getElementById('url-input');
const btnDownload = document.getElementById('btn-download');
const videoPlayer = document.getElementById('video-player');
const videoPlaceholder = document.getElementById('video-placeholder');
const btnAnalyze = document.getElementById('btn-analyze');
const logOutput = document.getElementById('log-output');
const promptTextarea = document.getElementById('prompt-textarea');
const maxTokensInput = document.getElementById('max-tokens');
const temperatureInput = document.getElementById('temperature');
const imageSizeSelect = document.getElementById('image-size');
const framePreview = document.getElementById('frame-preview');
const frameLabel = document.getElementById('frame-label');
const resultArea = document.getElementById('result-area');
const tokenInfo = document.getElementById('token-info');
const captureCanvas = document.getElementById('capture-canvas');

// ===== Web Worker =====
let worker = null;
let workerReady = false;
let analysisStartTime = null;

function initWorker() {
  worker = new Worker('worker.js', { type: 'module' });

  worker.onmessage = (e) => {
    const { type, message, text, tokens, tokensPerSec, error } = e.data;

    switch (type) {
      case 'log':
        appendLog(message);
        break;

      case 'ready':
        workerReady = true;
        appendLog('[모델 준비 완료] 화면 분석을 시작할 수 있습니다.');
        break;

      case 'result':
        const elapsed = ((Date.now() - analysisStartTime) / 1000).toFixed(1);
        tokenInfo.textContent = `${tokens}토큰 / ${elapsed}초 (${tokensPerSec} t/s)`;
        renderResult(text);
        btnAnalyze.disabled = false;
        btnAnalyze.textContent = '화면 분석';
        appendLog(`[완료] ${tokens}토큰, ${elapsed}초 소요`);
        break;

      case 'error':
        appendLog(`[오류] ${error}`);
        resultArea.innerHTML = `<span style="color:#f08080;">오류: ${escapeHtml(error)}</span>`;
        btnAnalyze.disabled = false;
        btnAnalyze.textContent = '화면 분석';
        break;
    }
  };

  worker.onerror = (e) => {
    appendLog(`[Worker 오류] ${e.message}`);
  };
}

// ===== 로그 =====
function appendLog(msg) {
  const now = new Date();
  const ts = `[${now.toTimeString().slice(0, 8)}]`;
  logOutput.textContent += `${ts} ${msg}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}

// ===== 마크다운 렌더링 (간단 구현) =====
function renderResult(text) {
  let html = escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  resultArea.innerHTML = `<p>${html}</p>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== 유튜브 다운로드 =====
btnDownload.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) {
    alert('유튜브 URL을 입력하세요.');
    return;
  }

  btnDownload.disabled = true;
  btnDownload.innerHTML = '<span class="spinner"></span>다운로드 중...';
  appendLog(`[다운로드] ${url}`);
  tokenInfo.textContent = '';

  try {
    const res = await fetch('/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || '다운로드 실패');
    }

    appendLog(`[다운로드 완료] ${data.filename}`);
    loadVideo(data.videoPath);

  } catch (err) {
    appendLog(`[오류] ${err.message}`);
    alert(`다운로드 오류: ${err.message}`);
  } finally {
    btnDownload.disabled = false;
    btnDownload.textContent = '다운로드';
  }
});

// URL 입력창에서 Enter 키
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnDownload.click();
});

function loadVideo(videoPath) {
  videoPlayer.src = videoPath;
  videoPlayer.style.display = 'block';
  videoPlaceholder.style.display = 'none';
  videoPlayer.play();
  btnAnalyze.disabled = false;
}

// ===== 화면 분석 =====
btnAnalyze.addEventListener('click', () => {
  if (!videoPlayer.src) {
    alert('먼저 영상을 다운로드하세요.');
    return;
  }

  // 영상 일시정지
  videoPlayer.pause();

  const size = parseInt(imageSizeSelect.value);
  const prompt = promptTextarea.value.trim() ||
    '이 이미지를 자세히 분석해서 한국어로 설명해 주세요.';

  // 캔버스에 현재 프레임 캡처
  captureCanvas.width = size;
  captureCanvas.height = size;
  const ctx = captureCanvas.getContext('2d');

  // 비율 유지하며 중앙 크롭
  const vw = videoPlayer.videoWidth;
  const vh = videoPlayer.videoHeight;
  if (!vw || !vh) {
    appendLog('[경고] 영상 프레임을 읽을 수 없습니다. 영상이 재생 중인지 확인하세요.');
    return;
  }

  const ratio = Math.min(vw / size, vh / size);
  const srcW = size * ratio;
  const srcH = size * ratio;
  const srcX = (vw - srcW) / 2;
  const srcY = (vh - srcH) / 2;

  ctx.drawImage(videoPlayer, srcX, srcY, srcW, srcH, 0, 0, size, size);

  const imageDataUrl = captureCanvas.toDataURL('image/jpeg', 0.9);

  // 미리보기 표시
  framePreview.src = imageDataUrl;
  framePreview.style.display = 'block';
  const timeStr = formatTime(videoPlayer.currentTime);
  frameLabel.textContent = `[캡처 시각: ${timeStr}]`;

  // 결과 초기화
  resultArea.innerHTML = '<span class="placeholder">분석 중...</span>';
  tokenInfo.textContent = '';

  btnAnalyze.disabled = true;
  btnAnalyze.textContent = '분석 중...';
  analysisStartTime = Date.now();

  // Worker에 분석 요청
  const maxTokens = parseInt(maxTokensInput.value) || 512;
  const temperature = parseFloat(temperatureInput.value) || 0;

  appendLog(`[분석 시작] 크기: ${size}px, 토큰: ${maxTokens}, temp: ${temperature}`);
  appendLog(`[프롬프트] ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`);

  worker.postMessage({
    type: 'analyze',
    imageDataUrl,
    prompt,
    maxTokens,
    temperature,
  });
});

// ===== 유틸 =====
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ===== 초기화 =====
initWorker();
appendLog('[시스템] Worker 초기화 중...');
appendLog('[시스템] 영상을 다운로드한 후 화면 분석을 실행하세요.');
