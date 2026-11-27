/* ==========================================================================
   TalkieFriends v5 — Kid-First Storybook Theater Controller
   - Full-bleed picture-book UI + visual picture-card setup for 6~7yo kids
   - Real-Time Gemini Live WebSocket Bidirectional Voice + RMS Audio Lip-Sync
   - BOTH Open Free Talk (no script!) AND 5 Domain Roleplays
   - Cross-Device Family Cloud Sync (/api/profile/:code) + .tfbackup.json + PWA
   - Parent Hub: 5-Section Silent Report + Session History + Weak Vault
   ========================================================================== */

(function () {
  const STORAGE_KEY = 'talkiefriends_v5_live';
  const LEGACY_STORAGE_KEY = 'talkiefriends_v4_kidui';

  const SHORT_PLACE_NAMES = {
    snack_shop: '🍜 라면 가게',
    picnic_park: '🌸 뒷마당 소풍',
    animal_clinic: '🏥 동물병원',
    cloud_playground: '🌈 무지개 놀이터',
    phonics_market: '🛒 파닉스 마켓'
  };

  const SHORT_MOOD_LABELS = {
    playful_bouncy: { title: '🎉 장난꾸러기', sub: '블루이처럼 신나게!' },
    sweet_warm: { title: '💖 다정다정', sub: '빙고처럼 포근하게!' },
    brave_hero: { title: '⚡ 씩씩히어로', sub: '러스티처럼 용감하게!' },
    calm_gentle: { title: '🌙 조용차분', sub: '코코처럼 부드럽게!' },
    curious_explorer: { title: '🔍 탐험가', sub: '마일로처럼 호기심 가득!' }
  };

  const ACCESSORY_ITEMS = [
    { id: 'none', label: '없음', emoji: '🚫' },
    { id: 'crown', label: '골드 왕관', emoji: '👑' },
    { id: 'ribbon', label: '핑크 리본', emoji: '🎀' },
    { id: 'chef_hat', label: '셰프 모자', emoji: '👨‍🍳' },
    { id: 'safari_hat', label: '탐험 모자', emoji: '👒' },
    { id: 'glasses', label: '동글 안경', emoji: '👓' }
  ];

  let state = {
    characters: [],
    customBackgrounds: [],
    activeCharId: 'bluey',
    activeRoleplayId: 'snack_shop',
    activeBgId: 'snack_shop',
    weakExpressions: [],
    sessionHistory: [],
    sync: {
      familyCode: '',
      familyPin: '',
      serverUrl: ''
    },
    settings: {
      voiceURI: '',
      autoHint: true,
      autoTTS: true,
      showKoreanHint: true,
      apiKey: '',
      useGeminiLive: true,
      liveModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
      syncApiKey: false
    }
  };

  let session = {
    isLive: false,
    liveConnecting: false,
    beatIndex: 0,
    turnCount: 0,
    stars: 0,
    awaitingRepeat: null,
    lastSpokenEn: '',
    currentAnim: 'idle',
    studioAnim: 'idle',
    studioExploded: false,
    activePartCategory: 'accessory',
    transcript: [],
    corrections: [],
    pillars: { calendar: 0, daily: 0, manners: 0 },
    prepMessages: [],
    lastSavedHistoryKey: ''
  };

  const $ = (id) => document.getElementById(id);

  function resolveImg(src) {
    if (!src) return '';
    if (src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('http')) return src;
    return window.TFData.assetUrl(src);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatSimpleMarkdown(str) {
    return escapeHtml(str).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
  }

  function patchDefaultCharacterFields(chars) {
    const defaultsById = {};
    window.TFData.DEFAULT_CHARACTERS.forEach((c) => {
      defaultsById[c.id] = c;
    });
    return chars.map((c) => {
      const def = defaultsById[c.id];
      return {
        ...c,
        geminiVoice: c.geminiVoice || (def ? def.geminiVoice : 'Puck')
      };
    });
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = JSON.parse(raw || 'null');
      if (saved && Array.isArray(saved.characters) && saved.characters.length) {
        state = {
          ...state,
          ...saved,
          characters: patchDefaultCharacterFields(saved.characters),
          sessionHistory: Array.isArray(saved.sessionHistory) ? saved.sessionHistory : [],
          sync: { ...state.sync, ...(saved.sync || {}) },
          settings: { ...state.settings, ...(saved.settings || {}) }
        };
        return;
      }
    } catch (_) {}
    state.characters = JSON.parse(JSON.stringify(window.TFData.DEFAULT_CHARACTERS));
    state.weakExpressions = JSON.parse(JSON.stringify(window.TFData.INITIAL_WEAK_EXPRESSIONS));
    state.customBackgrounds = [];
    state.sessionHistory = [];
    state.activeCharId = 'bluey';
    state.activeRoleplayId = 'snack_shop';
    state.activeBgId = 'snack_shop';
  }

  function saveState(skipCloudSync = false) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      showToast('⚠️ 저장 공간이 부족합니다. 업로드 사진 수를 줄여 주세요.');
    }

    if (!skipCloudSync && window.TFSync && state.sync && state.sync.familyCode) {
      window.TFSync.scheduleAutoSync(
        () => ({
          familyCode: state.sync.familyCode,
          familyPin: state.sync.familyPin,
          serverUrl: state.sync.serverUrl,
          stateData: state
        }),
        (statusMsg) => {
          const el = $('sync-status-text');
          if (el) el.textContent = statusMsg;
        }
      );
    }
  }

  function getActiveChar() {
    return state.characters.find((c) => c.id === state.activeCharId) || state.characters[0];
  }

  function getActiveRoleplay() {
    return window.TFData.ROLEPLAY_DOMAINS[state.activeRoleplayId] || window.TFData.ROLEPLAY_DOMAINS.snack_shop;
  }

  function getAllBackgrounds() {
    return [...Object.values(window.TFData.BACKGROUND_SETS), ...(state.customBackgrounds || [])];
  }

  function getActiveBackground() {
    return getAllBackgrounds().find((b) => b.id === state.activeBgId) || window.TFData.BACKGROUND_SETS.snack_shop;
  }

  function canUseGeminiLive() {
    if (!window.TFGeminiLive || !state.settings.useGeminiLive) return false;
    const caps = window.TFSync ? window.TFSync.getServerCaps() : { hasServerGeminiKey: false };
    return Boolean(caps.hasServerGeminiKey || (state.settings.apiKey && state.settings.apiKey.trim()));
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  // ==================== SHEETS HELPERS ====================
  function openSheet(id) {
    document.querySelectorAll('.sheet-backdrop').forEach((s) => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
  }

  function closeAllSheets() {
    document.querySelectorAll('.sheet-backdrop').forEach((s) => s.classList.add('hidden'));
  }

  // ==================== TOPBAR, STAGE & LIVE BADGE ====================
  function updateVoiceModeBadge() {
    const badge = $('voice-mode-badge');
    const liveStatus = $('gemini-live-status');
    const caps = window.TFSync ? window.TFSync.getServerCaps() : { hasServerGeminiKey: false };
    const hasPersonalKey = Boolean(state.settings.apiKey && state.settings.apiKey.trim());

    if (badge) {
      badge.classList.remove('live-active', 'live-ready');
      if (window.TFGeminiLive && window.TFGeminiLive.isConnected()) {
        badge.textContent = '🔴 Gemini Live 실시간';
        badge.classList.add('live-active');
      } else if (session.liveConnecting) {
        badge.textContent = '⏳ Gemini Live 연결 중';
        badge.classList.add('live-ready');
      } else if (canUseGeminiLive()) {
        badge.textContent = '⚡ Gemini Live 준비됨';
        badge.classList.add('live-ready');
      } else if (hasPersonalKey) {
        badge.textContent = '🤖 Gemini 자유대화';
        badge.classList.add('live-ready');
      } else {
        badge.textContent = '🎙️ 기본 음성';
      }
    }

    if (liveStatus) {
      liveStatus.classList.remove('ready', 'warn');
      if (window.TFGeminiLive && window.TFGeminiLive.isConnected()) {
        liveStatus.textContent = '🔴 실시간 연결 중';
        liveStatus.classList.add('ready');
      } else if (caps.hasServerGeminiKey) {
        liveStatus.textContent = '🟢 서버 토큰 준비됨';
        liveStatus.classList.add('ready');
      } else if (hasPersonalKey) {
        liveStatus.textContent = '🟢 개인 API 키 준비됨';
        liveStatus.classList.add('ready');
      } else {
        liveStatus.textContent = 'API 키 미설정';
        liveStatus.classList.add('warn');
      }
    }
  }

  function renderTopBarAndBg() {
    const ch = getActiveChar();
    const bg = getActiveBackground();
    const rp = getActiveRoleplay();
    const moodShort = SHORT_MOOD_LABELS[ch.personality] || SHORT_MOOD_LABELS.playful_bouncy;

    $('topbar-char-rig').innerHTML = window.TFRig.renderPuppetSVG(ch, { animState: 'idle' });
    $('topbar-char-name').textContent = ch.nameKr;
    $('topbar-char-mood').textContent = moodShort.title;

    const bgSrc = resolveImg(bg.img);
    $('topbar-bg-thumb').src = bgSrc;
    $('live-stage-bg-img').src = bgSrc;
    $('studio-preview-bg').src = bgSrc;

    if (rp.isFreeTalk) {
      $('topbar-place-name').textContent = '💬 자유 토킹';
      $('topbar-place-sub').textContent = SHORT_PLACE_NAMES[bg.id] || bg.nameKr;
    } else {
      $('topbar-place-name').textContent = SHORT_PLACE_NAMES[bg.id] || bg.nameKr;
      $('topbar-place-sub').textContent = '역할극 · 자유토킹';
    }

    $('bubble-speaker').textContent = `🐾 ${ch.nameEn} (${ch.nameKr}) · ${moodShort.title}`;

    const pending = state.weakExpressions.filter((w) => !w.mastered).length;
    $('weak-count-badge').textContent = String(pending);
    $('weak-count-badge').classList.toggle('hidden', pending === 0);

    updateVoiceModeBadge();
    updateGiantActionButton();
  }

  function renderLivePuppet(animState = 'idle') {
    session.currentAnim = animState;
    $('live-puppet-container').innerHTML = window.TFRig.renderPuppetSVG(getActiveChar(), { animState });
  }

  function applyLiveRmsLipSync(speaking, rms) {
    const svg = $('live-puppet-container').querySelector('.puppet-svg');
    if (!svg) return;
    if (speaking) {
      svg.classList.add('state-speaking-rms');
      svg.classList.toggle('rms-mouth-open', rms > 0.025);
    } else {
      svg.classList.remove('state-speaking-rms', 'rms-mouth-open');
    }
  }

  function spawnParticles(emoji = '✨') {
    const layer = $('particle-layer');
    for (let i = 0; i < 7; i++) {
      const span = document.createElement('span');
      span.className = 'floating-particle';
      span.textContent = emoji;
      span.style.left = `${30 + Math.random() * 40}%`;
      span.style.animationDelay = `${i * 0.08}s`;
      layer.appendChild(span);
      setTimeout(() => span.remove(), 1450);
    }
  }

  function updateGiantActionButton() {
    const btn = $('giant-action-btn');
    const icon = $('giant-action-icon');
    const label = $('giant-action-label');
    const ch = getActiveChar();
    const prepBtn = $('open-prep-quick-btn');

    btn.classList.remove('mode-mic', 'mode-recording', 'mode-gemini-live');

    if (session.liveConnecting) {
      btn.classList.add('mode-gemini-live');
      icon.textContent = '⏳';
      label.textContent = '실시간 연결 중...';
      prepBtn.textContent = '🔒 그림잠금';
      return;
    }

    if (window.TFGeminiLive && window.TFGeminiLive.isConnected()) {
      btn.classList.add('mode-gemini-live');
      icon.textContent = '🔴';
      label.textContent = '실시간 대화 중! (잠시 멈춤)';
      prepBtn.textContent = '🔒 그림잠금';
      prepBtn.title = '규칙 0: Live 중에는 목소리 대화에 집중해요';
      return;
    }

    if (!session.isLive) {
      icon.textContent = '▶️';
      label.textContent = canUseGeminiLive() ? `${ch.nameKr}랑 실시간 놀자!` : `${ch.nameKr}랑 놀자!`;
      prepBtn.textContent = '🎨 그림방';
      prepBtn.title = 'Live 시작 전 동화 배경 그림방';
    } else if (window.TFVoice.getIsListening()) {
      btn.classList.add('mode-recording');
      icon.textContent = '🎤';
      label.textContent = '듣고 있어요...';
      prepBtn.textContent = '🔒 그림잠금';
    } else {
      btn.classList.add('mode-mic');
      icon.textContent = '🎤';
      label.textContent = '눌러서 말하기!';
      prepBtn.textContent = '🔒 그림잠금';
      prepBtn.title = '규칙 0: Live 중에는 목소리 대화에 집중해요';
    }
  }

  function renderMissionDots() {
    ['calendar', 'daily', 'manners'].forEach((p) => {
      $(`mission-${p}`).classList.toggle('done', session.pillars[p] > 0);
    });
    $('session-stars').textContent = String(session.stars);
  }

  // ==================== DIALOGUE & LIVE FLOW ====================
  function hideSilenceHud() {
    $('silence-hud').classList.add('hidden');
    $('silence-progress-fill').style.width = '0%';
  }

  function setCharacterBubble({ en, kr, choices, echoTarget, anim, particle, speak }) {
    const ch = getActiveChar();
    session.lastSpokenEn = en;
    $('bubble-english').textContent = en;
    $('bubble-korean-hint').textContent = kr || '';
    $('bubble-korean-hint').classList.toggle('hidden', !state.settings.showKoreanHint || !kr);

    if (echoTarget) {
      session.awaitingRepeat = echoTarget;
      $('echo-card').classList.remove('hidden');
      $('echo-sentence').textContent = `"${echoTarget.correct}"`;
    } else {
      session.awaitingRepeat = null;
      $('echo-card').classList.add('hidden');
    }

    const chipsWrap = $('choice-chips');
    chipsWrap.innerHTML = (choices || [])
      .map((c) => `<button class="choice-chip-btn" type="button">${escapeHtml(c)}</button>`)
      .join('');
    chipsWrap.querySelectorAll('.choice-chip-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleChildUtterance(btn.textContent));
    });

    if (particle) spawnParticles(particle);

    if (speak && state.settings.autoTTS && !(window.TFGeminiLive && window.TFGeminiLive.isConnected())) {
      window.TFVoice.stopSilenceTimer();
      hideSilenceHud();
      renderLivePuppet('speaking');
      window.TFVoice.speakEnUS(en, {
        pitch: ch.pitch,
        rate: ch.rate,
        onStart: () => renderLivePuppet('speaking'),
        onEnd: () => {
          renderLivePuppet(anim || 'idle');
          if (session.isLive && state.settings.autoHint) beginSilenceHintCountdown();
        }
      });
    } else {
      renderLivePuppet(anim || 'idle');
      if (session.isLive && state.settings.autoHint && !(window.TFGeminiLive && window.TFGeminiLive.isConnected())) {
        beginSilenceHintCountdown();
      }
    }
  }

  function beginSilenceHintCountdown() {
    $('silence-hud').classList.remove('hidden');
    window.TFVoice.startSilenceTimer({
      onTick: (ratio, remainingSec) => {
        $('silence-progress-fill').style.width = `${Math.round(ratio * 100)}%`;
        $('silence-status-text').textContent = `⏳ 천천히 생각해요... ${remainingSec.toFixed(1)}초 뒤 힌트`;
      },
      onTimeout: () => triggerProactiveSilenceHint()
    });
  }

  function triggerProactiveSilenceHint() {
    if (!session.isLive) {
      session.isLive = true;
      updateGiantActionButton();
    }
    const ch = getActiveChar();
    const rp = getActiveRoleplay();
    const hint = window.TFEngine.getSilenceHint(ch, rp, session.beatIndex, session.awaitingRepeat);
    hideSilenceHud();

    session.transcript.push({
      role: 'ai',
      speaker: ch.nameKr,
      text: hint.en,
      tag: `⏳ 4.5초 힌트 (${window.TFEngine.getProfile(ch).nameKr})`
    });

    setCharacterBubble({
      en: hint.en,
      kr: hint.kr,
      choices: hint.choices,
      echoTarget: session.awaitingRepeat,
      anim: hint.anim || 'hint',
      speak: true
    });
  }

  function startStandardLiveSession() {
    session.isLive = true;
    session.liveConnecting = false;
    updateVoiceModeBadge();
    updateGiantActionButton();
    const ch = getActiveChar();
    const rp = getActiveRoleplay();
    const opening = window.TFEngine.getOpeningLine(ch, rp);

    if (session.transcript.length === 0) {
      session.transcript.push({
        role: 'ai',
        speaker: ch.nameKr,
        text: opening.en,
        tag: `🎙️ Live 시작 (${window.TFEngine.getProfile(ch).nameKr})`
      });
    }

    setCharacterBubble({
      en: opening.en,
      kr: opening.kr,
      choices: opening.choices,
      anim: 'wave',
      particle: opening.particle,
      speak: true
    });
  }

  async function startGeminiLiveSession() {
    const ch = getActiveChar();
    const rp = getActiveRoleplay();
    const bg = getActiveBackground();
    const prof = window.TFEngine.getProfile(ch);
    const caps = window.TFSync ? window.TFSync.getServerCaps() : { hasServerGeminiKey: false };
    const useServerToken = Boolean(caps.hasServerGeminiKey && !state.settings.apiKey.trim());

    window.TFVoice.stopAllSpeech();
    window.TFVoice.stopListening();
    hideSilenceHud();

    session.isLive = true;
    session.liveConnecting = true;
    updateVoiceModeBadge();
    updateGiantActionButton();

    const systemInstruction = window.TFEngine.compileSystemPrompt(ch, rp, bg, state.weakExpressions);
    const openingPrompt = rp.isFreeTalk
      ? `Greet your 6-year-old Korean friend warmly as ${ch.nameEn} (${prof.nameKr}) in Open Free Talk mode! Say 1-2 short lively American English sentences and ask one fun question about their day or favorite things.`
      : `Greet your 6-year-old Korean friend warmly as ${ch.nameEn} (${prof.nameKr}) at "${bg.nameEn}" for "${rp.titleEn}"! Say 1-2 short lively American English sentences and ask one fun either-or question to kick off the play.`;

    const openingChoices = (rp.beats && rp.beats[0] && rp.beats[0].choices) || ['I like dinosaurs!', 'I feel happy!', 'Yes, please!'];
    setCharacterBubble({
      en: 'Connecting to Gemini Live...',
      kr: '⚡ 제미나이 라이브 실시간 음성에 연결하고 있어요...',
      choices: openingChoices,
      anim: 'wave',
      speak: false
    });

    const ok = await window.TFGeminiLive.connect({
      apiKey: state.settings.apiKey.trim(),
      useServerToken,
      model: state.settings.liveModel || 'gemini-2.5-flash-native-audio-preview-09-2025',
      voiceName: ch.geminiVoice || 'Puck',
      systemInstruction,
      openingPrompt,
      autoHint: state.settings.autoHint,
      onConnected: () => {
        session.liveConnecting = false;
        updateVoiceModeBadge();
        updateGiantActionButton();
        renderLivePuppet('idle');
        spawnParticles(prof.particle);
        showToast(`🔴 ${ch.nameKr}와 Gemini Live 연결 완료! 버튼 누르지 않고 바로 말해요!`);
      },
      onSpeakingState: (speaking, rms) => {
        applyLiveRmsLipSync(speaking, rms);
      },
      onUserTranscript: (text, isFinal) => {
        if (!text) return;
        if (!isFinal) {
          $('silence-hud').classList.remove('hidden');
          $('silence-status-text').textContent = `🗣️ "${text}"`;
          return;
        }
        hideSilenceHud();
        if (window.TFEngine.isReportTrigger(text)) {
          finishLessonAndOpenReport();
          return;
        }
        if (window.TFEngine.isDrawRequest(text)) {
          showToast('🔒 규칙 0: Live 음성 대화 중에는 그림 생성이 잠겨 있어요!');
        }
        session.transcript.push({ role: 'child', speaker: '아이', text, tag: '🔴 실시간 음성' });
        session.turnCount += 1;
        const analysis = window.TFEngine.analyzeLiveTranscriptTurn(text);
        if (analysis.pillar && session.pillars[analysis.pillar] !== undefined) {
          session.pillars[analysis.pillar] += 1;
        }
        if (analysis.weakEntry) {
          session.corrections.push(analysis.weakEntry);
          upsertWeakExpression(analysis.weakEntry);
        } else {
          session.stars += 1;
        }
        renderMissionDots();
      },
      onModelTranscript: (text, isFinal) => {
        if (!text) return;
        session.lastSpokenEn = text;
        $('bubble-english').textContent = text;
        $('bubble-korean-hint').textContent = '🔴 Gemini Live 실시간 대화 — 마이크가 열려 있어요! 바로 이어서 말해 보세요.';
        $('bubble-korean-hint').classList.toggle('hidden', !state.settings.showKoreanHint);
        if (isFinal) {
          session.transcript.push({
            role: 'ai',
            speaker: ch.nameKr,
            text,
            tag: `🔴 Gemini Live (${prof.nameKr})`
          });
        }
      },
      onSilenceTick: (ratio, rem, active) => {
        if (!active) {
          hideSilenceHud();
          return;
        }
        $('silence-hud').classList.remove('hidden');
        $('silence-progress-fill').style.width = `${Math.round(ratio * 100)}%`;
        $('silence-status-text').textContent = `⏳ 천천히 생각해요... ${rem.toFixed(1)}초 뒤 ${ch.nameKr}가 먼저 말을 걸어요`;
      },
      onSilenceNudge: () => {
        showToast(`💡 4.5초 침묵 감지 — ${ch.nameKr}가 다정하게 힌트를 건네요!`);
      },
      onError: (errMsg) => {
        showToast(`⚠️ ${errMsg}`);
      },
      onDisconnected: () => {
        session.liveConnecting = false;
        applyLiveRmsLipSync(false, 0);
        hideSilenceHud();
        updateVoiceModeBadge();
        updateGiantActionButton();
      }
    });

    if (!ok) {
      session.liveConnecting = false;
      showToast('💡 기본 음성 대화 모드로 자연스럽게 전환했어요!');
      startStandardLiveSession();
    }
  }

  function startLiveSession() {
    if (canUseGeminiLive()) {
      startGeminiLiveSession();
    } else {
      startStandardLiveSession();
    }
  }

  function handleGiantButtonClick() {
    if (session.liveConnecting) return;

    if (window.TFGeminiLive && window.TFGeminiLive.isConnected()) {
      window.TFGeminiLive.disconnect();
      session.isLive = false;
      updateVoiceModeBadge();
      updateGiantActionButton();
      renderLivePuppet('idle');
      showToast('⏸️ 실시간 음성 대화를 잠시 멈췄어요. 다시 누르면 이어서 놀아요!');
      return;
    }

    if (!session.isLive) {
      startLiveSession();
      return;
    }

    if (window.TFVoice.getIsListening()) {
      window.TFVoice.stopListening();
      updateGiantActionButton();
      return;
    }

    window.TFVoice.stopAllSpeech();
    hideSilenceHud();
    const started = window.TFVoice.startListening({
      onStart: () => {
        updateGiantActionButton();
        renderLivePuppet('listening');
        $('silence-hud').classList.remove('hidden');
        $('silence-status-text').textContent = '🎤 잘 듣고 있어요! 편하게 말해 봐요';
      },
      onInterim: (interim) => {
        $('silence-status-text').textContent = `🎤 "${interim}"`;
      },
      onResult: (finalText) => {
        hideSilenceHud();
        handleChildUtterance(finalText);
      },
      onEnd: () => {
        updateGiantActionButton();
      },
      onError: (msg) => {
        hideSilenceHud();
        updateGiantActionButton();
        showToast(msg);
      }
    });
    if (!started) {
      $('live-text-form').classList.remove('hidden');
    }
  }

  async function handleChildUtterance(rawText) {
    const text = (rawText || '').trim();
    if (!text) return;

    window.TFVoice.stopSilenceTimer();
    hideSilenceHud();

    if (window.TFEngine.isReportTrigger(text)) {
      finishLessonAndOpenReport();
      return;
    }

    // If connected to real-time Gemini Live WebSocket, route choice/text directly there!
    if (window.TFGeminiLive && window.TFGeminiLive.isConnected()) {
      if (window.TFEngine.isDrawRequest(text)) {
        showToast('🔒 규칙 0: Live 음성 대화 중에는 그림 생성이 잠겨 있어요!');
      }
      session.transcript.push({ role: 'child', speaker: '아이', text, tag: '💬 텍스트/선택' });
      session.turnCount += 1;
      const analysis = window.TFEngine.analyzeLiveTranscriptTurn(text);
      if (analysis.pillar && session.pillars[analysis.pillar] !== undefined) {
        session.pillars[analysis.pillar] += 1;
      }
      if (analysis.weakEntry) {
        session.corrections.push(analysis.weakEntry);
        upsertWeakExpression(analysis.weakEntry);
      } else {
        session.stars += 1;
      }
      renderMissionDots();
      window.TFGeminiLive.sendText(text);
      return;
    }

    if (!session.isLive) {
      session.isLive = true;
      updateGiantActionButton();
    }

    session.transcript.push({ role: 'child', speaker: '아이', text, tag: '' });
    session.turnCount += 1;

    const ch = getActiveChar();
    const rp = getActiveRoleplay();
    const bg = getActiveBackground();

    const result = await window.TFEngine.processLiveUtterance({
      rawInput: text,
      character: ch,
      roleplay: rp,
      background: bg,
      beatIndex: session.beatIndex,
      awaitingRepeat: session.awaitingRepeat,
      weakExpressions: state.weakExpressions,
      turnCount: session.turnCount,
      history: session.transcript,
      apiKey: state.settings.apiKey
    });

    if (!result) return;
    if (result.type === 'TRIGGER_REPORT') {
      finishLessonAndOpenReport();
      return;
    }
    if (result.toast) showToast(result.toast);

    if (result.pillar && session.pillars[result.pillar] !== undefined) {
      session.pillars[result.pillar] += 1;
      renderMissionDots();
    }
    if (result.awardStar) {
      session.stars += 1;
      renderMissionDots();
    }
    if (typeof result.nextBeatIndex === 'number') session.beatIndex = result.nextBeatIndex;
    if (result.echoTarget && !result.echoTarget.isReviewCallback) {
      const entry = {
        wrong: result.echoTarget.wrong,
        correct: result.echoTarget.correct,
        category: result.echoTarget.category,
        pillar: result.echoTarget.pillar || 'daily'
      };
      session.corrections.push(entry);
      upsertWeakExpression(entry);
    }
    if (result.masteredWeakTarget) incrementWeakMastery(result.masteredWeakTarget);

    session.transcript.push({
      role: result.type === 'DRAW_BLOCKED' ? 'system' : 'ai',
      speaker: ch.nameKr,
      text: result.en,
      tag: result.logTag || ''
    });

    setCharacterBubble({
      en: result.en,
      kr: result.kr,
      choices: result.choices,
      echoTarget: result.echoTarget || null,
      anim: result.anim || 'celebrate',
      particle: result.particle || null,
      speak: true
    });
  }

  function archiveCurrentSessionToHistory(reportObj) {
    if (!reportObj || session.transcript.filter((t) => t.role === 'child').length === 0) return;
    const key = `${reportObj.dateStr}|${reportObj.topic.roleplayTitle}|${reportObj.topic.turnsCount}|${reportObj.topic.stars}`;
    if (session.lastSavedHistoryKey === key) return;
    session.lastSavedHistoryKey = key;
    state.sessionHistory = [
      {
        dateStr: reportObj.dateStr,
        topic: reportObj.topic,
        corrections: reportObj.corrections.slice(0, 5)
      },
      ...(state.sessionHistory || [])
    ].slice(0, 20);
    saveState();
  }

  function finishLessonAndOpenReport() {
    // Rule 5: Strictly stop ALL TTS & Gemini Live audio immediately!
    if (window.TFGeminiLive) window.TFGeminiLive.disconnect();
    window.TFVoice.stopAllSpeech();
    window.TFVoice.stopListening();
    hideSilenceHud();
    session.isLive = false;
    session.liveConnecting = false;
    updateVoiceModeBadge();
    updateGiantActionButton();
    renderLivePuppet('idle');
    openParentHub('report', true);
    showToast('📋 엄마·아빠 리포트가 준비되었어요 (음성 낭독 꺼짐)');
  }

  // ==================== SHEET 1: KID CHARACTER PICKER ====================
  function renderCharTray() {
    $('kid-char-grid').innerHTML = state.characters
      .map((ch) => {
        const moodShort = SHORT_MOOD_LABELS[ch.personality] || SHORT_MOOD_LABELS.playful_bouncy;
        return `
        <button type="button" class="kid-char-card ${ch.id === state.activeCharId ? 'selected' : ''}" data-cid="${ch.id}">
          ${window.TFRig.renderPuppetSVG(ch, { animState: 'idle' })}
          <strong>${escapeHtml(ch.nameKr)}</strong>
          <span>${escapeHtml(moodShort.title)}</span>
        </button>`;
      })
      .join('');

    $('kid-char-grid').querySelectorAll('.kid-char-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectActiveCharacter(btn.dataset.cid);
        closeAllSheets();
      });
    });
  }

  function selectActiveCharacter(charId) {
    const ch = state.characters.find((c) => c.id === charId);
    if (!ch) return;
    const wasGeminiLive = window.TFGeminiLive && window.TFGeminiLive.isConnected();
    if (wasGeminiLive) window.TFGeminiLive.disconnect();

    state.activeCharId = ch.id;
    saveState();
    renderTopBarAndBg();

    if (wasGeminiLive) {
      startGeminiLiveSession();
    } else {
      const opening = window.TFEngine.getOpeningLine(ch, getActiveRoleplay());
      setCharacterBubble({
        en: opening.en,
        kr: opening.kr,
        choices: opening.choices,
        anim: 'wave',
        particle: opening.particle,
        speak: session.isLive
      });
    }
    showToast(`🐾 ${ch.nameKr} 친구가 왔어요!`);
  }

  // ==================== SHEET 2: KID PLACE & FREE TALK / ROLEPLAY PICKER ====================
  function renderPlaceTray() {
    const bgs = getAllBackgrounds();
    const roleplays = window.TFData.ROLEPLAY_DOMAINS;
    const isFreeTalk = state.activeRoleplayId === 'free_talk';

    const ftBtn = $('select-free-talk-btn');
    const ftPill = $('free-talk-active-pill');
    if (ftBtn) ftBtn.classList.toggle('selected', isFreeTalk);
    if (ftPill) ftPill.textContent = isFreeTalk ? '대화 중 ✓' : '선택하기';

    $('kid-place-grid').innerHTML = bgs
      .map((b) => {
        // Ignore free_talk when matching each background card to its dedicated domain roleplay
        const rp = Object.values(roleplays).find((r) => !r.isFreeTalk && r.defaultBgId === b.id);
        const isSelected = !isFreeTalk && b.id === state.activeBgId;
        return `
        <button type="button" class="kid-place-card ${isSelected ? 'selected' : ''}" data-bgid="${b.id}" data-rpid="${rp ? rp.id : ''}">
          <img src="${resolveImg(b.img)}" alt="${escapeHtml(b.nameKr)}" />
          <div class="kid-place-meta">
            <strong>${escapeHtml(SHORT_PLACE_NAMES[b.id] || b.nameKr)}</strong>
            <span>${escapeHtml(rp ? rp.areaBadge : '내가 올린 멋진 배경!')}</span>
          </div>
        </button>`;
      })
      .join('');

    $('kid-place-grid').querySelectorAll('.kid-place-card').forEach((card) => {
      card.addEventListener('click', () => {
        const bgOnly = $('bg-only-switch').checked;
        const wasGeminiLive = window.TFGeminiLive && window.TFGeminiLive.isConnected();
        state.activeBgId = card.dataset.bgid;
        if (!bgOnly && card.dataset.rpid && window.TFData.ROLEPLAY_DOMAINS[card.dataset.rpid]) {
          state.activeRoleplayId = card.dataset.rpid;
          session.beatIndex = 0;
        }
        saveState();
        renderTopBarAndBg();
        if (!bgOnly) {
          if (wasGeminiLive) {
            window.TFGeminiLive.disconnect();
            startGeminiLiveSession();
          } else {
            const opening = window.TFEngine.getOpeningLine(getActiveChar(), getActiveRoleplay());
            setCharacterBubble({
              en: opening.en,
              kr: opening.kr,
              choices: opening.choices,
              anim: 'wave',
              speak: session.isLive
            });
          }
        }
        closeAllSheets();
        showToast(bgOnly ? '🖼️ 배경 그림만 쏙 바꿨어요!' : `🎭 ${SHORT_PLACE_NAMES[state.activeBgId] || '새 장소'} 역할놀이로 출발!`);
      });
    });
  }

  // ==================== SHEET 3: KID DRESS-UP & MOOD STUDIO ====================
  function openDressUpSheet(initialTab = 'mood') {
    session.studioAnim = 'idle';
    renderDressUpAll();
    switchDressUpTab(initialTab);
    openSheet('dressup-sheet');
  }

  function switchDressUpTab(tab) {
    document.querySelectorAll('.dtab').forEach((b) => b.classList.toggle('active', b.dataset.dtab === tab));
    document.querySelectorAll('.dtab-panel').forEach((p) => p.classList.toggle('active', p.id === `dtab-${tab}`));
  }

  function renderStudioPuppet() {
    $('studio-puppet-container').innerHTML = window.TFRig.renderPuppetSVG(getActiveChar(), {
      animState: session.studioAnim,
      exploded: session.studioExploded
    });
  }

  function renderDressUpAll() {
    const ch = getActiveChar();
    renderStudioPuppet();
    $('quick-name-kr').value = ch.nameKr;
    $('quick-name-en').value = ch.nameEn;
    $('delete-char-btn').classList.toggle('hidden', Boolean(ch.isBuiltIn));

    $('mood-card-grid').innerHTML = Object.entries(SHORT_MOOD_LABELS)
      .map(
        ([pid, info]) => `
      <button type="button" class="mood-pick-card ${ch.personality === pid ? 'selected' : ''}" data-pid="${pid}">
        <strong>${escapeHtml(info.title)}</strong>
        <small>${escapeHtml(info.sub)}</small>
      </button>`
      )
      .join('');

    $('mood-card-grid').querySelectorAll('.mood-pick-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = getActiveChar();
        c.personality = btn.dataset.pid;
        saveState();
        renderTopBarAndBg();
        renderDressUpAll();
        const prof = window.TFEngine.getProfile(c);
        session.studioAnim = prof.celebrateAnim;
        renderStudioPuppet();
        window.TFVoice.speakEnUS(prof.greetPrefix(c), {
          pitch: c.pitch,
          rate: c.rate,
          onEnd: () => {
            session.studioAnim = 'idle';
            renderStudioPuppet();
          }
        });
      });
    });

    renderVisualPartsGrid();
  }

  function renderVisualPartsGrid() {
    const ch = getActiveChar();
    const cat = session.activePartCategory;
    const grid = $('visual-parts-grid');

    if (cat === 'accessory') {
      grid.innerHTML = ACCESSORY_ITEMS.map(
        (acc) => `
        <button type="button" class="vpart-card ${ch.rig.accessory === acc.id ? 'selected' : ''}" data-val="${acc.id}">
          <span class="vpart-emoji">${acc.emoji}</span>
          <span>${acc.label}</span>
        </button>`
      ).join('');
      grid.querySelectorAll('.vpart-card').forEach((b) => {
        b.addEventListener('click', () => {
          ch.rig.accessory = b.dataset.val;
          saveState();
          renderStudioPuppet();
          renderLivePuppet(session.currentAnim);
          renderTopBarAndBg();
          renderVisualPartsGrid();
        });
      });
      return;
    }

    const presets = window.TFData.RIG_PRESETS;
    const presetNames = { bluey: '블루이', bingo: '빙고', rusty: '러스티', coco: '코코', milo: '마일로' };
    const imgKeyMap = {
      headPreset: 'headIdle',
      bodyPreset: 'body',
      handsPreset: 'armR',
      tailPreset: 'tail'
    };

    const currentVal = cat === 'handsPreset' ? ch.rig.rightHandPreset : ch.rig[cat];
    grid.innerHTML = Object.keys(presets)
      .map((pk) => {
        const imgPath = resolveImg(presets[pk][imgKeyMap[cat]]);
        return `
        <button type="button" class="vpart-card ${currentVal === pk ? 'selected' : ''}" data-val="${pk}">
          <img src="${imgPath}" alt="${presetNames[pk]}" />
          <span>${presetNames[pk]}</span>
        </button>`;
      })
      .join('');

    grid.querySelectorAll('.vpart-card').forEach((b) => {
      b.addEventListener('click', () => {
        const val = b.dataset.val;
        if (cat === 'handsPreset') {
          ch.rig.leftHandPreset = val;
          ch.rig.rightHandPreset = val;
          ch.rig.customParts.leftHand = null;
          ch.rig.customParts.rightHand = null;
        } else {
          ch.rig[cat] = val;
          if (cat === 'headPreset') { ch.rig.customParts.head = null; ch.rig.customParts.headTalk = null; }
          if (cat === 'bodyPreset') ch.rig.customParts.body = null;
          if (cat === 'tailPreset') ch.rig.customParts.backProp = null;
        }
        saveState();
        session.studioAnim = 'wave';
        renderStudioPuppet();
        renderLivePuppet(session.currentAnim);
        renderTopBarAndBg();
        renderVisualPartsGrid();
      });
    });
  }

  // ==================== SHEET 4: PRE-LIVE PICTURE ROOM (RULE 0) ====================
  function initPrepChat() {
    session.prepMessages = [
      {
        sender: 'assistant',
        badge: '👩‍🏫 부모님 AI 비서 · 그림방',
        text: '안녕하세요! Live를 시작하기 전에 **"그림 그려줘"**라고 말하면 오늘 배경 카드를 **1장씩** 보여드려요!'
      }
    ];
    renderPrepChat();
  }

  function renderPrepChat() {
    const feed = $('prep-chat-feed');
    feed.innerHTML = session.prepMessages
      .map((m) => {
        if (m.sender === 'user') return `<div class="prep-msg user">${escapeHtml(m.text)}</div>`;
        const imgHtml = m.image
          ? `<div class="prep-scene-card"><img src="${resolveImg(m.image.src)}" alt="${escapeHtml(m.image.title)}" /></div>`
          : '';
        return `<div class="prep-msg assistant">${m.badge ? `<div class="prep-role-badge">${escapeHtml(m.badge)}</div>` : ''}<div>${formatSimpleMarkdown(m.text)}</div>${imgHtml}</div>`;
      })
      .join('');
    feed.scrollTop = feed.scrollHeight;
  }

  function handlePrepInput(rawText) {
    const text = (rawText || '').trim();
    if (!text) return;
    session.prepMessages.push({ sender: 'user', text });
    const res = window.TFEngine.processPrepMessage({
      text,
      character: getActiveChar(),
      roleplay: getActiveRoleplay(),
      background: getActiveBackground(),
      weakExpressions: state.weakExpressions
    });
    if (!res) return;
    if (res.type === 'TRIGGER_REPORT') {
      finishLessonAndOpenReport();
      return;
    }
    session.prepMessages.push({ sender: 'assistant', badge: res.roleBadge, text: res.text, image: res.image || null });
    renderPrepChat();
  }

  // ==================== SHEET 5: PARENT HUB (REPORT, SYNC/PWA, WEAK VAULT, COMPARE, GEMINI LIVE) ====================
  let latestReportObj = null;

  function openParentHub(tab = 'report', shouldArchive = false) {
    window.TFVoice.stopAllSpeech(); // Rule 5: Always silent!
    switchParentTab(tab);
    renderParentReport(shouldArchive);
    renderWeakVault();
    renderPersonalityComparison();
    populateSyncAndSettingsUI();
    openSheet('parent-sheet');
  }

  function switchParentTab(tab) {
    document.querySelectorAll('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.ptab === tab));
    document.querySelectorAll('.ptab-panel').forEach((p) => p.classList.toggle('active', p.id === `ptab-${tab}`));
  }

  function populateSyncAndSettingsUI() {
    $('sync-family-code').value = state.sync.familyCode || '';
    $('sync-family-pin').value = state.sync.familyPin || '';
    $('sync-server-url').value = state.sync.serverUrl || '';

    $('setting-use-gemini-live').checked = Boolean(state.settings.useGeminiLive);
    $('setting-live-model').value = state.settings.liveModel || 'gemini-2.5-flash-native-audio-preview-09-2025';
    $('setting-sync-api-key').checked = Boolean(state.settings.syncApiKey);
    $('setting-auto-hint').checked = state.settings.autoHint;
    $('setting-auto-tts').checked = state.settings.autoTTS;
    $('setting-show-kr').checked = state.settings.showKoreanHint;
    $('setting-api-key').value = state.settings.apiKey || '';

    updateServerCapabilityBadges();
  }

  function updateServerCapabilityBadges() {
    const caps = window.TFSync ? window.TFSync.getServerCaps() : { syncReady: false, hasServerGeminiKey: false };
    const syncBadge = $('sync-server-badge');
    if (syncBadge) {
      syncBadge.classList.remove('ready', 'warn');
      if (caps.syncReady || (state.sync.serverUrl && state.sync.serverUrl.trim())) {
        syncBadge.textContent = '🟢 클라우드 동기화 연결됨';
        syncBadge.classList.add('ready');
      } else {
        syncBadge.textContent = '🟠 오프라인 모드 (파일 백업 지원)';
        syncBadge.classList.add('warn');
      }
    }
    updateVoiceModeBadge();
  }

  function renderParentReport(shouldArchive = false) {
    window.TFVoice.stopAllSpeech(); // Rule 5
    latestReportObj = window.TFReport.buildReportData({
      character: getActiveChar(),
      roleplay: getActiveRoleplay(),
      background: getActiveBackground(),
      transcript: session.transcript,
      sessionCorrections: session.corrections,
      sessionPillars: session.pillars,
      stars: session.stars,
      weakExpressions: state.weakExpressions
    });
    if (shouldArchive) {
      archiveCurrentSessionToHistory(latestReportObj);
    }
    $('parent-report-content').innerHTML = window.TFReport.renderReportHTML(latestReportObj);
    $('report-history-list').innerHTML = window.TFReport.renderHistoryHTML(state.sessionHistory);
  }

  function upsertWeakExpression({ wrong, correct, category, pillar }) {
    const existing = state.weakExpressions.find((w) => w.correct.toLowerCase() === correct.toLowerCase());
    if (existing) {
      existing.mastered = false;
      existing.wrong = wrong;
      existing.source = '오늘 수업';
    } else {
      state.weakExpressions.unshift({
        id: 'w_' + Date.now(),
        wrong,
        correct,
        category: category || '반복 복습 표현',
        pillar: pillar || 'daily',
        reviewCount: 0,
        mastered: false,
        source: '오늘 수업'
      });
    }
    saveState();
    renderTopBarAndBg();
  }

  function incrementWeakMastery(correctPhrase) {
    const target = state.weakExpressions.find((w) => w.correct.toLowerCase() === correctPhrase.toLowerCase());
    if (target) {
      target.reviewCount = (target.reviewCount || 0) + 1;
      if (target.reviewCount >= 3) target.mastered = true;
      saveState();
      renderTopBarAndBg();
    }
  }

  function renderWeakVault() {
    $('weak-vault-list').innerHTML = state.weakExpressions
      .map(
        (w) => `
      <div class="weak-card">
        <div class="weak-card-top">
          <strong>${escapeHtml(w.correct)}</strong>
          <span class="mastery-pill ${w.mastered ? 'mastered' : ''}">${w.mastered ? '⭐ 정복' : `복습 ${w.reviewCount}/3회`}</span>
        </div>
        <div style="font-size:12px;color:#6C6378;">틀린 말: <span style="color:#E84A5F;text-decoration:line-through;">${escapeHtml(w.wrong)}</span> · ${escapeHtml(w.category)}</div>
        <div class="weak-card-actions">
          <button class="mini-pill-btn" data-act="practice" data-id="${w.id}">🎙️ 지금 복습</button>
          <button class="mini-pill-btn" data-act="toggle" data-id="${w.id}">${w.mastered ? '다시 복습' : '정복 완료'}</button>
          <button class="mini-pill-btn" data-act="del" data-id="${w.id}">삭제</button>
        </div>
      </div>`
      )
      .join('');

    $('weak-vault-list').querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = state.weakExpressions.find((x) => x.id === btn.dataset.id);
        if (!item) return;
        if (btn.dataset.act === 'toggle') {
          item.mastered = !item.mastered;
          if (item.mastered) item.reviewCount = Math.max(3, item.reviewCount);
          saveState();
          renderWeakVault();
          renderTopBarAndBg();
        } else if (btn.dataset.act === 'del') {
          state.weakExpressions = state.weakExpressions.filter((x) => x.id !== item.id);
          saveState();
          renderWeakVault();
          renderTopBarAndBg();
        } else if (btn.dataset.act === 'practice') {
          closeAllSheets();
          session.isLive = true;
          updateGiantActionButton();
          const cb = window.TFEngine.getProfile(getActiveChar()).reviewCallback(item.correct);
          setCharacterBubble({
            en: cb.en,
            kr: cb.kr,
            echoTarget: { ...item, isReviewCallback: true },
            choices: [item.correct],
            anim: 'wave',
            speak: true
          });
        }
      });
    });

    const items = [
      { label: '📅 시간·달력 (요일·달·날짜)', count: session.pillars.calendar, max: 3 },
      { label: '🔢 일상 회화 (숫자·파닉스·감정·날씨)', count: session.pillars.daily, max: 4 },
      { label: '💛 인성·매너 (인사·감사·부탁·차례·나누기)', count: session.pillars.manners, max: 3 }
    ];
    $('curriculum-bars').innerHTML = items
      .map((it) => `<div class="curr-bar-item"><label><span>${it.label}</span><span>${it.count}회</span></label><div class="curr-track"><div class="curr-fill" style="width:${Math.max(10, Math.min(100, Math.round((it.count / it.max) * 100)))}%"></div></div></div>`)
      .join('');
  }

  function renderPersonalityComparison() {
    const rp = getActiveRoleplay();
    const list = window.TFEngine.previewPersonalityReactions("Let's have a ramen.", rp, state.characters);
    $('personality-comparison-grid').innerHTML = list
      .map(
        (item) => `
      <div class="compare-card">
        <div class="compare-top">
          <div class="compare-mini-svg">${window.TFRig.renderPuppetSVG(item.character, { animState: 'idle' })}</div>
          <div>
            <strong>${escapeHtml(item.character.nameKr)}</strong>
            <div style="font-size:11.5px;color:#2E7AD1;font-weight:800;">${escapeHtml(item.profileName)}</div>
          </div>
        </div>
        <div class="compare-quote">${escapeHtml(item.correctionReply)}</div>
        <div style="display:flex;gap:6px;margin-top:auto;">
          <button type="button" class="mini-pill-btn cmp-hear" data-cid="${item.character.id}" data-line="${escapeHtml(item.correctionReply)}">🔊 듣기</button>
          <button type="button" class="mini-pill-btn cmp-use" data-cid="${item.character.id}">이 친구로 →</button>
        </div>
      </div>`
      )
      .join('');

    $('personality-comparison-grid').querySelectorAll('.cmp-hear').forEach((b) => {
      b.addEventListener('click', () => {
        const c = state.characters.find((x) => x.id === b.dataset.cid);
        if (c) window.TFVoice.speakEnUS(b.dataset.line, { pitch: c.pitch, rate: c.rate });
      });
    });
    $('personality-comparison-grid').querySelectorAll('.cmp-use').forEach((b) => {
      b.addEventListener('click', () => {
        selectActiveCharacter(b.dataset.cid);
        closeAllSheets();
      });
    });
  }

  function populateVoiceDropdown() {
    window.TFVoice.loadEnUsVoices((voices) => {
      const sel = $('voice-select');
      sel.innerHTML = voices.length
        ? voices.map((v) => `<option value="${escapeHtml(v.voiceURI)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`).join('')
        : `<option value="">브라우저 기본 미국식 영어 (en-US)</option>`;
      if (state.settings.voiceURI && voices.some((v) => v.voiceURI === state.settings.voiceURI)) {
        sel.value = state.settings.voiceURI;
        window.TFVoice.setVoiceURI(state.settings.voiceURI);
      } else if (voices[0]) {
        state.settings.voiceURI = voices[0].voiceURI;
        window.TFVoice.setVoiceURI(voices[0].voiceURI);
      }
    });
  }

  // ==================== SYNC & PWA BOOT ====================
  async function initSyncAndPWA() {
    if (!window.TFSync) return;

    window.TFSync.initPWA({
      onInstallAvailable: () => {
        const chip = $('pwa-status-chip');
        const btn = $('pwa-install-btn');
        if (chip) {
          chip.textContent = '1클릭 설치 가능!';
          chip.classList.add('ready');
        }
        if (btn) btn.textContent = '📲 지금 바로 앱으로 설치하기';
      },
      onInstalled: () => {
        const chip = $('pwa-status-chip');
        if (chip) {
          chip.textContent = '설치 완료 ✓';
          chip.classList.add('ready');
        }
        showToast('🎉 TalkieFriends 앱이 설치되었어요!');
      }
    });

    await window.TFSync.detectServer();
    updateServerCapabilityBadges();
    updateGiantActionButton();
  }

  // ==================== EVENT BINDINGS ====================
  function bindEvents() {
    // Close sheet buttons & backdrop click
    document.querySelectorAll('.close-circle-btn').forEach((b) => b.addEventListener('click', closeAllSheets));
    document.querySelectorAll('.sheet-backdrop').forEach((bd) => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) closeAllSheets();
      });
    });

    // Top Kid Bar
    $('open-char-tray-btn').addEventListener('click', () => {
      renderCharTray();
      openSheet('char-tray-sheet');
    });
    $('open-place-tray-btn').addEventListener('click', () => {
      renderPlaceTray();
      openSheet('place-tray-sheet');
    });
    $('open-dressup-btn').addEventListener('click', () => openDressUpSheet('mood'));
    $('open-dressup-from-tray').addEventListener('click', () => openDressUpSheet('mood'));
    $('quick-add-photo-char-btn').addEventListener('click', () => openDressUpSheet('photo'));
    $('open-prep-quick-btn').addEventListener('click', () => {
      if (session.isLive) {
        showToast('🔒 Live 대화 중에는 목소리 놀이에 집중해요! 끝내기 후 그림방을 이용할 수 있어요.');
        return;
      }
      openSheet('prep-sheet');
    });
    $('open-parent-hub-btn').addEventListener('click', () => openParentHub('report'));

    // Place Tray: Featured 1-Tap Free Talk Mode
    $('select-free-talk-btn').addEventListener('click', () => {
      const wasGeminiLive = window.TFGeminiLive && window.TFGeminiLive.isConnected();
      state.activeRoleplayId = 'free_talk';
      session.beatIndex = 0;
      saveState();
      renderTopBarAndBg();
      if (wasGeminiLive) {
        window.TFGeminiLive.disconnect();
        startGeminiLiveSession();
      } else {
        const opening = window.TFEngine.getOpeningLine(getActiveChar(), getActiveRoleplay());
        setCharacterBubble({
          en: opening.en,
          kr: opening.kr,
          choices: opening.choices,
          anim: 'wave',
          particle: '🌈',
          speak: session.isLive
        });
      }
      closeAllSheets();
      showToast('💬 자유 토킹 ON! 공룡·간식·유치원 아무 얘기나 해 봐요!');
    });

    // Tapping the character on stage makes them happily react!
    $('stage-character-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      const prof = window.TFEngine.getProfile(ch);
      renderLivePuppet(prof.celebrateAnim);
      spawnParticles(prof.particle);
      if (!(window.TFGeminiLive && window.TFGeminiLive.isConnected())) {
        window.TFVoice.speakEnUS(ch.catchphrase, {
          pitch: ch.pitch,
          rate: ch.rate,
          onEnd: () => renderLivePuppet('idle')
        });
      } else {
        setTimeout(() => renderLivePuppet('idle'), 1100);
      }
    });

    // Bottom Kid Controls
    $('giant-action-btn').addEventListener('click', handleGiantButtonClick);
    $('finish-play-btn').addEventListener('click', finishLessonAndOpenReport);
    $('toggle-type-btn').addEventListener('click', () => {
      $('live-text-form').classList.toggle('hidden');
      if (!$('live-text-form').classList.contains('hidden')) $('live-text-input').focus();
    });

    $('live-text-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = $('live-text-input').value;
      $('live-text-input').value = '';
      handleChildUtterance(val);
    });

    // Sound & Echo controls
    $('replay-tts-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      renderLivePuppet('speaking');
      window.TFVoice.speakEnUS(session.lastSpokenEn || $('bubble-english').textContent, {
        pitch: ch.pitch,
        rate: ch.rate,
        onEnd: () => renderLivePuppet('idle')
      });
    });
    $('slow-tts-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      renderLivePuppet('speaking');
      window.TFVoice.speakEnUS(session.lastSpokenEn || $('bubble-english').textContent, {
        pitch: ch.pitch,
        rate: ch.rate,
        slow: true,
        onEnd: () => renderLivePuppet('idle')
      });
    });
    $('echo-listen-btn').addEventListener('click', () => {
      if (!session.awaitingRepeat) return;
      const ch = getActiveChar();
      renderLivePuppet('speaking');
      window.TFVoice.speakEnUS(session.awaitingRepeat.correct, {
        pitch: ch.pitch,
        rate: ch.rate,
        slow: true,
        onEnd: () => renderLivePuppet('hint')
      });
    });
    $('echo-say-btn').addEventListener('click', () => {
      if (session.awaitingRepeat) handleChildUtterance(session.awaitingRepeat.correct);
    });

    // Place Tray: Custom Background Photo Upload
    $('custom-bg-upload').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const bgId = 'custom_bg_' + Date.now();
        state.customBackgrounds.push({
          id: bgId,
          nameKr: `📸 내 배경`,
          nameEn: 'My Photo Stage',
          img: reader.result,
          floorHint: '내가 올린 배경 사진'
        });
        state.activeBgId = bgId;
        saveState();
        renderTopBarAndBg();
        closeAllSheets();
        showToast('🖼️ 내 사진 배경이 무대에 적용되었어요!');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // Dress-Up Sheet Tabs & Motions
    document.querySelectorAll('.dtab').forEach((b) => b.addEventListener('click', () => switchDressUpTab(b.dataset.dtab)));
    document.querySelectorAll('.pcat').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.pcat').forEach((x) => x.classList.toggle('active', x === b));
        session.activePartCategory = b.dataset.pcat;
        renderVisualPartsGrid();
      });
    });
    document.querySelectorAll('.motion-test-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.motion-test-btn').forEach((x) => x.classList.toggle('active', x === b));
        session.studioAnim = b.dataset.motion;
        renderStudioPuppet();
      });
    });

    $('quick-name-kr').addEventListener('input', (e) => {
      getActiveChar().nameKr = e.target.value.trim() || '친구';
      saveState();
      renderTopBarAndBg();
    });
    $('quick-name-en').addEventListener('input', (e) => {
      getActiveChar().nameEn = e.target.value.trim() || 'Buddy';
      saveState();
      renderTopBarAndBg();
    });
    $('test-voice-quick-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      const prof = window.TFEngine.getProfile(ch);
      session.studioAnim = 'speaking';
      renderStudioPuppet();
      window.TFVoice.speakEnUS(prof.greetPrefix(ch), {
        pitch: ch.pitch,
        rate: ch.rate,
        onEnd: () => {
          session.studioAnim = 'idle';
          renderStudioPuppet();
        }
      });
    });
    $('done-dressup-btn').addEventListener('click', () => {
      closeAllSheets();
      renderLivePuppet('celebrate');
      spawnParticles(window.TFEngine.getProfile(getActiveChar()).particle);
      setTimeout(() => renderLivePuppet('idle'), 1400);
    });

    // BYOC Photo Upload (New Character OR Overwrite Active)
    $('byoc-split-ratio').addEventListener('input', (e) => ($('split-ratio-val').textContent = `${e.target.value}%`));

    async function applySinglePhotoRig(file, createNew) {
      try {
        const splitRatio = parseInt($('byoc-split-ratio').value, 10) / 100;
        const removeWhiteBg = $('byoc-remove-white').checked;
        const { headUrl, bodyUrl } = await window.TFRig.autoSplitSinglePhoto(file, { splitRatio, removeWhiteBg });
        let ch = getActiveChar();
        if (createNew) {
          const id = 'custom_' + Date.now();
          ch = {
            id,
            nameKr: '내 친구',
            nameEn: 'My Friend',
            archetype: '내가 사진으로 만든 친구',
            personality: 'playful_bouncy',
            favRoleplay: state.activeRoleplayId,
            geminiVoice: 'Puck',
            pitch: 1.15,
            rate: 0.88,
            catchphrase: "Hooray! Let's play!",
            isBuiltIn: false,
            rig: {
              headPreset: 'bluey', bodyPreset: 'bluey', leftHandPreset: 'bluey', rightHandPreset: 'bluey', tailPreset: 'bluey',
              accessory: 'none',
              customParts: { head: headUrl, headTalk: headUrl, body: bodyUrl, leftHand: null, rightHand: null, backProp: null },
              partAdjust: { head: { scale: 1 }, body: { scale: 1 }, leftHand: { scale: 1 }, rightHand: { scale: 1 }, backProp: { scale: 1 } }
            }
          };
          state.characters.push(ch);
          state.activeCharId = id;
        } else {
          ch.rig.customParts.head = headUrl;
          ch.rig.customParts.headTalk = headUrl;
          ch.rig.customParts.body = bodyUrl;
        }
        saveState();
        renderTopBarAndBg();
        renderLivePuppet('celebrate');
        renderDressUpAll();
        showToast('✨ 내 캐릭터 사진이 애니메이션 친구로 완성되었어요!');
      } catch (_) {
        showToast('사진을 불러오지 못했어요.');
      }
    }

    $('byoc-new-single-upload').addEventListener('change', (e) => {
      if (e.target.files?.[0]) applySinglePhotoRig(e.target.files[0], true);
      e.target.value = '';
    });
    $('byoc-single-upload').addEventListener('change', (e) => {
      if (e.target.files?.[0]) applySinglePhotoRig(e.target.files[0], false);
      e.target.value = '';
    });

    // Advanced Per-Part Upload & Exploded Rig View
    $('toggle-exploded-btn').addEventListener('click', () => {
      session.studioExploded = !session.studioExploded;
      $('toggle-exploded-btn').textContent = `🦴 파츠 분리 전개도 (${session.studioExploded ? 'ON' : 'OFF'})`;
      renderStudioPuppet();
    });
    $('clear-all-custom-parts-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      ch.rig.customParts = { head: null, headTalk: null, body: null, leftHand: null, rightHand: null, backProp: null };
      saveState();
      renderStudioPuppet();
      renderLivePuppet('idle');
      renderTopBarAndBg();
      showToast('✨ 기본 파츠로 복원했어요.');
    });
    $('delete-char-btn').addEventListener('click', () => {
      const ch = getActiveChar();
      if (ch.isBuiltIn) return;
      state.characters = state.characters.filter((c) => c.id !== ch.id);
      state.activeCharId = state.characters[0].id;
      saveState();
      renderTopBarAndBg();
      renderLivePuppet('idle');
      renderDressUpAll();
      showToast('🗑️ 커스텀 친구를 삭제했어요.');
    });
    document.querySelectorAll('.part-file-input').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const { dataUrl } = await window.TFRig.processImageFile(file, { removeWhiteBg: $('byoc-remove-white').checked });
        getActiveChar().rig.customParts[inp.dataset.part] = dataUrl;
        saveState();
        renderStudioPuppet();
        renderLivePuppet('idle');
        renderTopBarAndBg();
        showToast('🦴 파츠가 관절에 장착되었어요!');
        e.target.value = '';
      });
    });

    // Prep Sheet
    $('prep-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('prep-chat-input').value;
      $('prep-chat-input').value = '';
      handlePrepInput(v);
    });
    document.querySelectorAll('.prep-quick-btn').forEach((b) => b.addEventListener('click', () => handlePrepInput(b.dataset.prep)));

    // Parent Hub Tabs & Report Controls
    document.querySelectorAll('.ptab').forEach((b) => b.addEventListener('click', () => switchParentTab(b.dataset.ptab)));
    $('refresh-report-btn').addEventListener('click', () => {
      renderParentReport(false);
      showToast('🔄 최신 대화로 리포트를 갱신했어요!');
    });
    $('copy-report-btn').addEventListener('click', async () => {
      if (!latestReportObj) renderParentReport(false);
      try {
        await navigator.clipboard.writeText(window.TFReport.formatPlainText(latestReportObj));
        showToast('📋 리포트를 복사했어요!');
      } catch (_) {}
    });

    // Parent Tab 2: PWA Install + Family Cloud Sync + Offline Backup
    $('pwa-install-btn').addEventListener('click', async () => {
      if (!window.TFSync) return;
      const res = await window.TFSync.triggerPWAInstall();
      if (res.status === 'accepted') {
        showToast('🎉 앱 설치를 시작합니다!');
      } else if (res.status === 'already_installed') {
        showToast('✅ 이미 앱 모드로 실행 중이에요!');
      } else if (res.status === 'ios_guide') {
        showToast('📱 Safari 하단 공유(⬆️) 버튼 → "홈 화면에 추가"를 눌러 설치하세요!');
      } else {
        showToast('💻 브라우저 주소창 오른쪽 설치 아이콘(⊕) 또는 메뉴 → "앱 설치"를 눌러 주세요!');
      }
    });

    $('generate-family-code-btn').addEventListener('click', () => {
      const prefixes = ['BLUEY', 'BINGO', 'RUSTY', 'COCO', 'MILO'];
      const p = prefixes[Math.floor(Math.random() * prefixes.length)];
      const num = Math.floor(1000 + Math.random() * 9000);
      $('sync-family-code').value = `${p}-${num}`;
      showToast('🎲 새 가족 코드를 만들었어요! "지금 클라우드에 저장"을 눌러 주세요.');
    });

    function readSyncInputsToState() {
      state.sync.familyCode = $('sync-family-code').value.trim().toUpperCase();
      state.sync.familyPin = $('sync-family-pin').value.trim();
      state.sync.serverUrl = $('sync-server-url').value.trim();
      $('sync-family-code').value = state.sync.familyCode;
    }

    $('sync-push-btn').addEventListener('click', async () => {
      readSyncInputsToState();
      try {
        $('sync-status-text').textContent = '☁️ 클라우드에 저장하는 중...';
        const res = await window.TFSync.pushFamilyProfile({
          familyCode: state.sync.familyCode,
          familyPin: state.sync.familyPin,
          serverUrl: state.sync.serverUrl,
          stateData: state
        });
        saveState(true);
        const ts = new Date(res.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        $('sync-status-text').textContent = `✅ [${state.sync.familyCode}] 클라우드 저장 완료 (${ts}) — 다른 컴퓨터에서 같은 코드로 불러오세요!`;
        showToast(`☁️ [${state.sync.familyCode}] 저장 완료!`);
      } catch (err) {
        $('sync-status-text').textContent = `⚠️ ${err.message}`;
        showToast(`⚠️ ${err.message}`);
      }
    });

    $('sync-pull-btn').addEventListener('click', async () => {
      readSyncInputsToState();
      try {
        $('sync-status-text').textContent = '⬇️ 다른 기기 데이터를 불러오는 중...';
        const res = await window.TFSync.pullFamilyProfile({
          familyCode: state.sync.familyCode,
          familyPin: state.sync.familyPin,
          serverUrl: state.sync.serverUrl
        });
        if (!res.exists) {
          $('sync-status-text').textContent = `ℹ️ [${state.sync.familyCode}] 저장된 데이터가 아직 없어요. 먼저 "지금 클라우드에 저장"을 눌러 주세요.`;
          showToast('ℹ️ 아직 저장된 가족 코드가 없어요.');
          return;
        }
        const keepLocalApiKey = state.settings.apiKey;
        const pulled = res.data;
        state = {
          ...state,
          ...pulled,
          characters: patchDefaultCharacterFields(pulled.characters || window.TFData.DEFAULT_CHARACTERS),
          sessionHistory: Array.isArray(pulled.sessionHistory) ? pulled.sessionHistory : [],
          sync: { ...state.sync },
          settings: {
            ...state.settings,
            ...(pulled.settings || {}),
            apiKey: (pulled.settings && pulled.settings.apiKey) ? pulled.settings.apiKey : keepLocalApiKey
          }
        };
        saveState(true);
        renderTopBarAndBg();
        renderLivePuppet('celebrate');
        renderWeakVault();
        renderParentReport(false);
        populateSyncAndSettingsUI();
        $('sync-status-text').textContent = `✅ [${state.sync.familyCode}] 데이터를 성공적으로 불러왔어요!`;
        showToast(`☁️ [${state.sync.familyCode}] 우리 가족 데이터를 불러왔어요!`);
      } catch (err) {
        $('sync-status-text').textContent = `⚠️ ${err.message}`;
        showToast(`⚠️ ${err.message}`);
      }
    });

    $('export-backup-btn').addEventListener('click', () => {
      readSyncInputsToState();
      window.TFSync.exportBackupFile(state, state.sync.familyCode);
      showToast('📤 가족 데이터 백업 파일(.tfbackup.json)을 저장했어요!');
    });

    $('import-backup-input').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = await window.TFSync.importBackupFile(file);
        const imported = parsed.data;
        state = {
          ...state,
          ...imported,
          characters: patchDefaultCharacterFields(imported.characters),
          sessionHistory: Array.isArray(imported.sessionHistory) ? imported.sessionHistory : [],
          sync: { ...state.sync, ...(imported.sync || {}) },
          settings: { ...state.settings, ...(imported.settings || {}) }
        };
        saveState(true);
        renderTopBarAndBg();
        renderLivePuppet('celebrate');
        renderWeakVault();
        renderParentReport(false);
        populateSyncAndSettingsUI();
        showToast('📥 백업 파일에서 우리 가족 데이터를 모두 복원했어요!');
      } catch (err) {
        showToast(`⚠️ ${err.message}`);
      }
      e.target.value = '';
    });

    // Weak Expression Form
    $('add-weak-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const wrong = $('new-weak-wrong').value.trim();
      const right = $('new-weak-right').value.trim();
      if (!wrong || !right) return;
      upsertWeakExpression({ wrong, correct: right, category: '부모님 등록', pillar: 'daily' });
      $('new-weak-wrong').value = '';
      $('new-weak-right').value = '';
      renderWeakVault();
      showToast('🔁 복습장에 추가했어요!');
    });

    // Parent Rule Test Buttons -> close Parent Hub and demonstrate right on stage!
    document.querySelectorAll('.sim-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = btn.dataset.sim;
        closeAllSheets();
        if (s === 'freetalk') {
          state.activeRoleplayId = 'free_talk';
          renderTopBarAndBg();
          handleChildUtterance('I love dinosaurs!');
        } else if (s === 'error') handleChildUtterance("Let's have a ramen.");
        else if (s === 'korean') handleChildUtterance('사과 주세요!');
        else if (s === 'accent') handleChildUtterance('I want banna please');
        else if (s === 'pause') handleChildUtterance('Um... I want...');
        else if (s === 'silence') triggerProactiveSilenceHint();
        else if (s === 'draw_blocked') handleChildUtterance('그림 그려줘');
      });
    });

    $('save-settings-btn').addEventListener('click', () => {
      state.settings.useGeminiLive = $('setting-use-gemini-live').checked;
      state.settings.liveModel = $('setting-live-model').value;
      state.settings.syncApiKey = $('setting-sync-api-key').checked;
      state.settings.voiceURI = $('voice-select').value;
      state.settings.autoHint = $('setting-auto-hint').checked;
      state.settings.autoTTS = $('setting-auto-tts').checked;
      state.settings.showKoreanHint = $('setting-show-kr').checked;
      state.settings.apiKey = $('setting-api-key').value.trim();
      window.TFVoice.setVoiceURI(state.settings.voiceURI);
      saveState();
      updateVoiceModeBadge();
      updateGiantActionButton();
      $('bubble-korean-hint').classList.toggle('hidden', !state.settings.showKoreanHint);
      closeAllSheets();
      showToast(canUseGeminiLive() ? '⚡ Gemini Live 실시간 음성 설정을 저장했어요!' : '⚙️ 설정을 저장했어요!');
    });

    $('reset-demo-btn').addEventListener('click', () => {
      if (window.TFGeminiLive) window.TFGeminiLive.disconnect();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      loadState();
      renderTopBarAndBg();
      renderLivePuppet('idle');
      closeAllSheets();
      showToast('🔄 초기 상태로 복원했어요!');
    });
  }

  function init() {
    loadState();
    populateVoiceDropdown();
    renderTopBarAndBg();
    renderMissionDots();
    initPrepChat();

    const opening = window.TFEngine.getOpeningLine(getActiveChar(), getActiveRoleplay());
    setCharacterBubble({
      en: opening.en,
      kr: opening.kr,
      choices: opening.choices,
      anim: 'idle',
      speak: false
    });

    bindEvents();
    initSyncAndPWA();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
