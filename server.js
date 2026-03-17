const express = require('express');
const cors = require('cors');
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

// downloads 폴더 생성
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// yt-dlp 명령어 자동 감지
function detectYtdlp() {
  // 직접 실행 시도
  const direct = spawnSync('yt-dlp', ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (direct.status === 0) {
    console.log(`[yt-dlp] 직접 실행 사용 (버전: ${direct.stdout.trim()})`);
    return { cmd: 'yt-dlp', args: [] };
  }
  // python -m yt_dlp 시도
  const pyModule = spawnSync('python', ['-m', 'yt_dlp', '--version'], { encoding: 'utf8', timeout: 5000 });
  if (pyModule.status === 0) {
    console.log(`[yt-dlp] python -m yt_dlp 사용 (버전: ${pyModule.stdout.trim()})`);
    return { cmd: 'python', args: ['-m', 'yt_dlp'] };
  }
  // python3 시도
  const py3Module = spawnSync('python3', ['-m', 'yt_dlp', '--version'], { encoding: 'utf8', timeout: 5000 });
  if (py3Module.status === 0) {
    console.log(`[yt-dlp] python3 -m yt_dlp 사용 (버전: ${py3Module.stdout.trim()})`);
    return { cmd: 'python3', args: ['-m', 'yt_dlp'] };
  }
  console.warn('[경고] yt-dlp를 찾을 수 없습니다! pip install yt-dlp 또는 https://github.com/yt-dlp/yt-dlp 에서 설치하세요.');
  return null;
}

const YTDLP = detectYtdlp();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 유튜브 다운로드 엔드포인트
app.post('/download', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL이 필요합니다.' });
  }
  if (!YTDLP) {
    return res.status(500).json({
      error: 'yt-dlp가 설치되어 있지 않습니다.\n\n설치 방법:\n  pip install yt-dlp\n  또는\n  winget install yt-dlp'
    });
  }

  const outputTemplate = path.join(DOWNLOADS_DIR, '%(id)s.%(ext)s');
  const ytdlpArgs = [
    ...YTDLP.args,
    '-o', outputTemplate,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--newline',
    url
  ];

  console.log(`[다운로드 시작] ${url}`);
  res.setHeader('Content-Type', 'application/json');

  const ytdlp = spawn(YTDLP.cmd, ytdlpArgs);

  let filename = null;
  let stderr = '';

  ytdlp.stdout.on('data', (data) => {
    const line = data.toString();
    console.log('[yt-dlp]', line.trim());

    // 파일명 추출
    const destMatch = line.match(/Destination:\s+(.+\.mp4)/i) ||
                      line.match(/\[download\]\s+(.+\.mp4) has already been downloaded/i) ||
                      line.match(/Merging formats into "(.+\.mp4)"/i);
    if (destMatch) {
      filename = path.basename(destMatch[1].trim());
    }
  });

  ytdlp.stderr.on('data', (data) => {
    stderr += data.toString();
    console.error('[yt-dlp err]', data.toString().trim());
  });

  ytdlp.on('close', (code) => {
    if (code !== 0) {
      console.error('[yt-dlp 실패] 종료 코드:', code);
      return res.status(500).json({ error: `다운로드 실패 (코드: ${code})\n${stderr.slice(0, 300)}` });
    }

    // 파일명을 못 찾은 경우 downloads 폴더에서 최신 mp4 찾기
    if (!filename) {
      const files = fs.readdirSync(DOWNLOADS_DIR)
        .filter(f => f.endsWith('.mp4'))
        .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOADS_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        filename = files[0].name;
      }
    }

    if (!filename) {
      return res.status(500).json({ error: '다운로드된 파일을 찾을 수 없습니다.' });
    }

    console.log(`[다운로드 완료] ${filename}`);
    res.json({ videoPath: `/video/${filename}`, filename });
  });

  ytdlp.on('error', (err) => {
    console.error('[spawn 오류]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `실행 오류: ${err.message}` });
    }
  });
});

// 비디오 스트리밍 (Range 요청 지원)
app.get('/video/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(DOWNLOADS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.listen(PORT, () => {
  console.log(`\n서버 실행 중: http://localhost:${PORT}\n`);
});
