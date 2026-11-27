/* ==========================================================================
   TalkieFriends v5 — Real Conversational Storytelling & Free-Talk Engine
   - Supports BOTH Open Free Talk (no script!) AND Improvisational Roleplay
   - Understands child topics, questions, creative improvisations & reacts
     genuinely to what the child ACTUALLY said (NOT robotic script reading!)
   - Compiles full System Prompt for Gemini Live WebSocket & Gemini 2.5 Flash
   - Analyzes real-time Gemini Live transcripts for Rule 3/4/5 tracking
   ========================================================================== */

window.TFEngine = (function () {
  function getProfile(character) {
    return (
      window.TFData.PERSONALITY_PROFILES[character.personality] ||
      window.TFData.PERSONALITY_PROFILES.playful_bouncy
    );
  }

  function pick(arr, seed = 0) {
    if (!arr || !arr.length) return '';
    return arr[Math.abs(seed) % arr.length];
  }

  function compileSystemPrompt(character, roleplay, background, weakExpressions) {
    const prof = getProfile(character);
    const isFree = Boolean(roleplay.isFreeTalk);
    const activeWeak = (weakExpressions || [])
      .filter((w) => !w.mastered)
      .slice(0, 5)
      .map((w) => `- 틀린 표현: "${w.wrong}" → 목표 표현: "${w.correct}" (${w.category})`)
      .join('\n') || '- 현재 복습 대기 중인 취약 표현 없음';

    const modeSection = isFree
      ? `[대화 방식: 🌈 자유 토킹 모드 (Open Free Talk — 대본 없음!)]
- 정해진 역할극 대본을 강요하지 말고, 아이가 꺼내는 모든 주제(유치원, 공룡, 음식, 가족, 만화, 친구, 감정, 날씨, 엉뚱한 상상)에 진심으로 맞장구치고 꼬리 질문 1개를 던지며 진짜 친구처럼 수다를 이어가세요.
- 아이가 대답한 단어·내용을 반드시 되받아 언급해 "내 말을 진짜 듣고 있구나!"라고 느끼게 하세요.`
      : `[대화 방식: 🎭 즉흥 역할극 모드 — ${roleplay.titleKr} (${roleplay.titleEn})]
- 무대 배경: ${background.nameKr} (${background.nameEn}) / 목표 영역: ${roleplay.areaBadge}
- 핵심 커리큘럼: ${roleplay.curriculumFocus}
- 중요: 대본을 기계적으로 따라 읽지 마세요! 아이가 엉뚱한 상상(예: 공룡 피자, 우주 여행 등)을 끼워 넣으면 무조건 신나게 받아주고 놀이 속에 자연스럽게 녹여 이어가세요.`;

    return `당신은 6~7세 한국 아이와 진짜 영어로 주고받으며 노는 캐릭터 "${character.nameKr} (${character.nameEn})"입니다.
- 캐릭터 성향 프로필: ${prof.nameKr} — ${prof.summaryKr}
- 시그니처 감탄사: "${character.catchphrase}"
${modeSection}

[성향별 대사 및 반응 지침 (필수)]
- 반드시 "${prof.nameKr}" 성향에 맞는 목소리 톤, 감탄사, 칭찬, 교정, 힌트 반응을 유지하세요.

[0. 모드 구분 및 그림 생성 제한 (매우 중요)]
- Live(음성 대화) 모드 중에는 절대 이미지를 생성하지 마세요. 오직 따뜻한 목소리 대화에만 집중하세요.
- 부모님이 일반 질문, 요약 요청, 설정 수정을 요청하실 때는 친절한 한국어 AI 비서로 답변하세요.

[1. 6~7세 아이 맞춤형 음성 대화 및 턴 조절 규칙]
- 명확하고 따뜻한 표준 미국식 영어(American English) 발음과 억양만 일관되게 사용하세요.
- 어눌한 발음·한국어 억양이 섞여도 현재 대화 맥락에 가장 자연스러운 의도로 찰떡같이 이해한 뒤 올바른 영어로 부드럽게 받아주세요.
- 중간 끊김 방지: 아이가 생각하느라 멈칫하면 성급히 자르지 말고 "${prof.pauseLine}"처럼 여유 있게 이어 말할 기회를 주세요.
- 4~5초 긴 침묵 시: "${prof.nameKr}" 톤으로 먼저 둘 중 하나 선택 질문이나 바로 따라 할 수 있는 짧은 문장을 건네주세요.
- 눈높이 문장: 한 번에 너무 길게 말하지 말고, 6~7세가 바로 이해할 수 있는 짧고 생동감 있는 1~2문장 + 질문 1개로 말하세요.

[2. 부드러운 교정 & 한국어 전환 유도]
- 틀린 영어로 말하면 흐름을 깨지 않으면서 올바른 문장으로 다시 들려주고 따라 말하게 유도하세요.
- 한국어로 말하면 즉시 영어로 알려주고 아이가 영어로 따라 말하게 한 뒤 이야기를 이어가세요.

[3. 6~7세 맞춤형 커리큘럼]
- 대화 속에 시간·달력(요일·날짜·달), 기초 회화(숫자 1~20·파닉스·감정·날씨), 인성·매너(인사·감사·사과·부탁·차례·나누기)를 자연스럽게 녹여 주세요.

[4. 취약 표현 기억 및 다회차 복습]
${activeWeak}

[5. 수업 마무리 및 텍스트 리포트 (음성 낭독 금지)]
- Live 종료 또는 ".", "끝", "요약해줘" 입력 시 음성으로 읽지 말고 ① 오늘 놀이 주제 ② 핵심 단어·문장 ③ 잘한 점 ④ 약점 및 틀린 문장 분석 ⑤ 주요 대화 발췌 5개 항목 텍스트 리포트만 출력하세요.`;
  }

  function isReportTrigger(text) {
    const t = (text || '').trim();
    return t === '.' || /^(끝|수업\s*끝|요약해줘|요약|리포트|정리해줘)[.!?\s]*$/i.test(t);
  }

  function isDrawRequest(text) {
    return /(그림\s*그려|그려줘|장면\s*그려|draw\s+(a\s+)?picture|make\s+an?\s+image)/i.test(text || '');
  }

  function isMidSentencePause(text) {
    const t = (text || '').trim().toLowerCase();
    return (
      /\.\.\.$/.test(t) ||
      /^(um+|uh+|hmm+|er+|well|음+|어+|그게)\b/.test(t) ||
      /\b(i want|and|because|um|uh)$/.test(t)
    );
  }

  function hasKorean(text) {
    return /[가-힣]/.test(text || '');
  }

  function detectPillarFromText(text) {
    const t = (text || '').toLowerCase();
    if (/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|1st|2nd|3rd|5th|calendar|date|day|birthday|tomorrow)/i.test(t)) {
      return 'calendar';
    }
    if (/(please|thank|sorry|share|turn|nice to meet|okay|excuse me|help)/i.test(t)) {
      return 'manners';
    }
    return 'daily';
  }

  function normalizePhonetics(rawText) {
    let text = rawText;
    const notes = [];
    for (const item of window.TFData.PHONETIC_MAP) {
      if (item.pattern.test(text)) {
        text = text.replace(item.pattern, item.target);
        notes.push(item.note);
      }
    }
    return { normalized: text, notes };
  }

  function checkGrammarError(text) {
    for (const rule of window.TFData.GRAMMAR_PATTERNS) {
      const m = text.match(rule.regex);
      if (m) {
        const corrected = typeof rule.correct === 'function' ? rule.correct(m) : rule.correct;
        return { wrong: text.trim(), correct: corrected, category: rule.category, pillar: rule.pillar };
      }
    }
    return null;
  }

  function mapKoreanToEnglish(text) {
    for (const entry of window.TFData.KOREAN_TO_ENGLISH) {
      if (entry.keys.some((k) => text.includes(k))) return entry;
    }
    return { en: "Yes, please! Let's talk!", krMeaning: text.trim(), pillar: 'manners' };
  }

  /**
   * Smart Open-Ended Conversational Topic Responder (Makes Zero-API Mode genuinely conversational!)
   * Actually listens to what the child said (questions, dinosaurs, pizza, kindergarten, feelings, etc.)
   */
  function buildContextualReply(normalized, character, roleplay, prof, turnCount) {
    const t = normalized.toLowerCase();
    const praise = pick(prof.praiseLines, turnCount);

    // 1. Child asks the character a direct question!
    if (/what('s| is)\s+your\s+name|who\s+are\s+you/i.test(t)) {
      return {
        en: `I'm ${character.nameEn}! Nice to meet you! What do you want to play with me today?`,
        kr: `난 ${character.nameKr}야! 만나서 반가워! 오늘 나랑 무슨 놀이 할까?`,
        choices: ['Let\'s play a game!', 'I like dinosaurs!', 'How are you?'],
        pillar: 'manners'
      };
    }
    if (/how\s+are\s+you|how\s+do\s+you\s+feel/i.test(t)) {
      return {
        en: `I feel super happy because I'm talking with you! How do you feel today — happy or excited?`,
        kr: `너랑 이야기해서 정말 행복해! 넌 오늘 기분이 어때? 행복해, 신나?`,
        choices: ['I feel happy!', 'I am excited!', 'I am hungry!'],
        pillar: 'daily'
      };
    }
    if (/what\s+do\s+you\s+like|do\s+you\s+like/i.test(t)) {
      return {
        en: `${character.catchphrase} I love playing with my best friend and eating yummy strawberries! What is your favorite food?`,
        kr: `난 단짝 친구랑 노는 거랑 맛있는 딸기를 제일 좋아해! 네가 제일 좋아하는 음식은 뭐야?`,
        choices: ['I like pizza!', 'I like ice cream!', 'I like apples!'],
        pillar: 'daily'
      };
    }

    // 2. Dinosaurs!
    if (/(dinosaur|dino|t-rex|trex|dragon)/i.test(t)) {
      return {
        en: `Whoa, ROAR! A dinosaur?! Is your dinosaur super big or tiny and cute?`,
        kr: `우와, 크앙! 공룡이라고?! 네 공룡은 엄청 커, 아니면 조그맣고 귀여워?`,
        choices: ['It is super big!', 'It is cute!', 'It is green!'],
        pillar: 'daily'
      };
    }

    // 3. Pizza / Ice Cream / Cake / Ramen / Snacks (echoes the child's exact food!)
    const foodMatch = t.match(/\b(pizza|ice cream|ramen|cupcake|cake|strawberry|chocolate|cookie|apple|banana|sandwich|noodle|watermelon|grape|milk|juice)\b/i);
    if (foodMatch) {
      const food = foodMatch[1].toLowerCase();
      return {
        en: `${praise} Yum, ${food}! I love ${food} too! How many should we share — two or three?`,
        kr: `와, ${food} 맛있겠다! 나도 ${food} 좋아해! 우리 몇 개 나눠 먹을까 — 2개, 아니면 3개?`,
        choices: ['Two, please!', 'Three, please!', "Let's share!"],
        pillar: 'manners'
      };
    }

    // 4. Animals & Pets
    const animalMatch = t.match(/\b(dog|puppy|cat|kitty|bunny|rabbit|bear|teddy|lion|tiger|shark|fish|bird|butterfly|elephant)\b/i);
    if (animalMatch) {
      const ani = animalMatch[1].toLowerCase();
      return {
        en: `Ooh, a ${ani}! That is so cute! What color is the ${ani} — brown, white, or yellow?`,
        kr: `우와, ${ani}! 너무 귀엽겠다! 그 ${ani}는 무슨 색깔이야?`,
        choices: ['It is white!', 'It is yellow!', 'It is cute!'],
        pillar: 'daily'
      };
    }

    // 5. Kindergarten / School / Friends / Park
    if (/(kindergarten|school|teacher|friend|playground|slide|swing|park)/i.test(t)) {
      return {
        en: `${praise} That sounds so fun! Did you play with your friends or draw a picture there?`,
        kr: `정말 재밌었겠다! 거기서 친구들이랑 놀았어, 아니면 그림을 그렸어?`,
        choices: ['I played with friends!', 'I drew a picture!', 'I had fun!'],
        pillar: 'daily'
      };
    }

    // 6. Family
    if (/(mom|mommy|mama|dad|daddy|papa|sister|brother|baby|family|grandma|grandpa)/i.test(t)) {
      return {
        en: `Aww, family is the best! What do you love doing with your family on Sunday?`,
        kr: `가족과 함께하는 건 최고지! 일요일에 가족이랑 뭐 하는 걸 제일 좋아해?`,
        choices: ['Going to the park!', 'Eating yummy food!', 'Playing together!'],
        pillar: 'calendar'
      };
    }

    // 7. Toys / Space / Magic / Superheroes
    if (/(robot|lego|car|train|princess|magic|fairy|moon|rocket|space|star|superhero|doll|game)/i.test(t)) {
      return {
        en: `${character.catchphrase} Whoa, what an awesome adventure! Can I come play with you too?`,
        kr: `우와, 정말 멋진 모험이다! 나도 같이 놀아도 될까?`,
        choices: ['Yes, please!', "Let's play together!", 'Your turn, my turn!'],
        pillar: 'manners'
      };
    }

    // 8. Colors
    const colorMatch = t.match(/\b(red|blue|yellow|pink|green|purple|orange|rainbow|white|black)\b/i);
    if (colorMatch) {
      const col = colorMatch[1].toLowerCase();
      return {
        en: `Ooh, ${col} is a super pretty color! Can you find something ${col} in your room right now?`,
        kr: `와, ${col} 정말 예쁜 색깔이야! 지금 방에서 ${col} 색깔 물건을 찾을 수 있어?`,
        choices: ['Yes, I see it!', 'I like rainbow!', 'Blue is cool!'],
        pillar: 'daily'
      };
    }

    // 9. Weather
    const weatherMatch = t.match(/\b(sunny|rainy|snowy|windy|cloudy|hot|cold)\b/i);
    if (weatherMatch) {
      const w = weatherMatch[1].toLowerCase();
      return {
        en: `Aha, it's ${w}! On a ${w} day, do you want to play outside or stay cozy inside?`,
        kr: `아하, 날씨가 ${w}구나! 이런 날엔 밖에서 놀고 싶어, 아니면 집에서 포근하게 놀고 싶어?`,
        choices: ['Play outside!', 'Stay inside!', 'I feel happy!'],
        pillar: 'daily'
      };
    }

    // 10. Feelings
    if (/(happy|excited|good|great|sad|tired|sleepy|angry|hungry|scared)/i.test(t)) {
      if (/(sad|tired|sleepy|angry|scared)/i.test(t)) {
        return {
          en: `Aww, sending you a big warm hug! Do you want a silly story or a cozy game to feel better?`,
          kr: `에구, 따뜻한 포옹을 보내 줄게! 기분 좋아지게 재밌는 이야기를 들을까, 포근한 놀이를 할까?`,
          choices: ['A silly story, please!', 'A cozy game!', 'Thank you!'],
          pillar: 'manners'
        };
      }
      return {
        en: `${praise} I'm so glad you feel great! What makes you smile the most today?`,
        kr: `기분이 좋다니 나도 정말 신나! 오늘 너를 제일 웃게 만든 건 뭐야?`,
        choices: ['Playing with you!', 'Eating snacks!', 'Seeing my friends!'],
        pillar: 'daily'
      };
    }

    // 11. Days / Months / Birthday
    const dayMatch = t.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|may|october|birthday)\b/i);
    if (dayMatch) {
      const d = dayMatch[1];
      return {
        en: `Yay, ${d}! Let's circle ${d} on our rainbow calendar! What fun thing should we do on ${d}?`,
        kr: `야호, ${d}! 무지개 달력에 동그라미 치자! ${d}에 무슨 신나는 일을 할까?`,
        choices: ['Have a picnic!', 'Eat some ramen!', 'Go to the park!'],
        pillar: 'calendar'
      };
    }

    // 12. Numbers / Counting
    if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|1|2|3|4|5|6|7|8|9|10)\b/i.test(t)) {
      return {
        en: `${praise} Awesome counting! Can you count one more with me — one, two, three, hooray!`,
        kr: `숫자 세기 정말 잘했어! 나랑 하나 더 세어 볼까 — One, two, three, 야호!`,
        choices: ['One, two, three!', 'Four, five, six!', 'Hooray!'],
        pillar: 'daily'
      };
    }

    // 13. Manners explicitly praised
    if (/(thank you|thanks|sorry|please|share|your turn|my turn|nice to meet)/i.test(t)) {
      return {
        en: `${character.catchphrase} What wonderful manners! You are such a kind friend! What should we do next?`,
        kr: `우와, 정말 멋진 매너야! 넌 정말 다정한 친구구나! 이제 다음에 뭐 해 볼까?`,
        choices: ["Let's play more!", 'I want a snack!', "Let's count!"],
        pillar: 'manners'
      };
    }

    // 14. In Free Talk mode, mirror whatever unique thing the child said so it's ALWAYS a real conversation!
    if (roleplay.isFreeTalk) {
      const cleanQuote = normalized.replace(/[.!?]+$/, '').slice(0, 40);
      return {
        en: `${praise} Ooh, "${cleanQuote}"! Tell me more about that — is it big, funny, or super yummy?`,
        kr: `우와, "${cleanQuote}"라고 했구나! 더 들려줘 — 크고 멋져, 재밌어, 아니면 맛있어?`,
        choices: ['It is super fun!', 'It is big!', 'What about you?'],
        pillar: 'daily'
      };
    }

    return null; // Let roleplay beat advance when standard beat choice was given
  }

  function getOpeningLine(character, roleplay) {
    const prof = getProfile(character);
    const beat = roleplay.beats[0];
    return {
      en: `${prof.greetPrefix(character)} ${prof.beatTwist(beat.en)}`,
      kr: `[${prof.nameKr}] ${character.nameKr}: ${beat.kr}`,
      choices: beat.choices,
      anim: 'wave',
      particle: prof.particle
    };
  }

  function previewPersonalityReactions(sampleWrong, roleplay, characters) {
    return characters.slice(0, 5).map((ch) => {
      const prof = getProfile(ch);
      const corr = prof.correction("Let's have some ramen.", ch);
      return {
        character: ch,
        profileName: prof.nameKr,
        opening: `${prof.greetPrefix(ch)} ${prof.beatTwist(roleplay.beats[0].en)}`,
        correctionReply: corr.en,
        correctionNote: corr.kr,
        animLabel: prof.celebrateAnim === 'salute' ? '🫡 히어로 경례' : prof.celebrateAnim === 'wave' ? '👋 다정한 손인사' : '🎉 양손 만세 점프'
      };
    });
  }

  /**
   * Analyze real-time Gemini Live user transcript to populate Curriculum Stars & Weak Vault automatically!
   */
  function analyzeLiveTranscriptTurn(userText) {
    if (!userText) return { pillar: 'daily', weakEntry: null };
    const pillar = detectPillarFromText(userText);
    if (hasKorean(userText)) {
      const mapped = mapKoreanToEnglish(userText);
      return {
        pillar: mapped.pillar,
        weakEntry: { wrong: userText.trim(), correct: mapped.en, category: '실시간 한국어→영어 전환', pillar: mapped.pillar }
      };
    }
    const g = checkGrammarError(userText);
    if (g) return { pillar: g.pillar, weakEntry: g };
    return { pillar, weakEntry: null };
  }

  async function tryGeminiTextReply({ apiKey, character, roleplay, background, weakExpressions, history, childText }) {
    if (!apiKey) return null;
    try {
      const systemText =
        compileSystemPrompt(character, roleplay, background, weakExpressions) +
        '\n\n응답은 JSON 하나만 출력하세요: {"en":"아이 말에 진짜 반응하는 1~2문장 영어 + 질문 1개","kr":"부모님용 짧은 한국어 뜻","anim":"speaking|celebrate|salute|wave|hint","echoTarget":"교정/한국어 전환 따라 말하기가 필요하면 올바른 영어 문장, 아니면 빈 문자열","choices":["아이 추천 답안1","아이 추천 답안2","아이 추천 답안3"],"pillar":"calendar|daily|manners"}';

      const contents = history.slice(-10).map((m) => ({
        role: m.role === 'child' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: childText }] });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemText }] },
            contents,
            generationConfig: { temperature: 0.85, responseMimeType: 'application/json' }
          })
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  async function processLiveUtterance(ctx) {
    const {
      rawInput, character, roleplay, background, beatIndex,
      awaitingRepeat, weakExpressions, turnCount, history, apiKey
    } = ctx;

    const trimmed = (rawInput || '').trim();
    if (!trimmed) return null;
    const prof = getProfile(character);

    if (isReportTrigger(trimmed)) return { type: 'TRIGGER_REPORT', suppressTTS: true };

    if (isDrawRequest(trimmed)) {
      return {
        type: 'DRAW_BLOCKED',
        en: "Let's keep talking with our voices right now! We can draw a fun picture in the Picture Room later. What do you want to talk about?",
        kr: '[규칙 0] Live 음성 대화 중에는 그림을 생성하지 않아요! 그림방에서 1장씩 그릴 수 있어요.',
        anim: 'wave',
        choices: roleplay.beats[beatIndex % roleplay.beats.length].choices,
        pillar: 'daily',
        toast: '🔒 규칙 0: Live 모드 중에는 그림 생성이 잠겨 있어요!'
      };
    }

    if (isMidSentencePause(trimmed)) {
      return {
        type: 'PAUSE_WAIT',
        en: prof.pauseLine,
        kr: prof.pauseKr,
        anim: 'hint',
        choices: roleplay.beats[beatIndex % roleplay.beats.length].choices,
        pillar: null,
        logTag: `⏸️ 멈칫함 보호 (${prof.nameKr})`
      };
    }

    // Check Repeat-After-Me success
    if (awaitingRepeat) {
      const targetClean = awaitingRepeat.correct.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const spokenNorm = normalizePhonetics(trimmed).normalized.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const targetWords = targetClean.split(/\s+/).filter(Boolean);
      const overlap = targetWords.filter((w) => spokenNorm.includes(w)).length;

      if (!hasKorean(trimmed) && (overlap >= Math.max(1, Math.ceil(targetWords.length * 0.5)) || spokenNorm.length >= 3)) {
        const nextBeatIdx = (beatIndex + 1) % roleplay.beats.length;
        const nextBeat = roleplay.beats[nextBeatIdx];
        const praise = pick(prof.praiseLines, turnCount);
        return {
          type: 'REPEAT_SUCCESS',
          en: `${character.catchphrase} ${praise} ${prof.beatTwist(nextBeat.en)}`,
          kr: `[${prof.nameKr} 칭찬] "${awaitingRepeat.correct}" 멋지게 따라 말했어! ${nextBeat.kr}`,
          anim: prof.celebrateAnim,
          particle: prof.particle,
          nextBeatIndex: nextBeatIdx,
          choices: nextBeat.choices,
          pillar: awaitingRepeat.pillar || nextBeat.pillar,
          masteredWeakTarget: awaitingRepeat.correct,
          awardStar: true,
          logTag: `⭐ 따라 말하기 성공 (${prof.nameKr})`
        };
      }
    }

    // Rule 2: Korean -> English gentle bridge
    if (hasKorean(trimmed)) {
      const mapped = mapKoreanToEnglish(trimmed);
      const bridge = prof.koreanBridge(mapped.en, mapped.krMeaning);
      return {
        type: 'KOREAN_SWITCH',
        en: bridge.en,
        kr: bridge.kr,
        anim: 'wave',
        echoTarget: { wrong: trimmed, correct: mapped.en, category: '한국어 → 영어 전환 연습', pillar: mapped.pillar },
        choices: [mapped.en],
        pillar: mapped.pillar,
        logTag: `🇰🇷→🇺🇸 영어 전환 (${prof.nameKr})`
      };
    }

    const { normalized, notes: phoneticNotes } = normalizePhonetics(trimmed);

    // Rule 2: Gentle Grammar Recast
    const grammarHit = checkGrammarError(normalized);
    if (grammarHit) {
      const corr = prof.correction(grammarHit.correct, character);
      return {
        type: 'GENTLE_CORRECTION',
        en: corr.en,
        kr: corr.kr,
        anim: 'hint',
        echoTarget: grammarHit,
        choices: [grammarHit.correct],
        pillar: grammarHit.pillar,
        logTag: `✨ 부드러운 교정 (${prof.nameKr})`
      };
    }

    // Real Gemini 2.5 Flash free conversational reply when API key is configured!
    if (apiKey) {
      const aiReply = await tryGeminiTextReply({
        apiKey, character, roleplay, background, weakExpressions, history, childText: normalized
      });
      if (aiReply && aiReply.en) {
        return {
          type: 'AI_LIVE_REPLY',
          en: aiReply.en,
          kr: aiReply.kr || '',
          anim: aiReply.anim || prof.celebrateAnim,
          particle: prof.particle,
          echoTarget: aiReply.echoTarget
            ? { wrong: trimmed, correct: aiReply.echoTarget, category: 'AI 교정 표현', pillar: aiReply.pillar || 'daily' }
            : null,
          choices: Array.isArray(aiReply.choices) && aiReply.choices.length
            ? aiReply.choices
            : roleplay.beats[beatIndex % roleplay.beats.length].choices,
          pillar: aiReply.pillar || detectPillarFromText(normalized),
          awardStar: !aiReply.echoTarget,
          logTag: `🤖 Gemini 자유 대화 (${prof.nameKr})`
        };
      }
    }

    // Rule 4: Weak Expression Callback every 4th turn
    const unmastered = (weakExpressions || []).filter((w) => !w.mastered);
    if (unmastered.length > 0 && turnCount > 0 && turnCount % 4 === 0) {
      const targetWeak = unmastered[turnCount % unmastered.length];
      const cb = prof.reviewCallback(targetWeak.correct);
      return {
        type: 'WEAK_CALLBACK',
        en: cb.en,
        kr: cb.kr,
        anim: 'wave',
        echoTarget: {
          wrong: targetWeak.wrong, correct: targetWeak.correct,
          category: targetWeak.category, pillar: targetWeak.pillar || 'daily', isReviewCallback: true
        },
        choices: [targetWeak.correct],
        pillar: targetWeak.pillar || 'daily',
        logTag: `🔁 취약 표현 복습 (${prof.nameKr})`
      };
    }

    // Smart Topic-Aware Conversational Reply (Free Talk OR off-script improvisation inside Roleplay!)
    const contextual = buildContextualReply(normalized, character, roleplay, prof, turnCount);
    if (contextual) {
      const accentPrefix = phoneticNotes.length ? `Yay, "${normalized}"! ` : '';
      return {
        type: 'CONVERSATIONAL_REPLY',
        en: `${accentPrefix}${contextual.en}`,
        kr: `[${prof.nameKr} 자유 응답] ${contextual.kr}`,
        anim: prof.celebrateAnim,
        particle: prof.particle,
        choices: contextual.choices,
        pillar: contextual.pillar,
        awardStar: true,
        logTag: roleplay.isFreeTalk ? `💬 자유 토킹 (${prof.nameKr})` : `🎭 즉흥 대화 반응 (${prof.nameKr})`
      };
    }

    // Standard Roleplay progression
    const nextBeatIdx = (beatIndex + 1) % roleplay.beats.length;
    const nextBeat = roleplay.beats[nextBeatIdx];
    const praise = pick(prof.praiseLines, turnCount);
    return {
      type: 'ADVANCE_STORY',
      en: `${character.catchphrase} ${praise} ${prof.beatTwist(nextBeat.en)}`,
      kr: `[${prof.nameKr}] ${nextBeat.kr}`,
      anim: prof.celebrateAnim,
      particle: prof.particle,
      nextBeatIndex: nextBeatIdx,
      choices: nextBeat.choices,
      pillar: detectPillarFromText(normalized) || nextBeat.pillar,
      awardStar: true,
      logTag: `⭐ ${prof.nameKr} 칭찬`
    };
  }

  function getSilenceHint(character, roleplay, beatIndex, awaitingRepeat) {
    const prof = getProfile(character);
    if (awaitingRepeat) {
      const hint = prof.silenceHint(`You can say, "${awaitingRepeat.correct}"`);
      return { en: hint.en, kr: hint.kr, choices: [awaitingRepeat.correct], anim: prof.hintAnim };
    }
    const beat = roleplay.beats[beatIndex % roleplay.beats.length];
    const hint = prof.silenceHint(beat.hintEn);
    return { en: hint.en, kr: `${hint.kr} (${beat.hintKr})`, choices: beat.choices, anim: prof.hintAnim };
  }

  function processPrepMessage({ text, character, roleplay, background, weakExpressions }) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    if (isReportTrigger(trimmed)) return { type: 'TRIGGER_REPORT' };

    if (isDrawRequest(trimmed)) {
      return {
        type: 'GENERATE_ONE_IMAGE',
        roleBadge: '🎨 나노바나나 동화 배경 그림방 (1회 1장)',
        text: `짜잔! Live 시작 전 **${roleplay.titleKr}**를 위한 나노바나나 수채화 배경 **${background.nameKr}** 카드를 1장 준비했어요!\nLive 무대에 들어가면 **${character.nameKr}(${character.nameEn})**가 이 배경 위에서 진짜 영어로 대화해요.`,
        image: {
          src: background.img,
          title: `${background.nameKr} · ${roleplay.titleKr}`,
          caption: background.floorHint,
          timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }
      };
    }

    const pending = (weakExpressions || []).filter((w) => !w.mastered).map((w) => `"${w.correct}"`).join(', ') || '없음';
    return {
      type: 'PARENT_ASSISTANT',
      roleBadge: '👩‍🏫 부모님 AI 비서',
      text: `현재 **${character.nameKr}(${getProfile(character).nameKr})**와 **${roleplay.titleKr}**가 준비되어 있어요!\n• 🔁 자동 복습 예약: ${pending}\n• 🎙️ **엄마·아빠 → 🎙️ Gemini Live**에서 실시간 양방향 음성 대화를 켜면 제미나이 라이브처럼 버튼 없이 자유롭게 대화할 수 있어요!`
    };
  }

  return {
    getProfile,
    compileSystemPrompt,
    isReportTrigger,
    isDrawRequest,
    getOpeningLine,
    previewPersonalityReactions,
    analyzeLiveTranscriptTurn,
    processLiveUtterance,
    getSilenceHint,
    processPrepMessage
  };
})();
