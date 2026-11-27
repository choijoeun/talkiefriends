/* ==========================================================================
   TalkieFriends v5 — Cross-Device Family Cloud Sync & PWA Install Manager
   - Syncs characters, photos, weak expressions, session history & settings
     across ANY computer/tablet via Family Code (/api/profile/:code)
   - Portable 1-click .tfbackup.json Export & Import (works 100% offline!)
   - PWA Service Worker registration & native app installation prompt
   ========================================================================== */

window.TFSync = (function () {
  let serverCaps = { syncReady: false, hasServerGeminiKey: false };
  let deferredInstallPrompt = null;
  let autoSyncTimer = null;

  async function detectServer() {
    if (
      window.location.protocol === 'file:' ||
      window.location.protocol === 'about:' ||
      window.location.protocol === 'blob:' ||
      window.location.hostname.endsWith('.github.io')
    ) {
      serverCaps = { syncReady: false, hasServerGeminiKey: false };
      return serverCaps;
    }
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        serverCaps = {
          syncReady: Boolean(data.syncReady),
          hasServerGeminiKey: Boolean(data.hasServerGeminiKey)
        };
      }
    } catch (_) {
      serverCaps = { syncReady: false, hasServerGeminiKey: false };
    }
    return serverCaps;
  }

  function getServerCaps() {
    return serverCaps;
  }

  function getSyncBaseUrl(customServerUrl) {
    if (customServerUrl && customServerUrl.trim()) {
      return customServerUrl.trim().replace(/\/+$/, '');
    }
    if (window.location.protocol.startsWith('http')) {
      return window.location.origin;
    }
    return '';
  }

  async function pullFamilyProfile({ familyCode, familyPin, serverUrl }) {
    const code = (familyCode || '').trim().toUpperCase();
    if (code.length < 3) throw new Error('가족 코드를 3자 이상 입력해 주세요 (예: BLUEY-2026)');
    const base = getSyncBaseUrl(serverUrl);
    if (!base) throw new Error('동기화 서버 주소가 없어요. 서버에 배포하거나 서버 주소를 입력해 주세요.');

    const res = await fetch(`${base}/api/profile/${encodeURIComponent(code)}`, {
      method: 'GET',
      headers: familyPin ? { 'X-Family-Pin': familyPin } : {}
    });
    const body = await res.json();
    if (res.status === 404) return { exists: false };
    if (!res.ok) throw new Error(body.error || '불러오기에 실패했어요.');
    return { exists: true, data: body.data, updatedAt: body.updatedAt };
  }

  async function pushFamilyProfile({ familyCode, familyPin, serverUrl, stateData }) {
    const code = (familyCode || '').trim().toUpperCase();
    if (code.length < 3) throw new Error('가족 코드를 3자 이상 입력해 주세요.');
    const base = getSyncBaseUrl(serverUrl);
    if (!base) throw new Error('동기화 서버에 연결되어 있지 않습니다.');

    // Strip raw personal API key before cloud upload unless user explicitly chooses to sync it
    const safeClone = JSON.parse(JSON.stringify(stateData));
    if (safeClone.settings && !safeClone.settings.syncApiKey) {
      safeClone.settings.apiKey = '';
    }

    const res = await fetch(`${base}/api/profile/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(familyPin ? { 'X-Family-Pin': familyPin } : {})
      },
      body: JSON.stringify({ data: safeClone })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || '저장에 실패했어요.');
    return body;
  }

  function scheduleAutoSync(syncArgsFn, onStatus) {
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async () => {
      const args = syncArgsFn();
      if (!args || !args.familyCode) return;
      if (!serverCaps.syncReady && !args.serverUrl) return;
      try {
        const res = await pushFamilyProfile(args);
        if (onStatus) onStatus(`☁️ 자동 동기화 완료 (${new Date(res.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})`);
      } catch (_) {}
    }, 1500);
  }

  // Portable 1-Click .tfbackup.json Export & Import (works everywhere!)
  function exportBackupFile(stateData, familyCode) {
    const payload = {
      format: 'talkiefriends-family-backup',
      version: 5,
      exportedAt: new Date().toISOString(),
      familyCode: familyCode || '',
      data: stateData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `TalkieFriends_${(familyCode || 'MyFamily')}_${stamp}.tfbackup.json`;
    a.click();
  }

  function importBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || !parsed.data || !Array.isArray(parsed.data.characters)) {
            throw new Error('올바른 TalkieFriends 가족 백업 파일이 아니에요.');
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }

  // PWA Service Worker & Install Prompt
  function initPWA({ onInstallAvailable, onInstalled }) {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (onInstallAvailable) onInstallAvailable(true);
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (onInstalled) onInstalled();
    });
  }

  async function triggerPWAInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return { status: choice.outcome };
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return { status: 'already_installed' };
    if (isIOS) return { status: 'ios_guide' };
    return { status: 'browser_menu_guide' };
  }

  // Family Access Passcode Verification (salted SHA-256 + FNV fallback; zero plaintext PIN in source)
  const PASSCODE_SALT = 'tf_family_gate_v5:';
  const DEFAULT_PASSCODE_SHA256 = '5578e7b6a4c7e5c26407c988632848259f58c1898b6930e682660a7b55e82f61';
  const DEFAULT_PASSCODE_FNV = 'd4daa7f3';

  function fnv32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  async function verifyFamilyPasscode(pin) {
    const salted = `${PASSCODE_SALT}${String(pin || '').trim()}`;
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      return hex === DEFAULT_PASSCODE_SHA256;
    }
    return fnv32(salted) === DEFAULT_PASSCODE_FNV;
  }

  // Zero-Server 1-Click Cross-Device Transfer Link (carries weak vault, character settings & history; NO API key or giant blobs)
  function buildTransferLink(stateData) {
    const compact = {
      v: 5,
      activeCharId: stateData.activeCharId,
      activeRoleplayId: stateData.activeRoleplayId,
      activeBgId: stateData.activeBgId,
      weakExpressions: (stateData.weakExpressions || []).slice(0, 25),
      sessionHistory: (stateData.sessionHistory || []).slice(0, 10),
      charPrefs: (stateData.characters || []).map((c) => ({
        id: c.id,
        nameKr: c.nameKr,
        nameEn: c.nameEn,
        personality: c.personality,
        accessory: c.rig?.accessory || 'none'
      }))
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#tfshare=${b64}`;
  }

  function consumeIncomingTransferLink() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#tfshare=')) return null;
    try {
      const raw = hash.slice('#tfshare='.length).replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(raw);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  return {
    detectServer,
    getServerCaps,
    pullFamilyProfile,
    pushFamilyProfile,
    scheduleAutoSync,
    exportBackupFile,
    importBackupFile,
    initPWA,
    triggerPWAInstall,
    verifyFamilyPasscode,
    getUnlockToken: () => DEFAULT_PASSCODE_SHA256.slice(0, 16),
    buildTransferLink,
    consumeIncomingTransferLink
  };
})();
