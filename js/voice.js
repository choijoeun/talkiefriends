/* ==========================================================================
   TalkieFriends v5.4 — Rock-Solid American English (en-US) Voice Engine
   - Fixes Chrome/Safari silent TTS bugs (cancel/speak race, GC collection,
     paused queue lock, cloud-voice hang, iOS/Safari autoplay gesture lock)
   - Prefers reliable local en-US voices with automatic fallback watchdog
   - Built-in Web Audio chime & audio unlock helper
   - Strict NO-TTS rule for Parent Report
   ========================================================================== */

window.TFVoice = (function () {
  let availableEnUsVoices = [];
  let selectedVoiceURI = '';
  let recognition = null;
  let isListening = false;
  let silenceInterval = null;
  let silenceStart = 0;
  let activeUtter = null; // Prevent Chrome garbage-collecting utterance mid-speech!
  let speakDelayTimer = null;
  let startWatchdog = null;
  let speechUnlocked = false;
  let chimeCtx = null;
  const SILENCE_LIMIT_MS = 4500;

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
      // Prefer reliable LOCAL voices first (cloud "Google US English" often hangs silently on desktop/mobile)
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
    // Retry once after 400ms for browsers that populate voices asynchronously without firing event
    setTimeout(gather, 400);
  }

  function setVoiceURI(uri) {
    selectedVoiceURI = uri;
  }

  function getVoices() {
    return availableEnUsVoices;
  }

  /**
   * Call synchronously inside any user tap/click so iOS/Safari/Chrome unlock TTS & Web Audio!
   */
  function unlockSpeech() {
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
   * Play a gentle 2-note storybook marimba chime to verify device speakers work!
   */
  function playWarmChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!chimeCtx || chimeCtx.state === 'closed') chimeCtx = new AudioCtx();
      if (chimeCtx.state === 'suspended') chimeCtx.resume().catch(() => {});

      const now = chimeCtx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 happy chord
      notes.forEach((freq, i) => {
        const osc = chimeCtx.createOscillator();
        const gain = chimeCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0.001, now + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.22, now + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.28);
        osc.connect(gain);
        gain.connect(chimeCtx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.3);
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function stopAllSpeech() {
    stopSilenceTimer();
    if (speakDelayTimer) { clearTimeout(speakDelayTimer); speakDelayTimer = null; }
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
    activeUtter = null;
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
  }

  /**
   * Speak in clear, warm standard American English (en-US).
   * NEVER call this for Parent Reports (Rule 5).
   */
  function speakEnUS(text, options = {}) {
    if (!text || !('speechSynthesis' in window)) {
      if (options.onEnd) options.onEnd();
      return;
    }

    if (speakDelayTimer) { clearTimeout(speakDelayTimer); speakDelayTimer = null; }
    if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }

    // Refresh voice list if still empty
    if (availableEnUsVoices.length === 0) {
      loadEnUsVoices();
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

      utter.onstart = () => {
        started = true;
        if (startWatchdog) { clearTimeout(startWatchdog); startWatchdog = null; }
        if (options.onStart) options.onStart();
      };
      utter.onend = finish;
      utter.onerror = () => {
        if (!useDefaultVoiceFallback && !started) {
          // Retry once with OS default en-US voice if chosen voice errored
          doSpeak(true);
        } else {
          finish();
        }
      };

      synth.speak(utter);

      // Watchdog: if remote/cloud voice hangs silently without firing onstart, fallback to OS default voice!
      startWatchdog = setTimeout(() => {
        if (!started && !ended && activeUtter === utter) {
          if (!useDefaultVoiceFallback) {
            try { synth.cancel(); } catch (_) {}
            setTimeout(() => doSpeak(true), 40);
          } else {
            finish();
          }
        }
      }, 1400);
    };

    // Critical Chrome/Safari fix: wait 45ms after cancel() before speak() so browser doesn't drop the new utterance!
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
      if (onError) onError('이 브라우저에서는 음성 인식을 지원하지 않아요. 아래 입력창이나 선택 버튼을 이용해 주세요!');
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
      if (onError) onError('마이크를 시작할 수 없어요. 권한을 확인해 주세요.');
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
    loadEnUsVoices,
    setVoiceURI,
    getVoices,
    unlockSpeech,
    playWarmChime,
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
