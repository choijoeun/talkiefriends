/* ==========================================================================
   TalkieFriends Cloud Sync & Gemini Live Ephemeral Token Server
   - Zero external npm dependencies (runs on Node.js 20/22+)
   - Serves the installable TalkieFriends PWA frontend
   - Cross-device Family Sync API (/api/profile/:code) with optional PIN
   - Secure Gemini Live Ephemeral Token Minting (/api/gemini-live-token)
   ========================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8765', 10);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data', 'profiles');
const MAX_BODY_BYTES = 18 * 1024 * 1024; // 18 MB for custom character/background photos

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Family-Pin'
  });
  res.end(payload);
}

function normalizeCode(rawCode) {
  const cleaned = decodeURIComponent(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9가-힣_-]/g, '');
  if (cleaned.length < 3 || cleaned.length > 32) return null;
  return cleaned;
}

function profileFilePath(code) {
  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 24);
  return path.join(DATA_DIR, `${hash}.json`);
}

function hashPin(pin) {
  if (!pin) return '';
  return crypto.createHash('sha256').update(`tf_pin_${String(pin).trim()}`).digest('hex');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlObj) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Family-Pin'
    });
    res.end();
    return;
  }

  // 1. Health & capabilities check
  if (urlObj.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      syncReady: true,
      hasServerGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      time: new Date().toISOString()
    });
  }

  // 2. Cross-Device Family Profile Sync (GET / PUT /api/profile/:code)
  const profMatch = urlObj.pathname.match(/^\/api\/profile\/([^/]+)$/);
  if (profMatch) {
    const code = normalizeCode(profMatch[1]);
    if (!code) return sendJson(res, 400, { error: '가족 코드는 3~32자의 영문/숫자/한글이어야 합니다.' });
    const fpath = profileFilePath(code);
    const pinHeader = (req.headers['x-family-pin'] || '').toString().trim();

    if (req.method === 'GET') {
      if (!fs.existsSync(fpath)) {
        return sendJson(res, 404, { exists: false, message: '아직 저장된 가족 데이터가 없습니다.' });
      }
      try {
        const stored = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
        if (stored.pinHash && stored.pinHash !== hashPin(pinHeader)) {
          return sendJson(res, 403, { error: '가족 PIN 번호가 일치하지 않습니다.' });
        }
        return sendJson(res, 200, {
          exists: true,
          code,
          updatedAt: stored.updatedAt,
          data: stored.data
        });
      } catch (_) {
        return sendJson(res, 500, { error: '프로필 데이터를 읽는 중 오류가 발생했습니다.' });
      }
    }

    if (req.method === 'PUT') {
      try {
        const raw = await readRequestBody(req);
        const body = JSON.parse(raw || '{}');
        if (!body.data || typeof body.data !== 'object') {
          return sendJson(res, 400, { error: '저장할 data 객체가 필요합니다.' });
        }

        // Check existing PIN if already protected
        if (fs.existsSync(fpath)) {
          const existing = JSON.parse(fs.readFileSync(fpath, 'utf-8'));
          if (existing.pinHash && existing.pinHash !== hashPin(pinHeader)) {
            return sendJson(res, 403, { error: '기존 가족 PIN 번호가 일치하지 않아 덮어쓸 수 없습니다.' });
          }
        }

        const record = {
          code,
          pinHash: pinHeader ? hashPin(pinHeader) : '',
          updatedAt: new Date().toISOString(),
          data: body.data
        };
        const tmpPath = `${fpath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(record), 'utf-8');
        fs.renameSync(tmpPath, fpath);
        return sendJson(res, 200, { ok: true, code, updatedAt: record.updatedAt });
      } catch (err) {
        if (err.message === 'PAYLOAD_TOO_LARGE') {
          return sendJson(res, 413, { error: '데이터 크기가 18MB를 초과했습니다.' });
        }
        return sendJson(res, 400, { error: '잘못된 JSON 요청입니다.' });
      }
    }
  }

  // 3. Secure Gemini Live Ephemeral Token Minting (when GEMINI_API_KEY env var is set)
  if (urlObj.pathname === '/api/gemini-live-token' && req.method === 'POST') {
    const serverKey = process.env.GEMINI_API_KEY;
    if (!serverKey) {
      return sendJson(res, 501, {
        error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 부모님 설정에 개인 키를 입력하거나 서버 환경변수를 설정해 주세요.'
      });
    }
    try {
      const raw = await readRequestBody(req);
      const body = JSON.parse(raw || '{}');
      const now = Date.now();
      const expireTime = new Date(now + 25 * 60 * 1000).toISOString();
      const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();

      const tokenReq = {
        uses: 1,
        expireTime,
        newSessionExpireTime
      };
      if (body.setup) {
        tokenReq.bidiGenerateContentSetup = body.setup;
      }

      const apiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/auth_tokens?key=${encodeURIComponent(serverKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenReq)
        }
      );
      const result = await apiRes.json();
      if (!apiRes.ok) {
        return sendJson(res, apiRes.status, { error: result?.error?.message || '임시 토큰 발급 실패' });
      }
      return sendJson(res, 200, { token: result.name, expireTime });
    } catch (err) {
      return sendJson(res, 500, { error: '임시 토큰 발급 중 오류가 발생했습니다.' });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, urlObj) {
  let relPath = decodeURIComponent(urlObj.pathname);
  if (relPath === '/' || relPath === '') relPath = '/index.html';

  // Block accessing server/ directory or parent directory traversal
  const resolved = path.resolve(ROOT_DIR, '.' + relPath);
  if (!resolved.startsWith(ROOT_DIR) || resolved.startsWith(path.join(ROOT_DIR, 'server'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': mime };
    if (relPath === '/sw.js' || relPath === '/manifest.json') {
      headers['Cache-Control'] = 'no-cache';
    } else if (relPath.startsWith('/assets/')) {
      headers['Cache-Control'] = 'public, max-age=604800';
    }
    res.writeHead(200, headers);
    fs.createReadStream(resolved).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (urlObj.pathname.startsWith('/api/')) {
    handleApi(req, res, urlObj);
  } else {
    serveStatic(req, res, urlObj);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`TalkieFriends server listening on http://${HOST}:${PORT}`);
});
