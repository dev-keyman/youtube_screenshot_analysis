// Moondream2 Web Worker
// @huggingface/transformers v3 (ESM CDN)
import {
  AutoProcessor,
  AutoTokenizer,
  Moondream1ForConditionalGeneration,
  RawImage,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js';

const MODEL_ID = 'Xenova/moondream2';

let processor = null;
let tokenizer = null;
let model = null;
let isLoading = false;

function log(message) {
  self.postMessage({ type: 'log', message });
}

// 모델 로드 (최초 1회)
async function loadModel() {
  if (model) return;
  if (isLoading) return;
  isLoading = true;

  try {
    log('[모델 로드] Moondream2 로드 시작 (첫 실행 시 ~2GB 다운로드)...');
    log(`[모델] ${MODEL_ID}`);

    // WebGPU 지원 확인
    let device = 'wasm';
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) {
        device = 'webgpu';
        log('[장치] WebGPU 사용 (GPU 가속)');
      } else {
        log('[장치] WebGPU 미지원 → WASM CPU 사용');
      }
    } catch {
      log('[장치] WebGPU 확인 실패 → WASM CPU 사용');
    }

    log('[1/3] Processor 로드 중...');
    processor = await AutoProcessor.from_pretrained(MODEL_ID);

    log('[2/3] Tokenizer 로드 중...');
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

    log('[3/3] 모델 가중치 로드 중...');
    model = await Moondream1ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: {
        embed_tokens: 'fp16',
        vision_encoder: 'fp16',
        decoder_model_merged: 'q4',
      },
      device,
    });

    log('[모델 로드 완료]');
    self.postMessage({ type: 'ready' });
  } catch (err) {
    log(`[모델 로드 오류] ${err.message}`);
    self.postMessage({ type: 'error', error: `모델 로드 실패: ${err.message}` });
    isLoading = false;
    model = null;
  }
  isLoading = false;
}

// 분석 실행
async function analyze({ imageDataUrl, prompt, maxTokens, temperature }) {
  try {
    if (!model) {
      await loadModel();
      if (!model) {
        self.postMessage({ type: 'error', error: '모델이 로드되지 않았습니다.' });
        return;
      }
    }

    log('[분석] 이미지 처리 중...');
    const startTime = Date.now();

    // data URL → RawImage
    const image = await RawImage.fromURL(imageDataUrl);
    log(`[분석] 이미지 크기: ${image.width}x${image.height}`);

    const vision_inputs = await processor(image);
    log(`[분석] pixel_values 형태: ${vision_inputs.pixel_values?.dims}`);

    // Moondream2: vision encoder가 생성하는 패치 수만큼 <image> 토큰 필요
    // SigLIP encoder: image_size=378, patch_size=14 → (378/14)^2 = 729
    const numImageTokens = (() => {
      try {
        const ip = processor.image_processor;
        const imgSize = ip?.image_size ?? ip?.size?.height ?? 378;
        const patchSize = ip?.patch_size ?? 14;
        return (Math.floor(imgSize / patchSize)) ** 2;
      } catch { return 729; }
    })();
    log(`[분석] 이미지 패치 수: ${numImageTokens}개`);

    const text = `${'<image>'.repeat(numImageTokens)}\n\nQuestion: ${prompt}\n\nAnswer:`;
    const text_inputs = tokenizer(text);
    log(`[분석] 입력 토큰 수: ${text_inputs.input_ids?.dims}`);

    log(`[분석] 생성 시작 (max_tokens=${maxTokens}, temp=${temperature})...`);

    const doSample = temperature > 0;
    const output = await model.generate({
      ...text_inputs,
      ...vision_inputs,
      do_sample: doSample,
      max_new_tokens: maxTokens,
      temperature: doSample ? temperature : undefined,
    });

    const elapsed = (Date.now() - startTime) / 1000;

    // 전체 시퀀스 디코딩 (special 토큰 제외)
    const decoded = tokenizer.batch_decode(output, { skip_special_tokens: true });
    log(`[생성 완료] 소요시간: ${elapsed.toFixed(1)}s`);

    const fullText = Array.isArray(decoded) ? decoded[0] : String(decoded);

    // "Answer:" 이후 텍스트 추출 (없으면 전체)
    const answerMatch = fullText.match(/Answer:\s*([\s\S]+)/);
    const answerText = answerMatch ? answerMatch[1].trim() : fullText.trim();

    // 토큰 수 계산
    const inputLen = text_inputs.input_ids?.dims?.[1] ?? 0;
    const outputLen = output?.dims?.[1] ?? output?.[0]?.length ?? 0;
    const newTokens = Math.max(outputLen - inputLen, 0);
    const tokensPerSec = newTokens > 0 ? (newTokens / elapsed).toFixed(1) : '?';

    log(`[완료] 생성 토큰: ${newTokens}, 속도: ${tokensPerSec} t/s`);

    self.postMessage({
      type: 'result',
      text: answerText,
      tokens: newTokens,
      tokensPerSec,
    });

  } catch (err) {
    log(`[분석 오류] ${err.message}`);
    log(`[스택] ${err.stack?.split('\n')[1] ?? ''}`);
    self.postMessage({ type: 'error', error: err.message });
  }
}

// 메시지 수신
self.onmessage = async (e) => {
  const { type } = e.data;
  if (type === 'analyze') {
    await analyze(e.data);
  } else if (type === 'load') {
    await loadModel();
  }
};

// Worker 시작 시 사전 로드
loadModel();
