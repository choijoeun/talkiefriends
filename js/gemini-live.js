/* ==========================================================================
   TalkieFriends v5 — Real-Time Gemini Multimodal Live API Engine (WebSocket)
   - Hands-free bidirectional audio: 16kHz PCM mic -> Gemini Live -> 24kHz PCM voice
   - Real-time AnalyserNode RMS audio-driven lip-sync for Bluey & Friends!
   - Child-friendly VAD (prefixPaddingMs: 300, silenceDurationMs: 1600)
   - Automatic barge-in cancellation + 4.5s silence proactive hint nudge
   - Supports BOTH Server Ephemeral Tokens AND Direct User API Key
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
  let silenceTimer = null;
  let silenceTickInterval = null;
  let connected = false;
  let isModelSpeaking = false;
  let micRms = 0;
  let currentCallbacks = {};
  let pendingInputTranscript = '';
  let pendingOutputTranscript = '';

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
    if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    if (silenceTickInterval) { clearInterval(silenceTickInterval); silenceTickInterval = null; }
    if (currentCallbacks.onSilenceTick) currentCallbacks.onSilenceTick(0, 0, false);
  }

  function startProactiveSilenceWatch() {
    stopSilenceWatch();
    const limitMs = 4500;
    const start = Date.now();
    silenceTickInterval = setInterval(() => {
      if (!connected || isModelSpeaking) {
        stopSilenceWatch();
        return;
      }
      // If child is actively talking (mic RMS above gentle threshold), reset wait!
      if (micRms > 0.025) {
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (currentCallbacks.onSilenceNudge) currentCallbacks.onSilenceNudge();
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{
            text: '[SYSTEM_HINT: The 6-year-old child has been quietly thinking for 4.5 seconds. Gently jump in right now in your character personality with an easy either-or question or a short repeat-after-me phrase so they feel safe and excited to answer!]'
          }]
        }],
        turnComplete: true
      }
    }));
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
    const source = captureCtx.createMediaStreamSource(micStream);
    processorNode = captureCtx.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (event) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !connected) return;
      const input = event.inputBuffer.getChannelData(0);

      // Measure RMS for child speech activity indicator
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      micRms = Math.sqrt(sum / input.length);
      if (micRms > 0.028) {
        stopSilenceWatch();
      }
      if (currentCallbacks.onMicLevel) currentCallbacks.onMicLevel(micRms);

      const pcm16 = downsampleTo16kPCM(input, captureCtx.sampleRate);
      const b64 = arrayBufferToBase64(pcm16.buffer);
      ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: b64
          }
        }
      }));
    };

    source.connect(processorNode);
    // Connect through silent gain to keep ScriptProcessor active without feedback echo
    const zeroGain = captureCtx.createGain();
    zeroGain.gain.value = 0;
    processorNode.connect(zeroGain);
    zeroGain.connect(captureCtx.destination);
  }

  async function connect({
    apiKey,
    useServerToken = false,
    model = 'gemini-2.5-flash-native-audio-preview-09-2025',
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
          disabled: false,
          prefixPaddingMs: 300,
          silenceDurationMs: 1600
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

    // Prepare 24kHz playback AudioContext + AnalyserNode right inside user gesture
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    playbackCtx = new AudioCtx({ sampleRate: 24000 });
    analyserNode = playbackCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.connect(playbackCtx.destination);
    nextPlayTime = playbackCtx.currentTime;

    return new Promise((resolve) => {
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        if (onError) onError(`WebSocket 연결 실패: ${err.message}`);
        resolve(false);
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
          } catch (micErr) {
            if (onError) onError('마이크 권한을 허용해 주세요! (텍스트 입력은 계속 가능해요)');
          }
          if (onConnected) onConnected();
          if (openingPrompt) {
            sendText(openingPrompt);
          }
          resolve(true);
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;

        // 2. Barge-in interruption -> immediately stop AI audio and listen!
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
        if (onError) onError('Gemini Live 연결 중 오류가 발생했습니다. API 키와 모델명을 확인해 주세요.');
        resolve(false);
      };

      ws.onclose = (ev) => {
        const wasConnected = connected;
        cleanupAudioAndTimers();
        connected = false;
        if (onDisconnected) onDisconnected(ev.code, ev.reason || '');
        if (!wasConnected) resolve(false);
      };
    });
  }

  function sendText(text) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return false;
    stopSilenceWatch();
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      }
    }));
    return true;
  }

  function cleanupAudioAndTimers() {
    stopSilenceWatch();
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
    isConnected: () => connected,
    isSpeaking: () => isModelSpeaking
  };
})();
