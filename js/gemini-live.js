/* ==========================================================================
   TalkieFriends v5.4 — Real-Time Gemini Multimodal Live API Engine (WebSocket)
   - Persistent gesture-unlocked AudioContext + GainNode (1.35x) for iOS/Safari/Chrome
   - Safe even-byte PCM16 decoder & dynamic sample-rate parser (never crashes on odd frames)
   - Client-side RMS VAD with 425ms pre-speech ring buffer + activityStart/activityEnd
   - Speaker-echo-proof barge-in guard (900ms grace + 3 sustained loud frames)
   - 1-click Live Connection & Audible Speaker Test (plays real received voice!)
   ========================================================================== */

window.TFGeminiLive = (function () {
  const WS_BASE =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  let ws = null;
  let micStream = null;
  let captureCtx = null;
  let processorNode = null;

  // Persistent shared playback graph unlocked synchronously on user gesture
  let playbackCtx = null;
  let gainNode = null;
  let analyserNode = null;
  let nextPlayTime = 0;
  let activeSources = [];

  let lipSyncRaf = null;
  let silenceTickInterval = null;
  let connected = false;
  let isModelSpeaking = false;
  let modelSpeechStartedAt = 0;
  let micRms = 0;
  let currentCallbacks = {};
  let pendingInputTranscript = '';
  let pendingOutputTranscript = '';

  // Client-side VAD state (works reliably on Gemini 3.8 Live + saves Free Tier tokens!)
  let isUserSpeaking = false;
  let lastSpeechAt = 0;
  let bargeInStreak = 0;
  let preSpeechRing = [];
  const PRE_SPEECH_CHUNKS = 5; // ~425ms lead-in buffer so child's 1st syllable is never clipped
  const SPEECH_START_IDLE = 0.020;
  const SPEECH_START_BARGE_IN = 0.11; // high echo-proof threshold during AI speech
  const BARGE_IN_GRACE_MS = 900; // never self-interrupt during first 900ms of AI voice
  const BARGE_IN_FRAMES = 3; // ~250ms sustained loud speech required to interrupt AI
  const SPEECH_CONTINUE = 0.014;
  const CHILD_END_SILENCE_MS = 1350;

  function ensurePlaybackGraph() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!playbackCtx || playbackCtx.state === 'closed') {
      try {
        playbackCtx = new AudioCtx({ sampleRate: 24000 });
      } catch (_) {
        playbackCtx = new AudioCtx();
      }
      gainNode = playbackCtx.createGain();
      gainNode.gain.value = 1.35; // warm, loud & clear on tablet/laptop speakers
      analyserNode = playbackCtx.createAnalyser();
      analyserNode.fftSize = 256;
      gainNode.connect(analyserNode);
      analyserNode.connect(playbackCtx.destination);
      nextPlayTime = playbackCtx.currentTime;
    }
    if (playbackCtx.state === 'suspended') {
      playbackCtx.resume().catch(() => {});
    }
    return playbackCtx;
  }

  /**
   * Call synchronously inside any click/tap handler so Safari/iOS/Chrome permanently unlock audio!
   */
  function unlockAudio() {
    const ctx = ensurePlaybackGraph();
    if (!ctx) return 'unsupported';
    try {
      ctx.resume().catch(() => {});
      const silentBuf = ctx.createBuffer(1, 1, 24000);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
    return ctx.state;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToInt16(base64) {
    const bin = atob(base64);
    const evenLen = bin.length & ~1; // Guarantee even byte count so Int16Array never throws RangeError!
    const bytes = new Uint8Array(evenLen);
    for (let i = 0; i < evenLen; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function parseSampleRate(mimeType) {
    const m = String(mimeType || '').match(/rate=(\d+)/i);
    return m ? Math.max(8000, Math.min(48000, parseInt(m[1], 10))) : 24000;
  }

  function downsampleTo16kPCM(float32Data, inputSampleRate) {
    const targetRate = 16000;
    if (inputSampleRate === targetRate) {
      const pcm = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Data[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm;
    }
    const ratio = inputSampleRate / targetRate;
    const outLength = Math.floor(float32Data.length / ratio);
    const pcm = new Int16Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(float32Data.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j++) sum += float32Data[j];
      const avg = end > start ? sum / (end - start) : float32Data[start];
      const s = Math.max(-1, Math.min(1, avg));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  }

  function sendJson(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function clearPlaybackQueue() {
    activeSources.forEach((src) => {
      try { src.stop(); } catch (_) {}
    });
    activeSources = [];
    if (playbackCtx) {
      nextPlayTime = playbackCtx.currentTime;
    }
    isModelSpeaking = false;
    bargeInStreak = 0;
    if (currentCallbacks.onSpeakingState) currentCallbacks.onSpeakingState(false, 0);
  }

  function schedulePcmPlayback(base64Pcm, sampleRate = 24000) {
    const ctx = ensurePlaybackGraph();
    if (!ctx) return;

    const int16 = base64ToInt16(base64Pcm);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuf = ctx.createBuffer(1, float32.length, sampleRate);
    audioBuf.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(gainNode);

    const now = ctx.currentTime;
    if (nextPlayTime < now + 0.025) nextPlayTime = now + 0.025;
    src.start(nextPlayTime);
    nextPlayTime += audioBuf.duration;

    if (!isModelSpeaking) {
      modelSpeechStartedAt = Date.now();
    }
    isModelSpeaking = true;
    activeSources.push(src);
    src.onended = () => {
      activeSources = activeSources.filter((s) => s !== src);
      if (activeSources.length === 0) {
        isModelSpeaking = false;
        bargeInStreak = 0;
        if (currentCallbacks.onSpeakingState) currentCallbacks.onSpeakingState(false, 0);
        if (connected && currentCallbacks.autoHint) {
          startProactiveSilenceWatch();
        }
      }
    };
  }

  function startLipSyncLoop() {
    if (lipSyncRaf) cancelAnimationFrame(lipSyncRaf);
    const dataArray = new Uint8Array(analyserNode ? analyserNode.fftSize : 256);

    const tick = () => {
      if (!connected) return;
      if (analyserNode && isModelSpeaking) {
        analyserNode.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        if (currentCallbacks.onSpeakingState) currentCallbacks.onSpeakingState(true, rms);
      }
      lipSyncRaf = requestAnimationFrame(tick);
    };
    lipSyncRaf = requestAnimationFrame(tick);
  }

  function stopSilenceWatch() {
    if (silenceTickInterval) { clearInterval(silenceTickInterval); silenceTickInterval = null; }
    if (currentCallbacks.onSilenceTick) currentCallbacks.onSilenceTick(0, 0, false);
  }

  function startProactiveSilenceWatch() {
    stopSilenceWatch();
    const limitMs = 4500;
    const start = Date.now();
    silenceTickInterval = setInterval(() => {
      if (!connected || isModelSpeaking || isUserSpeaking) {
        stopSilenceWatch();
        return;
      }
      const elapsed = Date.now() - start;
      const ratio = Math.min(1, elapsed / limitMs);
      const rem = Math.max(0, (limitMs - elapsed) / 1000);
      if (currentCallbacks.onSilenceTick) currentCallbacks.onSilenceTick(ratio, rem, true);
      if (elapsed >= limitMs) {
        stopSilenceWatch();
        sendSilenceHintNudge();
      }
    }, 100);
  }

  function sendSilenceHintNudge() {
    if (!connected) return;
    if (currentCallbacks.onSilenceNudge) currentCallbacks.onSilenceNudge();
    sendJson({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            text: '[SYSTEM_HINT: The 6-year-old child has been quietly thinking for 4.5 seconds. Gently jump in right now in your character personality with an easy either-or question or a short repeat-after-me phrase so they feel safe and excited to answer!]'
          }]
        }],
        turnComplete: true
      }
    });
  }

  function sendAudioChunk(b64Pcm) {
    sendJson({
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: b64Pcm
        }
      }
    });
  }

  async function startMicCapture() {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    captureCtx = new AudioCtx();
    if (captureCtx.state === 'suspended') {
      await captureCtx.resume().catch(() => {});
    }
    const source = captureCtx.createMediaStreamSource(micStream);
    processorNode = captureCtx.createScriptProcessor(4096, 1, 1);

    isUserSpeaking = false;
    lastSpeechAt = 0;
    bargeInStreak = 0;
    preSpeechRing = [];

    processorNode.onaudioprocess = (event) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !connected) return;
      const input = event.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      micRms = Math.sqrt(sum / input.length);
      if (currentCallbacks.onMicLevel) currentCallbacks.onMicLevel(micRms);

      const pcm16 = downsampleTo16kPCM(input, captureCtx.sampleRate);
      const b64 = arrayBufferToBase64(pcm16.buffer);
      const now = Date.now();

      if (!isUserSpeaking) {
        preSpeechRing.push(b64);
        if (preSpeechRing.length > PRE_SPEECH_CHUNKS) preSpeechRing.shift();

        // Echo-proof speech start detection: never self-interrupt AI from speaker output!
        let triggered = false;
        if (isModelSpeaking) {
          if (now - modelSpeechStartedAt > BARGE_IN_GRACE_MS && micRms >= SPEECH_START_BARGE_IN) {
            bargeInStreak += 1;
            if (bargeInStreak >= BARGE_IN_FRAMES) triggered = true;
          } else {
            bargeInStreak = 0;
          }
        } else if (micRms >= SPEECH_START_IDLE) {
          triggered = true;
        }

        if (triggered) {
          isUserSpeaking = true;
          bargeInStreak = 0;
          lastSpeechAt = now;
          stopSilenceWatch();
          if (isModelSpeaking) clearPlaybackQueue();

          sendJson({ realtimeInput: { activityStart: {} } });
          for (const bufferedChunk of preSpeechRing) {
            sendAudioChunk(bufferedChunk);
          }
          preSpeechRing = [];
          if (currentCallbacks.onUserVoiceState) currentCallbacks.onUserVoiceState('speaking');
        }
      } else {
        sendAudioChunk(b64);
        if (micRms >= SPEECH_CONTINUE) {
          lastSpeechAt = now;
        } else if (now - lastSpeechAt >= CHILD_END_SILENCE_MS) {
          isUserSpeaking = false;
          sendJson({ realtimeInput: { activityEnd: {} } });
          if (currentCallbacks.onUserVoiceState) currentCallbacks.onUserVoiceState('processing');
        }
      }
    };

    source.connect(processorNode);
    const zeroGain = captureCtx.createGain();
    zeroGain.gain.value = 0;
    processorNode.connect(zeroGain);
    zeroGain.connect(captureCtx.destination);
  }

  async function discoverLiveModels(apiKey) {
    if (!apiKey) return { ok: false, error: 'API 키를 입력해 주세요.', liveModels: [] };
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data?.error?.message || `HTTP ${res.status}`, liveModels: [] };
      }
      const models = (data.models || [])
        .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('bidiGenerateContent'))
        .map((m) => (m.name || '').replace(/^models\//, ''));
      return { ok: true, liveModels: models };
    } catch (err) {
      return { ok: false, error: err.message || '네트워크 오류', liveModels: [] };
    }
  }

  /**
   * 1-Click End-to-End Live Connection & Audible Speaker Diagnostic Test!
   * Actually PLAYS the received Gemini Live voice right through your speaker so you hear it!
   */
  async function testConnection({ apiKey, preferredModel = 'gemini-3.8-live', playAudio = true }) {
    unlockAudio();
    const key = (apiKey || '').trim();
    if (!key) return { ok: false, step: 'key', message: 'Gemini API 키를 먼저 입력해 주세요.' };

    const disc = await discoverLiveModels(key);
    if (!disc.ok) {
      return { ok: false, step: 'key', message: `API 키 확인 실패: ${disc.error}` };
    }

    const candidates = [];
    const addUnique = (m) => { if (m && !candidates.includes(m)) candidates.push(m); };
    if (disc.liveModels.includes(preferredModel)) addUnique(preferredModel);
    if (disc.liveModels.includes('gemini-3.8-live')) addUnique('gemini-3.8-live');
    disc.liveModels.forEach((m) => { if (/live|native-audio/i.test(m)) addUnique(m); });
    addUnique(preferredModel);
    addUnique('gemini-2.5-flash-native-audio-preview-12-2025');

    let lastFailReason = '';
    for (const modelId of candidates.slice(0, 3)) {
      const probe = await probeLiveModel(key, modelId, playAudio);
      if (probe.ok) {
        const ctxState = playbackCtx ? playbackCtx.state : 'unknown';
        return {
          ok: true,
          workingModel: modelId,
          availableLiveModels: disc.liveModels,
          audioBytes: probe.audioBytes,
          transcript: probe.transcript,
          audioContextState: ctxState,
          message: `✅ 실시간 음성 연결 & 재생 성공! (모델: ${modelId}, 오디오 ${Math.round(probe.audioBytes / 1024)}KB, 스피커: ${ctxState})`
        };
      }
      lastFailReason = `${modelId}: ${probe.reason}`;
    }

    return {
      ok: false,
      step: 'websocket',
      availableLiveModels: disc.liveModels,
      message: `WebSocket 연결 실패 (${lastFailReason})`
    };
  }

  function probeLiveModel(apiKey, modelId, playAudio) {
    return new Promise((resolve) => {
      let settled = false;
      let audioBytes = 0;
      let transcript = '';
      let gotSetup = false;
      let testWs = null;

      const finish = (res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (testWs) { try { testWs.close(); } catch (_) {} }
        resolve(res);
      };

      const timer = setTimeout(() => {
        finish({ ok: audioBytes > 0, audioBytes, transcript: transcript.trim(), reason: gotSetup ? '응답 시간 초과 (10초)' : 'setupComplete 시간 초과' });
      }, 10000);

      try {
        testWs = new WebSocket(`${WS_BASE}?key=${encodeURIComponent(apiKey)}`);
      } catch (err) {
        finish({ ok: false, reason: err.message });
        return;
      }

      testWs.onopen = () => {
        testWs.send(JSON.stringify({
          setup: {
            model: `models/${modelId}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
            },
            outputAudioTranscription: {},
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } }
          }
        }));
      };

      testWs.onmessage = async (event) => {
        let raw = event.data;
        if (raw instanceof Blob) raw = await raw.text();
        let msg;
        try { msg = JSON.parse(raw); } catch (_) { return; }

        if (msg.setupComplete) {
          gotSetup = true;
          testWs.send(JSON.stringify({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: 'Say "Hi friend! Let us play!" warmly in 4 words.' }] }],
              turnComplete: true
            }
          }));
          return;
        }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.modelTurn?.parts) {
          for (const p of sc.modelTurn.parts) {
            if (p.inlineData?.data && (!p.inlineData.mimeType || /audio/i.test(p.inlineData.mimeType))) {
              audioBytes += Math.floor((p.inlineData.data.length * 3) / 4);
              if (playAudio) {
                schedulePcmPlayback(p.inlineData.data, parseSampleRate(p.inlineData.mimeType));
              }
            }
          }
        }
        if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;
        if (sc.turnComplete) {
          finish({ ok: audioBytes > 0, audioBytes, transcript: transcript.trim(), reason: audioBytes > 0 ? '' : '오디오 데이터 없음' });
        }
      };

      testWs.onerror = () => finish({ ok: false, reason: 'WebSocket 오류' });
      testWs.onclose = (ev) => {
        finish({ ok: audioBytes > 0, audioBytes, transcript: transcript.trim(), reason: `code=${ev.code}${ev.reason ? ' ' + ev.reason : ''}` });
      };
    });
  }

  async function connect({
    apiKey,
    useServerToken = false,
    model = 'gemini-3.8-live',
    voiceName = 'Puck',
    systemInstruction = '',
    openingPrompt = '',
    autoHint = true,
    onConnected,
    onDisconnected,
    onError,
    onUserTranscript,
    onModelTranscript,
    onTurnComplete,
    onSpeakingState,
    onMicLevel,
    onUserVoiceState,
    onSilenceTick,
    onSilenceNudge
  }) {
    disconnect();
    ensurePlaybackGraph();

    currentCallbacks = {
      autoHint,
      onConnected,
      onDisconnected,
      onError,
      onUserTranscript,
      onModelTranscript,
      onTurnComplete,
      onSpeakingState,
      onMicLevel,
      onUserVoiceState,
      onSilenceTick,
      onSilenceNudge
    };

    const setupObj = {
      model: model.startsWith('models/') ? model : `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: true
        }
      }
    };

    let wsUrl = '';
    if (useServerToken) {
      try {
        const res = await fetch('/api/gemini-live-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setup: setupObj })
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          throw new Error(data.error || '서버 임시 토큰 발급 실패');
        }
        wsUrl = `${WS_BASE}?access_token=${encodeURIComponent(data.token)}`;
      } catch (err) {
        if (onError) onError(`Gemini Live 토큰 오류: ${err.message}`);
        return false;
      }
    } else if (apiKey) {
      wsUrl = `${WS_BASE}?key=${encodeURIComponent(apiKey)}`;
    } else {
      if (onError) onError('Gemini API Key 또는 서버 토큰이 필요합니다.');
      return false;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };

      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        if (onError) onError(`WebSocket 연결 실패: ${err.message}`);
        done(false);
        return;
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: setupObj }));
      };

      ws.onmessage = async (event) => {
        let rawText = event.data;
        if (rawText instanceof Blob) {
          rawText = await rawText.text();
        }
        let msg;
        try {
          msg = JSON.parse(rawText);
        } catch (_) {
          return;
        }

        if (msg.setupComplete) {
          connected = true;
          startLipSyncLoop();
          try {
            await startMicCapture();
          } catch (_) {
            if (onError) onError('마이크 권한을 허용해 주세요! (텍스트·선택 버튼은 계속 가능해요)');
          }
          if (onConnected) onConnected();
          if (openingPrompt) {
            sendText(openingPrompt);
          }
          done(true);
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;

        if (sc.interrupted) {
          clearPlaybackQueue();
          stopSilenceWatch();
        }

        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data && (!part.inlineData.mimeType || /audio/i.test(part.inlineData.mimeType))) {
              schedulePcmPlayback(part.inlineData.data, parseSampleRate(part.inlineData.mimeType));
            }
          }
        }

        if (sc.inputTranscription?.text) {
          pendingInputTranscript += sc.inputTranscription.text;
          if (onUserTranscript) onUserTranscript(pendingInputTranscript.trim(), false);
        }
        if (sc.outputTranscription?.text) {
          pendingOutputTranscript += sc.outputTranscription.text;
          if (onModelTranscript) onModelTranscript(pendingOutputTranscript.trim(), false);
        }

        if (sc.turnComplete) {
          const finalUser = pendingInputTranscript.trim();
          const finalModel = pendingOutputTranscript.trim();
          pendingInputTranscript = '';
          pendingOutputTranscript = '';
          if (finalUser && onUserTranscript) onUserTranscript(finalUser, true);
          if (finalModel && onModelTranscript) onModelTranscript(finalModel, true);
          if (onTurnComplete) onTurnComplete({ userText: finalUser, modelText: finalModel });
          if (!isModelSpeaking && currentCallbacks.autoHint) {
            startProactiveSilenceWatch();
          }
        }
      };

      ws.onerror = () => {
        if (!connected && onError) {
          onError('Gemini Live WebSocket 연결 오류가 발생했습니다.');
        }
      };

      ws.onclose = (ev) => {
        const wasConnected = connected;
        cleanupAudioAndTimers();
        connected = false;
        if (!wasConnected && onError) {
          onError(`Gemini Live 연결 종료 (code=${ev.code}${ev.reason ? ': ' + ev.reason : ''})`);
        }
        if (onDisconnected) onDisconnected(ev.code, ev.reason || '');
        done(false);
      };
    });
  }

  function sendText(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return false;
    stopSilenceWatch();
    if (isUserSpeaking) {
      isUserSpeaking = false;
      sendJson({ realtimeInput: { activityEnd: {} } });
    }
    return sendJson({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      }
    });
  }

  function cleanupAudioAndTimers() {
    stopSilenceWatch();
    isUserSpeaking = false;
    bargeInStreak = 0;
    preSpeechRing = [];
    if (lipSyncRaf) { cancelAnimationFrame(lipSyncRaf); lipSyncRaf = null; }
    clearPlaybackQueue();
    if (processorNode) { try { processorNode.disconnect(); } catch (_) {} processorNode = null; }
    if (captureCtx) { try { captureCtx.close(); } catch (_) {} captureCtx = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    // Keep persistent playbackCtx unlocked across retries & future turns!
    pendingInputTranscript = '';
    pendingOutputTranscript = '';
  }

  function disconnect() {
    connected = false;
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    cleanupAudioAndTimers();
  }

  return {
    unlockAudio,
    connect,
    disconnect,
    sendText,
    discoverLiveModels,
    testConnection,
    isConnected: () => connected,
    isSpeaking: () => isModelSpeaking
  };
})();
