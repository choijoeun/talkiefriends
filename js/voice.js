/* ==========================================================================
   TalkieFriends v5.5 — Universal American English (en-US) Voice Engine
   - Works in Chrome, Safari, iOS/Android PWA AND KakaoTalk In-App Browser!
   - Unlocks iOS/KakaoTalk audio session via <audio playsinline> silent WAV
   - Auto-falls back to Gemini TTS (<audio> WAV) when WebView lacks
     speechSynthesis voices (e.g. Android KakaoTalk WebView!)
   - Fixes Chrome/Safari silent TTS bugs (cancel/speak race, GC, cloud hang)
   - Strict NO-TTS rule for Parent Report
   ========================================================================== */

window.TFVoice = (function () {
  let availableEnUsVoices = [];
  let selectedVoiceURI = '';
  let geminiApiKey = '';
  let recognition = null;
  let isListening = false;
  let silenceInterval = null;
  let silenceStart = 0;
  let activeUtter = null;
  let speakDelayTimer = null;
  let startWatchdog = null;
  let speechUnlocked = false;
  let sharedAudioEl = null;
  let currentBlobUrl = null;
  const SILENCE_LIMIT_MS = 4500;

  // Tiny 46-byte valid silent WAV data URI — forces iOS/KakaoTalk WKWebView into loud Playback session!
  const SILENT_WAV_DATA_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  function isKakaoInApp() {
    return /KAKAOTALK/i.test(navigator.userAgent || '');
  }

  function isInAppWebView() {
    return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent || '');
  }

  function getSharedAudioEl() {
    if (!sharedAudioEl) {
      sharedAudioEl = document.createElement('audio');
      sharedAudioEl.setAttribute('playsinline', '');
      sharedAudioEl.setAttribute('webkit-playsinline', '');
      sharedAudioEl.preload = 'auto';
      sharedAudioEl.volume = 1.0;
    }
    return sharedAudioEl;
  }

  function encodePcmInt16ToWavBlobUrl(int16Samples, sampleRate = 24000) {
    const numBytes = int16Samples.length * 2;
    const buffer = new ArrayBuffer(44 + numBytes);
    const view = new DataView(buffer);
    const writeStr = (off, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numBytes, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numBytes, true);
    const out = new Int16Array(buffer, 44);
    out.set(int16Samples);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function base64ToWavBlobUrl(base64Data, mimeType = '') {
    const bin = atob(base64Data);
    // If Gemini already returned a complete WAV container ("RIFF"), use it directly!
    if (bin.length > 4 && bin.slice(0, 4) === 'RIFF') {
      const raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([raw], { type: 'audio/wav' }));
    }
    const evenLen = bin.length & ~1;
    const bytes = new Uint8Array(evenLen);
    for (let i = 0; i < evenLen; i++) bytes[i] = bin.charCodeAt(i);
    const rateMatch = String(mimeType || '').match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
    return encodePcmInt16ToWavBlobUrl(new Int16Array(bytes.buffer), sampleRate);
  }

  function playWavBlobUrl(url, { onStart, onEnd } = {}) {
    const audio = getSharedAudioEl();
    if (currentBlobUrl && currentBlobUrl !== url) {
      try { URL.revokeObjectURL(currentBlobUrl); } catch (_) {}
    }
    currentBlobUrl = url;
    audio.onplay = () => { if (onStart) onStart(); };
    audio.onended = () => { if (onEnd) onEnd(); };
    audio.onerror = () => { if (onEnd) onEnd(); };
    audio.src = url;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) {
      p.catch(() => { if (onEnd) onEnd(); });
    }
  }

  function loadEnUsVoices(onLoaded) {
    if (!('speechSynthesis' in window)) {
      if (onLoaded) onLoaded([]);
      return;
    }

    const gather = () => {
      const all = window.speechSynthesis.getVoices() || [];
      let us = all.filter((v) => /^en[-_]US$/i.test(v.lang));
      if (us.length === 0) {
        us = all.filter((v) => /^en/i.test(v.lang));
      }
      const preferredOrder = ['Samantha', 'Ava', 'Aria', 'Jenny', 'Zira', 'Alex', 'Google US English'];
      us.sort((a, b) => {
        if (Boolean(a.localService) !== Boolean(b.localService)) {
          return a.localService ? -1 : 1;
        }
        const ai = preferredOrder.findIndex((p) => a.name.includes(p));
        const bi = preferredOrder.findIndex((p) => b.name.includes(p));
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      availableEnUsVoices = us;
      if (!selectedVoiceURI && us.length > 0) {
        selectedVoiceURI = us[0].voiceURI;
      }
      if (onLoaded) onLoaded(us);
    };

    gather();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = gather;
    }
    setTimeout(gather, 400);
  }

  function setVoiceURI(uri) {
    selectedVoiceURI = uri;
  }

  function setApiKey(key) {
    geminiApiKey = (key || '').trim();
  }

  function getVoices() {
    return availableEnUsVoices;
  }

  /**
   * Call synchronously inside any user tap/click to unlock BOTH <audio> (KakaoTalk/iOS!) AND speechSynthesis!
   */
  function unlockSpeech() {
    try {
      const audio = getSharedAudioEl();
      if (audio.paused && !audio.src) {
        audio.src = SILENT_WAV_DATA_URI;
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (_) {}

    if (!speechUnlocked && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        u.lang = 'en-US';
        window.speechSynthesis.speak(u);
        speechUnlocked = true;
      } catch (_) {}
    }
  }

  /**
   * Synthesize a real 16-bit PCM WAV chime played via HTML5 <audio> — works even in KakaoTalk Android/iOS!
   */
  function playWarmChime() {
    try {
      const sampleRate = 22050;
      const durationSec = 0.48;
      const total = Math.floor(sampleRate * durationSec);
      const samples = new Int16Array(total);
      const notes = [
        { f: 523.25, t0: 0.0, t1: 0.16 },
        { f: 659.25, t0: 0.11, t1: 0.28 },
        { f: 783.99, t0: 0.22, t1: 0.47 }
      ];
      for (let i = 0; i < total; i++) {
        const t = i / sampleRate;
        let val = 0;
        for (const n of notes) {
          if (t >= n.t0 && t <= n.t1) {
            const env = Math.min(1, (t - n.t0) / 0.015) * Math.exp(-(t - n.t0) * 9);
            val += Math.sin(2 * Math.PI * n.f * t) * env * 0.32;
          }
        }
        samples[i] = Math.max(-32767, Math.min(32767, Math.round(val * 32767)));
      }
      const wavUrl = encodePcmInt16ToWavBlobUrl(samples, sampleRate);
      playWavBlobUrl(wavUrl);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Gemini REST TTS fallback -> WAV Blob played through HTML5 <audio> (makes KakaoTalk Android/iOS speak clearly!)
   */
  async function speakViaGeminiTTS(text, options = {}) {
    const key = (options.apiKey || geminiApiKey || '').trim();
    if (!key) return false;
    const voiceName = options.geminiVoice || 'Puck';
    const models = ['gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'];

    for (const modelId of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Say cheerfully and warmly to a 6-year-old child in clear American English: ${text}` }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName }
                  }
                }
              }
            })
          }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p) => p.inlineData?.data);
        if (audioPart) {
          const wavUrl = base64ToWavBlobUrl(audioPart.inlineData.data, audioPart.inlineData.mimeType);
          playWavBlobUrl(wavUrl, { onStart: options.onStart, onEnd: options.onEnd });
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function stopAllSpeech() {
    stopSilenceTimer();
    if (speakDelayTimer) { clearTimeout(speakDelayTimer); speakDelayTimer = null; }
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
    activeUtter = null;
    if (sharedAudioEl) {
      try { sharedAudioEl.pause(); sharedAudioEl.currentTime = 0; } catch (_) {}
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
  }

  /**
   * Speak in clear, warm standard American English (en-US).
   * Automatically falls back to Gemini Cloud TTS (<audio> WAV) in KakaoTalk / WebViews without TTS voices!
   * NEVER call this for Parent Reports (Rule 5).
   */
  function speakEnUS(text, options = {}) {
    if (!text) {
      if (options.onEnd) options.onEnd();
      return;
    }

    if (speakDelayTimer) { clearTimeout(speakDelayTimer); speakDelayTimer = null; }
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }

    const hasApiKey = Boolean((options.apiKey || geminiApiKey || '').trim());
    const synthSupported = 'speechSynthesis' in window;

    if (synthSupported && availableEnUsVoices.length === 0) {
      loadEnUsVoices();
    }

    // In KakaoTalk / In-App WebViews (where Android speechSynthesis is broken/empty), use Gemini <audio> TTS directly if key exists!
    if ((!synthSupported || (isInAppWebView() && availableEnUsVoices.length === 0)) && hasApiKey) {
      speakViaGeminiTTS(text, options).then((ok) => {
        if (!ok && options.onEnd) options.onEnd();
      });
      return;
    }

    if (!synthSupported) {
      if (options.onEnd) options.onEnd();
      return;
    }

    const synth = window.speechSynthesis;
    const needCancel = synth.speaking || synth.pending;
    if (needCancel) {
      try { synth.cancel(); } catch (_) {}
    }

    const doSpeak = (useDefaultVoiceFallback = false) => {
      try { synth.resume(); } catch (_) {}

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.pitch = options.pitch ?? 1.08;
      utter.rate = options.slow ? Math.max(0.7, (options.rate ?? 0.9) - 0.16) : (options.rate ?? 0.9);
      utter.volume = 1.0;

      if (!useDefaultVoiceFallback) {
        const chosen = availableEnUsVoices.find((v) => v.voiceURI === selectedVoiceURI) || availableEnUsVoices[0];
        if (chosen) utter.voice = chosen;
      }

      activeUtter = utter;
      let started = false;
      let ended = false;

      const finish = () => {
        if (ended) return;
        ended = true;
        if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
        if (activeUtter === utter) activeUtter = null;
        if (options.onEnd) options.onEnd();
      };

      const fallbackOrFinish = () => {
        if (hasApiKey && !started) {
          if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
          if (activeUtter === utter) activeUtter = null;
          speakViaGeminiTTS(text, options).then((ok) => {
            if (!ok) finish();
          });
        } else {
          finish();
        }
      };

      utter.onstart = () => {
        started = true;
        if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
        if (options.onStart) options.onStart();
      };
      utter.onend = finish;
      utter.onerror = () => {
        if (!useDefaultVoiceFallback && !started) {
          doSpeak(true);
        } else {
          fallbackOrFinish();
        }
      };

      synth.speak(utter);

      startWatchdog = setTimeout(() => {
        if (!started && !ended && activeUtter === utter) {
          if (!useDefaultVoiceFallback) {
            try { synth.cancel(); } catch (_) {}
            setTimeout(() => doSpeak(true), 40);
          } else {
            try { synth.cancel(); } catch (_) {}
            fallbackOrFinish();
          }
        }
      }, 1300);
    };

    if (needCancel) {
      speakDelayTimer = setTimeout(() => doSpeak(false), 45);
    } else {
      doSpeak(false);
    }
  }

  function startSilenceTimer({ onTick, onTimeout }) {
    stopSilenceTimer();
    silenceStart = Date.now();

    silenceInterval = setInterval(() => {
      const elapsed = Date.now() - silenceStart;
      const ratio = Math.min(1, elapsed / SILENCE_LIMIT_MS);
      const remainingSec = Math.max(0, (SILENCE_LIMIT_MS - elapsed) / 1000);
      if (onTick) onTick(ratio, remainingSec);

      if (elapsed >= SILENCE_LIMIT_MS) {
        stopSilenceTimer();
        if (onTimeout) onTimeout();
      }
    }, 80);
  }

  function stopSilenceTimer() {
    if (silenceInterval) {
      clearInterval(silenceInterval);
      silenceInterval = null;
    }
  }

  function isRecognitionSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startListening({ onStart, onInterim, onResult, onEnd, onError }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (onError) onError('이 브라우저에서는 마이크 음성 인식을 지원하지 않아요. 크롬·사파리로 열거나 아래 선택 버튼을 이용해 주세요!');
      return false;
    }

    stopListening();
    stopSilenceTimer();

    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 3;

    let finalTranscript = '';
    let pauseGraceTimer = null;

    recognition.onstart = () => {
      isListening = true;
      if (onStart) onStart();
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript + ' ';
        } else {
          interim += res[0].transcript;
        }
      }
      const combined = (finalTranscript + interim).trim();
      if (onInterim) onInterim(combined);

      if (pauseGraceTimer) clearTimeout(pauseGraceTimer);
      if (finalTranscript.trim()) {
        pauseGraceTimer = setTimeout(() => {
          const text = finalTranscript.trim();
          finalTranscript = '';
          if (text && onResult) onResult(text);
        }, 500);
      }
    };

    recognition.onerror = (event) => {
      isListening = false;
      if (onError) onError(`마이크 인식 알림: ${event.error}`);
      if (onEnd) onEnd();
    };

    recognition.onend = () => {
      isListening = false;
      if (finalTranscript.trim()) {
        const text = finalTranscript.trim();
        finalTranscript = '';
        if (onResult) onResult(text);
      }
      if (onEnd) onEnd();
    };

    try {
      recognition.start();
      return true;
    } catch (_) {
      if (onError) onError('마이크를 시작할 수 없어요. 크롬·사파리에서 열어 마이크 권한을 허용해 주세요.');
      return false;
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      try { recognition.stop(); } catch (_) {}
    }
    isListening = false;
  }

  return {
    SILENCE_LIMIT_MS,
    isKakaoInApp,
    isInAppWebView,
    loadEnUsVoices,
    setVoiceURI,
    setApiKey,
    getVoices,
    unlockSpeech,
    playWarmChime,
    encodePcmInt16ToWavBlobUrl,
    playWavBlobUrl,
    stopAllSpeech,
    speakEnUS,
    startSilenceTimer,
    stopSilenceTimer,
    isRecognitionSupported,
    startListening,
    stopListening,
    getIsListening: () => isListening
  };
})();
