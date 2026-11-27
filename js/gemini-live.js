/* ==========================================================================
   TalkieFriends v5.3 — Real-Time Gemini Multimodal Live API Engine (WebSocket)
   - Hands-free bidirectional audio: 16kHz PCM mic -> Gemini Live -> 24kHz PCM voice
   - Client-side RMS VAD with 425ms pre-speech ring buffer + activityStart/activityEnd
     (fixes Gemini 3.8 Live silent-audio server-VAD issue AND saves 80%+ Free Tier quota!)
   - Echo-safe child barge-in + 1.35s child-friendly pause tolerance
   - Real-time AnalyserNode RMS audio-driven lip-sync for Bluey & Friends
   - Built-in 1-click Live Connection & Model Discovery Tester (testConnection)
   ========================================================================== */

window.TFGeminiLive = (function () {
  const WS_BASE =
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  let ws = null;
  let micStream = null;
  let captureCtx = null;
  let processorNode = null;
  let playbackCtx = null;
  let analyserNode = null;
  let nextPlayTime = 0;
  let activeSources = [];
  let lipSyncRaf = null;
  let silenceTickInterval = null;
  let connected = false;
  let isModelSpeaking = false;
  let micRms = 0;
  let currentCallbacks = {};
  let pendingInputTranscript = '';
  let pendingOutputTranscript = '';

  // Client-side VAD state (works reliably on Gemini 3.8 Live + saves Free Tier tokens!)
  let isUserSpeaking = false;
  let lastSpeechAt = 0;
  let preSpeechRing = [];
  const PRE_SPEECH_CHUNKS = 5; // ~425ms lead-in buffer so child's 1st syllable is never clipped
  const SPEECH_START_IDLE = 0.020;
  const SPEECH_START_BARGE_IN = 0.052; // higher threshold during AI playback to ignore speaker echo
  const SPEECH_CONTINUE = 0.014;
  const CHILD_END_SILENCE_MS = 1350; // generous 1.35s pause tolerance for 6~7yo kids

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
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
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
    if (currentCallbacks.onSpeakingState) currentCallbacks.onSpeakingState(false, 0);
  }

  function schedulePcm24kPlayback(base64Pcm) {
    if (!playbackCtx) return;
    if (playbackCtx.state === 'suspended') {
      playbackCtx.resume().catch(() => {});
    }
    const int16 = base64ToInt16(base64Pcm);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const audioBuf = playbackCtx.createBuffer(1, float32.length, 24000);
    audioBuf.getChannelData(0).set(float32);

    const src = playbackCtx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(analyserNode);

    const now = playbackCtx.currentTime;
    if (nextPlayTime < now + 0.02) nextPlayTime = now + 0.02;
    src.start(nextPlayTime);
    nextPlayTime += audioBuf.duration;

    isModelSpeaking = true;
    activeSources.push(src);
    src.onended = () => {
      activeSources = activeSources.filter((s) => s !== src);
      if (activeSources.length === 0) {
        isModelSpeaking = false;
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
        // Keep rolling pre-speech buffer so 1st syllable is never lost
        preSpeechRing.push(b64);
        if (preSpeechRing.length > PRE_SPEECH_CHUNKS) preSpeechRing.shift();

        const startThreshold = isModelSpeaking ? SPEECH_START_BARGE_IN : SPEECH_START_IDLE;
        if (micRms >= startThreshold) {
          isUserSpeaking = true;
          lastSpeechAt = now;
          stopSilenceWatch();
          if (isModelSpeaking) clearPlaybackQueue();

          // Explicit manual VAD start + flush pre-speech buffer (works on Gemini 3.8 Live & 2.5!)
          sendJson({ realtimeInput: { activityStart: {} } });
          for (const bufferedChunk of preSpeechRing) {
            sendAudioChunk(bufferedChunk);
          }
          preSpeechRing = [];
          if (currentCallbacks.onUserVoiceState) currentCallbacks.onUserVoiceState('speaking');
        }
      } else {
        // Currently inside child's utterance: keep streaming PCM chunks
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

  /**
   * Discover available Live (bidiGenerateContent) models on the user's exact API key!
   */
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
   * 1-Click End-to-End Live Connection Diagnostic Test (WebSocket setup + real audio reply check!)
   */
  async function testConnection({ apiKey, preferredModel = 'gemini-3.8-live' }) {
    const key = (apiKey || '').trim();
    if (!key) return { ok: false, step: 'key', message: 'Gemini API 키를 먼저 입력해 주세요.' };

    // Step 1: Verify API key & discover supported bidiGenerateContent models
    const disc = await discoverLiveModels(key);
    if (!disc.ok) {
      return { ok: false, step: 'key', message: `API 키 확인 실패: ${disc.error}` };
    }

    // Pick best candidate model order: preferred -> gemini-3.8-live -> first discovered live model -> 2.5 preview
    const candidates = [];
    const addUnique = (m) => { if (m && !candidates.includes(m)) candidates.push(m); };
    if (disc.liveModels.includes(preferredModel)) addUnique(preferredModel);
    if (disc.liveModels.includes('gemini-3.8-live')) addUnique('gemini-3.8-live');
    disc.liveModels.forEach((m) => { if (/live|native-audio/i.test(m)) addUnique(m); });
    addUnique(preferredModel);
    addUnique('gemini-2.5-flash-native-audio-preview-12-2025');

    let lastFailReason = '';
    for (const modelId of candidates.slice(0, 3)) {
      const probe = await probeLiveModel(key, modelId);
      if (probe.ok) {
        return {
          ok: true,
          workingModel: modelId,
          availableLiveModels: disc.liveModels,
          audioBytes: probe.audioBytes,
          transcript: probe.transcript,
          message: `✅ 실시간 음성 연결 성공! (모델: ${modelId}, 오디오 ${Math.round(probe.audioBytes / 1024)}KB 수신)`
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

  function probeLiveModel(apiKey, modelId) {
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
        finish({ ok: false, reason: gotSetup ? '응답 시간 초과 (10초)' : 'setupComplete 시간 초과' });
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
              turns: [{ role: 'user', parts: [{ text: 'Say "Hi friend!" in 2 words.' }] }],
              turnComplete: true
            }
          }));
          return;
        }
        const sc = msg.serverContent;
        if (!sc) return;
        if (sc.modelTurn?.parts) {
          for (const p of sc.modelTurn.parts) {
            if (p.inlineData?.data && /audio\/pcm/i.test(p.inlineData.mimeType || '')) {
              audioBytes += Math.floor((p.inlineData.data.length * 3) / 4);
            }
          }
        }
        if (sc.outputTranscription?.text) transcript += sc.outputTranscription.text;
        if (sc.turnComplete || audioBytes > 4000) {
          finish({ ok: audioBytes > 0, audioBytes, transcript: transcript.trim(), reason: audioBytes > 0 ? '' : '오디오 데이터 없음' });
        }
      };

      testWs.onerror = () => finish({ ok: false, reason: 'WebSocket 오류' });
      testWs.onclose = (ev) => {
        finish({ ok: false, reason: `code=${ev.code}${ev.reason ? ' ' + ev.reason : ''}` });
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
      // Manual client-side RMS VAD with 425ms pre-speech buffer (fixes Gemini 3.8 Live silent audio bug!)
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

    // Prepare playback AudioContext + AnalyserNode right inside user click gesture
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    try {
      playbackCtx = new AudioCtx({ sampleRate: 24000 });
    } catch (_) {
      playbackCtx = new AudioCtx();
    }
    if (playbackCtx.state === 'suspended') {
      playbackCtx.resume().catch(() => {});
    }
    analyserNode = playbackCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.connect(playbackCtx.destination);
    nextPlayTime = playbackCtx.currentTime;

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

        // 1. Setup complete -> start hands-free mic streaming & opening greeting!
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

        // 2. Barge-in interruption -> immediately stop AI audio
        if (sc.interrupted) {
          clearPlaybackQueue();
          stopSilenceWatch();
        }

        // 3. Incoming 24kHz PCM audio chunks
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.data && /audio\/pcm/i.test(part.inlineData.mimeType || '')) {
              schedulePcm24kPlayback(part.inlineData.data);
            }
          }
        }

        // 4. Real-time input & output transcriptions for captions & Parent Report
        if (sc.inputTranscription?.text) {
          pendingInputTranscript += sc.inputTranscription.text;
          if (onUserTranscript) onUserTranscript(pendingInputTranscript.trim(), false);
        }
        if (sc.outputTranscription?.text) {
          pendingOutputTranscript += sc.outputTranscription.text;
          if (onModelTranscript) onModelTranscript(pendingOutputTranscript.trim(), false);
        }

        // 5. Turn complete
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
    preSpeechRing = [];
    if (lipSyncRaf) { cancelAnimationFrame(lipSyncRaf); lipSyncRaf = null; }
    clearPlaybackQueue();
    if (processorNode) { try { processorNode.disconnect(); } catch (_) {} processorNode = null; }
    if (captureCtx) { try { captureCtx.close(); } catch (_) {} captureCtx = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (playbackCtx) { try { playbackCtx.close(); } catch (_) {} playbackCtx = null; }
    analyserNode = null;
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
    connect,
    disconnect,
    sendText,
    discoverLiveModels,
    testConnection,
    isConnected: () => connected,
    isSpeaking: () => isModelSpeaking
  };
})();
