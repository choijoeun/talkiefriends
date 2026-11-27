/* ==========================================================================
   TalkieFriends — American English (en-US) Voice Engine & 4.5s Silence Timer
   - Strict en-US pronunciation
   - Child mid-sentence pause protection
   - 4.5-second proactive silence hint timer
   - Strict NO-TTS rule for Parent Report
   ========================================================================== */

window.TFVoice = (function () {
  let availableEnUsVoices = [];
  let selectedVoiceURI = '';
  let recognition = null;
  let isListening = false;
  let silenceInterval = null;
  let silenceStart = 0;
  const SILENCE_LIMIT_MS = 4500; // Rule 1: 4~5 seconds proactive warm hint

  function loadEnUsVoices(onLoaded) {
    if (!('speechSynthesis' in window)) {
      if (onLoaded) onLoaded([]);
      return;
    }

    const gather = () => {
      const all = window.speechSynthesis.getVoices() || [];
      // Strictly filter American English (en-US) first, fallback to en_* if browser lacks en-US
      let us = all.filter((v) => /^en[-_]US$/i.test(v.lang));
      if (us.length === 0) {
        us = all.filter((v) => /^en/i.test(v.lang));
      }
      // Sort warm, natural US voices to the top
      const preferredOrder = ['Google US English', 'Samantha', 'Ava', 'Aria', 'Jenny', 'Zira', 'Alex'];
      us.sort((a, b) => {
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
  }

  function setVoiceURI(uri) {
    selectedVoiceURI = uri;
  }

  function getVoices() {
    return availableEnUsVoices;
  }

  function stopAllSpeech() {
    stopSilenceTimer();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
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

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    utter.pitch = options.pitch ?? 1.1;
    utter.rate = options.slow ? Math.max(0.68, (options.rate ?? 0.88) - 0.16) : (options.rate ?? 0.88);
    utter.volume = 1.0;

    const chosen = availableEnUsVoices.find((v) => v.voiceURI === selectedVoiceURI) || availableEnUsVoices[0];
    if (chosen) {
      utter.voice = chosen;
    }

    utter.onstart = () => {
      if (options.onStart) options.onStart();
    };
    utter.onend = () => {
      if (options.onEnd) options.onEnd();
    };
    utter.onerror = () => {
      if (options.onEnd) options.onEnd();
    };

    window.speechSynthesis.speak(utter);
  }

  /**
   * Active 4.5s Silence Hint Timer (Rule 1)
   */
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

  /**
   * Microphone SpeechRecognition with Child Pause Grace Window
   */
  function isRecognitionSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startListening({ onStart, onInterim, onResult, onEnd, onError }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (onError) onError('이 브라우저에서는 음성 인식을 지원하지 않아요. 아래 입력창이나 시뮬레이터 버튼을 이용해 주세요!');
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

      // Child pause protection: wait a tiny moment before finalizing
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
    } catch (err) {
      if (onError) onError('마이크를 시작할 수 없어요. 권한을 확인해 주세요.');
      return false;
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch (_) {}
    }
    isListening = false;
  }

  return {
    SILENCE_LIMIT_MS,
    loadEnUsVoices,
    setVoiceURI,
    getVoices,
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
