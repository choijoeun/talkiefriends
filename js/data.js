/* ==========================================================================
   TalkieFriends v3 — Nano Banana Bluey & Friends Edition
   Decoupled Watercolor Stage Sets + Modular Articulated Rig Blueprints
   + 5 Domain Roleplays + 5 Personality Reaction Profiles
   ========================================================================== */

window.TFData = (function () {
  // Helper to allow seamless asset resolution in both folder mode & self-contained bundle mode
  function assetUrl(relPath) {
    if (window.TF_INLINE_ASSETS && window.TF_INLINE_ASSETS[relPath]) {
      return window.TF_INLINE_ASSETS[relPath];
    }
    return relPath;
  }

  // 1. 5 Lush Nano Banana Painterly Background Sets (Zero Characters Baked In!)
  const BACKGROUND_SETS = {
    snack_shop: {
      id: 'snack_shop',
      nameKr: '🍜 햇살 놀이방 라면 카페',
      nameEn: 'Sunlit Ramen & Snack Cafe',
      img: './assets/backgrounds/snack_shop.webp',
      floorHint: 'MON~SUN 무지개 달력·김 나는 라면·사과·바나나·햇살 창문이 있는 순수 카페 무대'
    },
    picnic_park: {
      id: 'picnic_park',
      nameKr: '🌸 자카란다 뒷마당 소풍',
      nameEn: 'Jacaranda Backyard Picnic',
      img: './assets/backgrounds/picnic_park.webp',
      floorHint: '보라빛 자카란다 꽃나무와 체크 돗자리·샌드위치 바구니가 펼쳐진 순수 뒷마당 무대'
    },
    animal_clinic: {
      id: 'animal_clinic',
      nameKr: '🏥 파스텔 장난감 동물병원',
      nameEn: 'Pastel Toy Animal Clinic',
      img: './assets/backgrounds/animal_clinic.webp',
      floorHint: '해님 시계·주간 예약표·무지개 반창고·둥근 무지개 러그가 있는 순수 병원 무대'
    },
    cloud_playground: {
      id: 'cloud_playground',
      nameKr: '🌈 노을 무지개 언덕 놀이터',
      nameEn: 'Sunset Rainbow Hill Playground',
      img: './assets/backgrounds/cloud_playground.webp',
      floorHint: '황금빛 노을 무지개와 나무 미끄럼틀·별 풍선이 반짝이는 순수 놀이터 무대'
    },
    phonics_market: {
      id: 'phonics_market',
      nameKr: '🛒 햇살 파닉스 보물 마켓',
      nameEn: 'Sunny Phonics Village Market',
      img: './assets/backgrounds/phonics_market.webp',
      floorHint: 'A~Z 파닉스 블록·사과·바나나 가판대와 만국기가 걸린 순수 마켓 무대'
    }
  };

  // 2. 5 Personality Reaction Profiles
  const PERSONALITY_PROFILES = {
    playful_bouncy: {
      id: 'playful_bouncy',
      nameKr: '🎉 장난꾸러기·발랄형',
      summaryKr: '상상놀이 대장! 통통 튀는 에너지와 웃음 가득한 리액션으로 영어를 신나게 이끌어요 (블루이 스타일)',
      particle: '✨',
      idleAnim: 'idle-bouncy',
      celebrateAnim: 'celebrate',
      hintAnim: 'wave',
      greetPrefix: (ch) => `Hooray! Hi friend, I'm ${ch.nameEn}! Ready to play a super fun game?`,
      praiseLines: [
        'For real life?! That was AWESOME!',
        'Woohoo! High five! You are a superstar!',
        'Hehe, hooray! You nailed it!'
      ],
      pauseLine: 'Ooh, thinking brain is warming up! Take your time! What happened next?',
      pauseKr: '우와, 반짝반짝 생각 중이구나! 천천히 말해 줘~ 그다음엔 어떻게 됐을까?',
      correction: (c) => ({
        en: `Hehe, awesome idea! Let's bounce the magic sentence: "${c}" Your turn to say "${c}"!`,
        kr: `[🎉 장난꾸러기·발랄형 교정] 즐거운 리듬 놀이처럼 "${c}"를 신나게 따라 말하게 이끌어요.`
      }),
      koreanBridge: (en) => ({
        en: `Ooh-la-la! In our English game, we jump and say, "${en}" Wanna say "${en}" with me?`,
        kr: `[🎉 장난꾸러기·발랄형 전환] 영어 놀이 암호처럼 유쾌하게 "${en}"으로 전환해 줘요.`
      }),
      silenceHint: (h) => ({
        en: `Peek-a-boo! I'm wiggling my paws! ${h}`,
        kr: '[🎉 장난꾸러기·발랄형 4.5초 힌트] 까꿍 놀이하듯 손을 흔들며 즐겁게 선택지를 제안해요.'
      }),
      reviewCallback: (p) => ({
        en: `Psst! Bonus game round! Can you shout our magic phrase "${p}"?`,
        kr: `[🎉 장난꾸러기·발랄형 복습] 깜짝 보너스 라운드로 "${p}"를 신나게 복습해요.`
      }),
      beatTwist: (e) => `Ooh, look! ${e}`
    },

    sweet_warm: {
      id: 'sweet_warm',
      nameKr: '💖 다정·감성형',
      summaryKr: '포근하고 다정한 말투, 섬세한 공감과 따뜻한 칭찬으로 아이의 자신감을 키워요 (빙고 스타일)',
      particle: '💖',
      idleAnim: 'idle-sweet',
      celebrateAnim: 'celebrate',
      hintAnim: 'hint',
      greetPrefix: (ch) => `Aww, hello sweet friend! I'm ${ch.nameEn}! Let's play gently together!`,
      praiseLines: [
        'Aww, my heart is so happy! You did wonderfully!',
        'Yay! Giving you a big warm fluffy hug!',
        'Ooh, that was so sweet and clear!'
      ],
      pauseLine: "Take your time, sweet friend! I'm right here listening. What happened next?",
      pauseKr: '괜찮아, 천천히 생각해도 돼! 다정하게 기다리고 있어. 그다음엔 어떻게 됐을까?',
      correction: (c) => ({
        en: `Aww, lovely idea! Let's say it softly together: "${c}" Can you try "${c}"?`,
        kr: `[💖 다정·감성형 교정] 따뜻한 공감으로 부담 없이 "${c}"를 따라 말하게 도와줘요.`
      }),
      koreanBridge: (en, kr) => ({
        en: `Aww, I love that! For "${kr}", we can gently say, "${en}" Can you say "${en}" with me?`,
        kr: `[💖 다정·감성형 전환] 아이 마음을 먼저 공감한 뒤 다정하게 "${en}"을 들려줘요.`
      }),
      silenceHint: (h) => ({
        en: `No rush, sweetie! Hold my paw—${h}`,
        kr: '[💖 다정·감성형 4.5초 힌트] 조급하지 않게 손을 잡아주듯 다정한 선택지를 건네요.'
      }),
      reviewCallback: (p) => ({
        en: `Sweet friend, do you remember our special cozy phrase "${p}"? Let's say it together!`,
        kr: `[💖 다정·감성형 복습] 포근한 마법 문장처럼 다정하게 "${p}" 복습을 제안해요.`
      }),
      beatTwist: (e) => e
    },

    brave_hero: {
      id: 'brave_hero',
      nameKr: '⚡ 씩씩·히어로형',
      summaryKr: '용감한 구조·미션 대장 콘셉트! 성취감과 팀워크를 끌어올리는 씩씩한 리액션 (러스티 스타일)',
      particle: '⚡',
      idleAnim: 'idle-hero',
      celebrateAnim: 'salute',
      hintAnim: 'hint',
      greetPrefix: (ch) => `Hero ${ch.nameEn} reporting for duty! Ready for our mission, Partner?`,
      praiseLines: [
        'Mission success, Partner! Awesome teamwork!',
        'Boom! Star badge power! High five!',
        'You are the bravest English hero ever!'
      ],
      pauseLine: 'Hold steady, Partner! Every hero thinks carefully! Take your time—what happens next?',
      pauseKr: '침착해 파트너! 영웅은 천천히 생각하는 법이지! 그다음엔 뭐야?',
      correction: (c) => ({
        en: `Awesome plan, Partner! Power-up code check: "${c}" Say "${c}" to boost our star badge!`,
        kr: `[⚡ 씩씩·히어로형 교정] "파워업 영어 암호"로 "${c}"를 씩씩하게 외치게 해요!`
      }),
      koreanBridge: (en, kr) => ({
        en: `Roger that! Our English hero code for "${kr}" is "${en}" Say the code, Partner!`,
        kr: `[⚡ 씩씩·히어로형 전환] 한국어 뜻을 "히어로 영어 암호"로 바꿔 신나게 유도해요.`
      }),
      silenceHint: (h) => ({
        en: `Mission radio hint incoming, Partner! ${h}`,
        kr: '[⚡ 씩씩·히어로형 4.5초 힌트] 구조 본부 무전처럼 재밌는 미션 힌트를 보내줘요.'
      }),
      reviewCallback: (p) => ({
        en: `Alert, Partner! To open the secret gate, let's say our hero phrase: "${p}"!`,
        kr: `[⚡ 씩씩·히어로형 복습] 비밀 문을 여는 히어로 암호로 "${p}"를 복습해요.`
      }),
      beatTwist: (e) => `Mission time! ${e}`
    },

    calm_gentle: {
      id: 'calm_gentle',
      nameKr: '🌙 차분·저자극형',
      summaryKr: '느리고 포근한 템포! 말문이 아직 트이지 않았거나 차분한 분위기를 좋아하는 6~7세 맞춤 (코코 스타일)',
      particle: '🌸',
      idleAnim: 'idle-calm',
      celebrateAnim: 'wave',
      hintAnim: 'hint',
      greetPrefix: (ch) => `Hello, dear friend. I'm ${ch.nameEn}. Let's have a calm, happy playtime.`,
      praiseLines: [
        'That was so clear and gentle. Well done!',
        'Wonderful job. I am so proud of you.',
        'Soft smile! You spoke so nicely.'
      ],
      pauseLine: 'Take all the time you need. No hurry at all. What happens next?',
      pauseKr: '서두르지 않아도 괜찮아. 천천히 숨 고르고 이어서 말해 볼까?',
      correction: (c) => ({
        en: `Thank you for sharing. Slowly together: "${c}" Can you say "${c}"?`,
        kr: `[🌙 차분·저자극형 교정] 자극 없이 편안한 톤으로 천천히 "${c}"를 따라 말해요.`
      }),
      koreanBridge: (en) => ({
        en: `I understand you. In English, we softly say, "${en}" Let's try it slowly: "${en}"`,
        kr: `[🌙 차분·저자극형 전환] 아이 말을 차분히 수용하고 부담 없이 "${en}"을 들려줘요.`
      }),
      silenceHint: (h) => ({
        en: `It is totally okay to pause. ${h}`,
        kr: '[🌙 차분·저자극형 4.5초 힌트] 침묵을 안심시켜 주며 쉬운 문장을 건네요.'
      }),
      reviewCallback: (p) => ({
        en: `Let's gently practice our cozy phrase again: "${p}" Take your time.`,
        kr: `[🌙 차분·저자극형 복습] 편안한 분위기에서 "${p}"를 차분히 다시 익혀요.`
      }),
      beatTwist: (e) => e
    },

    curious_explorer: {
      id: 'curious_explorer',
      nameKr: '🔍 호기심·탐험가형',
      summaryKr: '관찰하고 발견하는 탐험 말투! 숫자·달력·날씨·파닉스 단서를 함께 찾는 스타일 (마일로 스타일)',
      particle: '🌟',
      idleAnim: 'idle-curious',
      celebrateAnim: 'celebrate',
      hintAnim: 'hint',
      greetPrefix: (ch) => `Whoa! Hi explorer friend! I'm ${ch.nameEn}! Let's discover clues together!`,
      praiseLines: [
        'Whoa, what a brilliant discovery!',
        'Amazing clue! Let\'s note it in our explorer journal!',
        'Super sharp eyes, Explorer!'
      ],
      pauseLine: 'Hmm, checking our trail map! Take your time, Explorer! What clue did you spot next?',
      pauseKr: '흠, 탐험 지도를 보는 중이구나! 천천히 생각해도 좋아. 다음 단서는 뭘까?',
      correction: (c) => ({
        en: `Whoa, great clue! Explorers say it like this: "${c}" Let's test that clue out loud!`,
        kr: `[🔍 호기심·탐험가형 교정] 아이 답을 "멋진 단서"로 칭찬하고 "${c}"를 실험해 보게 해요.`
      }),
      koreanBridge: (en) => ({
        en: `Aha, I found it on the map! In English, explorers say, "${en}" Can you say "${en}"?`,
        kr: `[🔍 호기심·탐험가형 전환] 탐험 지도에서 영어 단어를 찾은 것처럼 "${en}"을 이끌어 내요.`
      }),
      silenceHint: (h) => ({
        en: `Hmm, my compass is spinning! Here is a clue: ${h}`,
        kr: '[🔍 호기심·탐험가형 4.5초 힌트] 나침반 힌트처럼 호기심을 자극하며 선택지를 줘요.'
      }),
      reviewCallback: (p) => ({
        en: `Wait! Look at our treasure map—we spotted "${p}" again! Can you read the clue aloud?`,
        kr: `[🔍 호기심·탐험가형 복습] 보물 지도에서 다시 발견한 단서로 "${p}"를 복습해요.`
      }),
      beatTwist: (e) => `Whoa, look closely! ${e}`
    }
  };

  // 3. Verified 260x320 Skeletal Part Layouts for all 5 Nano Banana Rig Sets!
  const RIG_PRESETS = {
    bluey: {
      label: '블루이 파츠 (파란 힐러)',
      headIdle: './assets/rigs/bluey/head_idle.webp',
      headTalk: './assets/rigs/bluey/head_talk.webp',
      body: './assets/rigs/bluey/body.webp',
      armL: './assets/rigs/bluey/arm_l.webp',
      armR: './assets/rigs/bluey/arm_r.webp',
      tail: './assets/rigs/bluey/tail.webp',
      box: {
        tail:  { x: 18, y: 178, w: 86, h: 56, px: 90, py: 204 },
        armR:  { x: 152, y: 122, w: 82, h: 62, px: 162, py: 154 },
        body:  { x: 80, y: 136, w: 102, h: 152, px: 130, py: 210 },
        armL:  { x: 60, y: 146, w: 52, h: 96, px: 96, py: 160 },
        head:  { x: 74, y: 20, w: 128, h: 158, px: 130, py: 156 }
      }
    },
    bingo: {
      label: '빙고 파츠 (주황 힐러)',
      headIdle: './assets/rigs/bingo/head_idle.webp',
      headTalk: './assets/rigs/bingo/head_talk.webp',
      body: './assets/rigs/bingo/body.webp',
      armL: './assets/rigs/bingo/arm_l.webp',
      armR: './assets/rigs/bingo/arm_r.webp',
      tail: './assets/rigs/bingo/tail.webp',
      box: {
        tail:  { x: 20, y: 176, w: 82, h: 64, px: 90, py: 204 },
        armR:  { x: 152, y: 122, w: 80, h: 62, px: 162, py: 154 },
        body:  { x: 80, y: 136, w: 102, h: 152, px: 130, py: 210 },
        armL:  { x: 60, y: 146, w: 52, h: 96, px: 96, py: 160 },
        head:  { x: 78, y: 22, w: 116, h: 158, px: 130, py: 156 }
      }
    },
    rusty: {
      label: '러스티 파츠 (별배지 히어로)',
      headIdle: './assets/rigs/rusty/head_idle.webp',
      headTalk: './assets/rigs/rusty/head_talk.webp',
      body: './assets/rigs/rusty/body.webp',
      armL: './assets/rigs/rusty/arm_l.webp',
      armR: './assets/rigs/rusty/arm_r.webp',
      tail: './assets/rigs/rusty/tail.webp',
      box: {
        tail:  { x: 22, y: 176, w: 82, h: 62, px: 92, py: 204 },
        armR:  { x: 150, y: 122, w: 80, h: 60, px: 160, py: 152 },
        body:  { x: 84, y: 136, w: 92, h: 154, px: 130, py: 210 },
        armL:  { x: 62, y: 148, w: 50, h: 96, px: 96, py: 160 },
        head:  { x: 76, y: 20, w: 118, h: 154, px: 130, py: 154 }
      }
    },
    coco: {
      label: '코코 파츠 (핑크 푸들)',
      headIdle: './assets/rigs/coco/head_idle.webp',
      headTalk: './assets/rigs/coco/head_talk.webp',
      body: './assets/rigs/coco/body.webp',
      armL: './assets/rigs/coco/arm_l.webp',
      armR: './assets/rigs/coco/arm_r.webp',
      tail: './assets/rigs/coco/tail.webp',
      box: {
        tail:  { x: 24, y: 174, w: 62, h: 74, px: 78, py: 206 },
        armR:  { x: 156, y: 114, w: 82, h: 74, px: 166, py: 154 },
        body:  { x: 76, y: 134, w: 110, h: 150, px: 130, py: 210 },
        armL:  { x: 56, y: 146, w: 54, h: 98, px: 94, py: 160 },
        head:  { x: 58, y: 20, w: 152, h: 140, px: 130, py: 148 }
      }
    },
    milo: {
      label: '마일로 파츠 (스카프 탐험가)',
      headIdle: './assets/rigs/milo/head_idle.webp',
      headTalk: './assets/rigs/milo/head_talk.webp',
      body: './assets/rigs/milo/body.webp',
      armL: './assets/rigs/milo/arm_l.webp',
      armR: './assets/rigs/milo/arm_r.webp',
      tail: './assets/rigs/milo/tail.webp',
      box: {
        tail:  { x: 24, y: 162, w: 76, h: 86, px: 90, py: 206 },
        armR:  { x: 154, y: 120, w: 80, h: 66, px: 164, py: 152 },
        body:  { x: 82, y: 134, w: 100, h: 152, px: 130, py: 210 },
        armL:  { x: 62, y: 148, w: 48, h: 94, px: 96, py: 160 },
        head:  { x: 62, y: 30, w: 146, h: 122, px: 130, py: 144 }
      }
    }
  };

  const makeAdj = () => ({
    head: { scale: 1 },
    body: { scale: 1 },
    leftHand: { scale: 1 },
    rightHand: { scale: 1 },
    backProp: { scale: 1 }
  });
  const makeCustom = () => ({ head: null, headTalk: null, body: null, leftHand: null, rightHand: null, backProp: null });

  // 4. 5 Default Characters led by Bluey & Bingo from user's uploaded image!
  const DEFAULT_CHARACTERS = [
    {
      id: 'bluey',
      nameKr: '블루이',
      nameEn: 'Bluey',
      archetype: '상상력 넘치는 파란 힐러 강아지',
      personality: 'playful_bouncy',
      favRoleplay: 'snack_shop',
      geminiVoice: 'Puck',
      pitch: 1.18,
      rate: 0.89,
      catchphrase: 'Hooray! For real life!',
      isBuiltIn: true,
      rig: {
        headPreset: 'bluey', bodyPreset: 'bluey', leftHandPreset: 'bluey', rightHandPreset: 'bluey', tailPreset: 'bluey',
        accessory: 'none',
        customParts: makeCustom(),
        partAdjust: makeAdj()
      }
    },
    {
      id: 'bingo',
      nameKr: '빙고',
      nameEn: 'Bingo',
      archetype: '다정하고 섬세한 주황 힐러 강아지',
      personality: 'sweet_warm',
      favRoleplay: 'picnic_calendar',
      geminiVoice: 'Aoede',
      pitch: 1.24,
      rate: 0.86,
      catchphrase: 'Aww, hooray!',
      isBuiltIn: true,
      rig: {
        headPreset: 'bingo', bodyPreset: 'bingo', leftHandPreset: 'bingo', rightHandPreset: 'bingo', tailPreset: 'bingo',
        accessory: 'none',
        customParts: makeCustom(),
        partAdjust: makeAdj()
      }
    },
    {
      id: 'rusty',
      nameKr: '러스티',
      nameEn: 'Rusty',
      archetype: '씩씩한 별배지 구조대 강아지',
      personality: 'brave_hero',
      favRoleplay: 'animal_clinic',
      geminiVoice: 'Fenrir',
      pitch: 0.98,
      rate: 0.9,
      catchphrase: 'Roger that, Partner!',
      isBuiltIn: true,
      rig: {
        headPreset: 'rusty', bodyPreset: 'rusty', leftHandPreset: 'rusty', rightHandPreset: 'rusty', tailPreset: 'rusty',
        accessory: 'none',
        customParts: makeCustom(),
        partAdjust: makeAdj()
      }
    },
    {
      id: 'coco',
      nameKr: '코코',
      nameEn: 'Coco',
      archetype: '포근하고 차분한 핑크 푸들 친구',
      personality: 'calm_gentle',
      favRoleplay: 'cloud_playground',
      geminiVoice: 'Kore',
      pitch: 1.15,
      rate: 0.84,
      catchphrase: 'Lovely and sweet!',
      isBuiltIn: true,
      rig: {
        headPreset: 'coco', bodyPreset: 'coco', leftHandPreset: 'coco', rightHandPreset: 'coco', tailPreset: 'coco',
        accessory: 'none',
        customParts: makeCustom(),
        partAdjust: makeAdj()
      }
    },
    {
      id: 'milo',
      nameKr: '마일로',
      nameEn: 'Milo',
      archetype: '호기심 가득한 스카프 탐험가 강아지',
      personality: 'curious_explorer',
      favRoleplay: 'phonics_market',
      geminiVoice: 'Zephyr',
      pitch: 1.04,
      rate: 0.87,
      catchphrase: 'Whoa, cool clue!',
      isBuiltIn: true,
      rig: {
        headPreset: 'milo', bodyPreset: 'milo', leftHandPreset: 'milo', rightHandPreset: 'milo', tailPreset: 'milo',
        accessory: 'none',
        customParts: makeCustom(),
        partAdjust: makeAdj()
      }
    }
  ];

  // 5. Free Talk + 5 Domain-Specific Roleplays (Rule 3)
  const ROLEPLAY_DOMAINS = {
    free_talk: {
      id: 'free_talk',
      isFreeTalk: true,
      titleKr: '💬 자유 토킹 (아무 얘기나 해봐!)',
      titleEn: 'Open Free Talk',
      areaBadge: '롤플레이 없이 자유 수다 · 상상 대화',
      defaultBgId: 'picnic_park',
      curriculumFocus: '정해진 대본 없이 아이가 하고 싶은 일상·공룡·유치원·가족·좋아하는 음식 이야기를 자유롭게 영어로 주고받기',
      keyVocab: ['I like...', 'I feel happy', 'Today', 'My favorite...', 'What about you?', 'Please', 'Thank you'],
      beats: [
        {
          pillar: 'daily',
          en: "We can talk about anything you want today! What did you do today, or what is your favorite thing?",
          kr: '오늘은 정해진 놀이 없이 하고 싶은 이야기를 마음껏 해 보자! 오늘 뭐 했어, 아니면 제일 좋아하는 게 뭐야?',
          choices: ['I like dinosaurs!', 'I feel happy today!', "Let's talk about pizza!"],
          hintEn: "Do you want to talk about yummy food or cool animals? You can say, 'I like dinosaurs!'",
          hintKr: "맛있는 음식 얘기할까, 동물 얘기할까? 'I like dinosaurs!'라고 말해 볼까?"
        },
        {
          pillar: 'daily',
          en: "Ooh, tell me more! What is your favorite color or favorite snack?",
          kr: '우와, 더 들려줘! 제일 좋아하는 색깔이나 간식이 뭐야?',
          choices: ['I like blue!', 'I like ice cream!', 'What do you like?'],
          hintEn: "Do you like ice cream or cake? You can say, 'I like ice cream!'",
          hintKr: "아이스크림이 좋아, 케이크가 좋아? 'I like ice cream!'이라고 해 볼래?"
        },
        {
          pillar: 'calendar',
          en: "Fun! What day of the week do you love playing the most — Saturday or Sunday?",
          kr: '재밌다! 일주일 중에 놀기 제일 좋은 요일은 토요일이야, 일요일이야?',
          choices: ['I love Saturday!', 'I love Sunday!', 'My birthday is soon!'],
          hintEn: "Saturday or Sunday? You can say, 'I love Saturday!'",
          hintKr: "'I love Saturday!'라고 말해 보자!"
        }
      ]
    },
    snack_shop: {
      id: 'snack_shop',
      titleKr: '🍜 가게·주문 역할극',
      titleEn: 'Sunlit Ramen & Snack Cafe',
      areaBadge: '일상 회화 · 숫자 · 부탁(Please)',
      defaultBgId: 'snack_shop',
      curriculumFocus: '가게 영업 요일 묻기, 숫자 세기(1~20), 셀 수 없는 명사(some ramen), 부탁·감사 매너',
      keyVocab: ['some ramen', 'apple', 'banana', 'three', 'five', 'Monday', 'Saturday', 'please', 'Thank you'],
      beats: [
        {
          pillar: 'manners',
          en: 'Welcome to our Ramen Cafe! Nice to meet you! Do you want an apple or a banana first?',
          kr: '라면 카페에 어서 와! 만나서 반가워! 사과랑 바나나 중에 뭐부터 먹을까?',
          choices: ['An apple, please!', 'A banana, please!', "Let's have some ramen!"],
          hintEn: "Do you want an apple or a banana? You can say, 'An apple, please!'",
          hintKr: "'An apple, please!'라고 말해 볼까?"
        },
        {
          pillar: 'daily',
          en: "Yummy! Let's count our ramen bowls on the counter. How many bowls do we need — three or five?",
          kr: '맛있겠다! 카운터 위 라면 그릇을 세어 보자. 3개 필요할까, 5개 필요할까?',
          choices: ['Three bowls, please!', 'Five bowls!', 'One, two, three!'],
          hintEn: "Three or five? You can say, 'Three bowls!'",
          hintKr: "'Three bowls!'라고 말해 볼래?"
        },
        {
          pillar: 'calendar',
          en: 'Look at our rainbow wall calendar! Which day should our cafe open — Monday or Saturday?',
          kr: '벽에 걸린 무지개 달력을 봐! 우리 카페는 월요일에 열까, 토요일에 열까?',
          choices: ['On Monday!', 'On Saturday!', 'Every Sunday!'],
          hintEn: "Monday or Saturday? You can say, 'On Saturday!'",
          hintKr: "'On Saturday!'라고 말해 봐!"
        },
        {
          pillar: 'manners',
          en: "Look! A friend wants a strawberry cupcake too! Should we say, 'Let's share!'?",
          kr: '어! 친구도 딸기 컵케이크가 먹고 싶대! "같이 나눠 먹자(Let\'s share!)"라고 말해 줄까?',
          choices: ["Yes! Let's share!", 'Here you go!', 'Thank you!'],
          hintEn: "You can say, 'Let's share!'",
          hintKr: "'Let's share!'라고 따뜻하게 말해 볼까?"
        }
      ]
    },
    picnic_calendar: {
      id: 'picnic_calendar',
      titleKr: '🌸 달력·소풍 역할극',
      titleEn: 'Jacaranda Backyard Picnic',
      areaBadge: '시간·달력(요일·날짜·달) · 날씨 · 감정',
      defaultBgId: 'picnic_park',
      curriculumFocus: '소풍 날짜(May/October, 5th), 요일(Sunday), 날씨 표현(sunny/windy/rainy), 감정 표현',
      keyVocab: ['May', 'October', 'Sunday', 'May 5th', 'sunny', 'windy', 'happy', 'excited'],
      beats: [
        {
          pillar: 'daily',
          en: 'We are on our checkered blanket under the purple tree! How do you feel — happy or excited?',
          kr: '보라꽃 나무 아래 체크 돗자리에 앉았어! 지금 기분이 어때? 행복해, 신나?',
          choices: ['I feel happy!', 'I am excited!', 'I am hungry!'],
          hintEn: "Happy or excited? You can say, 'I feel happy!'",
          hintKr: "'I feel happy!'라고 말해 볼까?"
        },
        {
          pillar: 'calendar',
          en: "Let's plan our next backyard picnic month! Do you like May or October better?",
          kr: '다음 뒷마당 소풍은 몇 월에 갈까? 5월(May)이 좋아, 10월(October)이 좋아?',
          choices: ['I like May!', 'October, please!', 'On May 5th!'],
          hintEn: "May or October? You can say, 'I like May!'",
          hintKr: "'I like May!'라고 말해 봐!"
        },
        {
          pillar: 'daily',
          en: 'Look at the glowing sunlight! Is the weather sunny or rainy today?',
          kr: '반짝이는 햇살을 봐! 오늘 날씨가 맑아(sunny), 비가 와(rainy)?',
          choices: ["It's sunny!", "It's windy!", "It's rainy!"],
          hintEn: "Sunny or rainy? You can say, 'It is sunny!'",
          hintKr: "'It is sunny!'라고 해 볼까?"
        },
        {
          pillar: 'manners',
          en: "Oops, I bumped your sandwich plate! I'm sorry! What can a kind friend say?",
          kr: '앗, 실수로 샌드위치 접시를 쳤어! 미안해! 착한 친구는 뭐라고 대답할까?',
          choices: ["It's okay!", "Let's share!", 'Thank you!'],
          hintEn: "You can say, 'It's okay!'",
          hintKr: "'괜찮아(It's okay!)'라고 말해 볼까?"
        }
      ]
    },
    animal_clinic: {
      id: 'animal_clinic',
      titleKr: '🏥 동물병원·예약 역할극',
      titleEn: 'Pastel Toy Animal Clinic',
      areaBadge: '병원 예약(요일·날짜) · 사과 · 차례 지키기',
      defaultBgId: 'animal_clinic',
      curriculumFocus: '병원 예약 요일(Tuesday/Friday), 반창고 숫자 세기, 차례 지키기(Your turn, my turn), 감사·사과',
      keyVocab: ['Tuesday', 'Friday', 'two bandages', 'ten', 'Your turn, my turn', "I'm sorry", 'Thank you'],
      beats: [
        {
          pillar: 'calendar',
          en: 'Welcome to our Toy Clinic! Look at the appointment board. Should Teddy visit on Tuesday or Friday?',
          kr: '장난감 동물병원에 어서 와! 예약판을 보자. 곰돌이는 화요일에 올까, 금요일에 올까?',
          choices: ['On Tuesday!', 'On Friday!', 'On Wednesday!'],
          hintEn: "Tuesday or Friday? You can say, 'On Tuesday!'",
          hintKr: "'On Tuesday!'라고 말해 보자!"
        },
        {
          pillar: 'daily',
          en: "Great booking! Look at the rainbow bandages on the shelf. Do we need two or ten bandages?",
          kr: '예약 완료! 선반 위 무지개 반창고를 봐. 2개가 필요할까, 10개가 필요할까?',
          choices: ['Two bandages, please!', 'Ten bandages!', 'One, two!'],
          hintEn: "Two or ten? You can say, 'Two bandages, please!'",
          hintKr: "'Two bandages, please!'라고 해 봐!"
        },
        {
          pillar: 'manners',
          en: "Let's take turns using the stethoscope! Can you say, 'Your turn, my turn'?",
          kr: '청진기를 번갈아 가며 써 보자! "네 차례, 내 차례(Your turn, my turn)" 말해 볼까?',
          choices: ['Your turn, my turn!', "It's my turn!", 'Thank you!'],
          hintEn: "You can say, 'Your turn, my turn!'",
          hintKr: "'Your turn, my turn!'이라고 따라 해 봐!"
        },
        {
          pillar: 'daily',
          en: 'All better! How does Teddy feel now — sleepy or happy?',
          kr: '이제 다 나았대! 곰돌이 기분이 어떨까? 졸릴까, 행복할까?',
          choices: ['He is happy!', 'I feel happy!', 'Good job!'],
          hintEn: "Sleepy or happy? You can say, 'He is happy!'",
          hintKr: "'He is happy!'라고 말해 볼까?"
        }
      ]
    },
    cloud_playground: {
      id: 'cloud_playground',
      titleKr: '🌈 언덕 놀이터·매너 역할극',
      titleEn: 'Sunset Rainbow Hill Playground',
      areaBadge: '인성·기본 매너(인사·차례·나누기) · 감정',
      defaultBgId: 'cloud_playground',
      curriculumFocus: '처음 만나는 인사(Nice to meet you), 미끄럼틀 차례 지키기, 별 풍선 나누기, 감사와 사과',
      keyVocab: ['Nice to meet you', 'Your turn, my turn', "Let's share", 'Thank you', 'Please', 'six', 'happy'],
      beats: [
        {
          pillar: 'manners',
          en: "Welcome to Rainbow Hill Playground! A new puppy friend is here. Let's say, 'Nice to meet you!'",
          kr: '무지개 언덕 놀이터에 어서 와! 새 친구가 왔어. "만나서 반가워!" 하고 인사할까?',
          choices: ['Nice to meet you!', 'Hello, friend!', 'I feel happy!'],
          hintEn: "You can say, 'Nice to meet you!'",
          hintKr: "'Nice to meet you!'라고 반갑게 인사해 볼까?"
        },
        {
          pillar: 'manners',
          en: "Look at the wooden slide! Who goes first? Let's say, 'Your turn, my turn!'",
          kr: '저 나무 미끄럼틀 봐! 차례를 지키며 "네 차례, 내 차례!" 말해 보자!',
          choices: ['Your turn, my turn!', 'You go first!', "It's my turn!"],
          hintEn: "You can say, 'Your turn, my turn!'",
          hintKr: "'Your turn, my turn!'이라고 말해 봐!"
        },
        {
          pillar: 'daily',
          en: 'Count the star and moon balloons! Do you see six or eight balloons?',
          kr: '별과 달 풍선을 세어 볼까? 6개 보일까, 8개 보일까?',
          choices: ['Six balloons!', 'Eight balloons!', 'One, two, three!'],
          hintEn: "Six or eight? You can say, 'Six balloons!'",
          hintKr: "'Six balloons!'라고 세어 볼까?"
        },
        {
          pillar: 'manners',
          en: "Let's share a shiny star balloon with our friend! Should we say, 'Let's share!'?",
          kr: '반짝이는 별 풍선을 친구랑 나눠 가질까? "같이 나누자!"라고 말해 보자!',
          choices: ["Let's share!", 'Thank you!', 'Yes, please!'],
          hintEn: "You can say, 'Let's share!'",
          hintKr: "'Let's share!'라고 따뜻하게 말해 볼래?"
        }
      ]
    },
    phonics_market: {
      id: 'phonics_market',
      titleKr: '🛒 파닉스 보물 마켓 역할극',
      titleEn: 'Sunny Phonics Village Market',
      areaBadge: '알파벳 파닉스 · 숫자 1~20 · 쇼핑 회화',
      defaultBgId: 'phonics_market',
      curriculumFocus: '파닉스(A-Apple, B-Banana, C-Car), 숫자 세기(1~20), 정중한 요청(Can I have... please?)',
      keyVocab: ['A is for Apple', 'B is for Banana', 'four', 'seven', 'Thursday', 'Sunday', 'Thank you'],
      beats: [
        {
          pillar: 'daily',
          en: 'Welcome to Phonics Market! Look at the A-B-C blocks! Do you pick an Apple or a Banana?',
          kr: '파닉스 마켓에 어서 와! A-B-C 블록을 봐! 사과(Apple)랑 바나나(Banana) 중에 뭘 고를래?',
          choices: ['A is for Apple!', 'B is for Banana!', 'An apple, please!'],
          hintEn: "A is for Apple! You can say, 'A is for Apple!'",
          hintKr: "'A is for Apple!'이라고 말해 볼까?"
        },
        {
          pillar: 'daily',
          en: 'Look at the fruit baskets! How many bananas should we buy — four or seven?',
          kr: '과일 바구니에 바나나를 몇 개 살까? 4개일까, 7개일까?',
          choices: ['Four bananas, please!', 'Seven bananas!', 'One, two, three, four!'],
          hintEn: "Four or seven? You can say, 'Four bananas, please!'",
          hintKr: "'Four bananas, please!'라고 말해 봐!"
        },
        {
          pillar: 'calendar',
          en: 'Our Sunday market opens on special days! Should we visit again on Thursday or Sunday?',
          kr: '우리 마을 마켓은 특별한 날에 열려! 목요일에 다시 올까, 일요일에 올까?',
          choices: ['On Thursday!', 'On Sunday!', 'On Saturday!'],
          hintEn: "Thursday or Sunday? You can say, 'On Sunday!'",
          hintKr: "'On Sunday!'라고 말해 볼까?"
        },
        {
          pillar: 'manners',
          en: 'You found colorful A-B-C treasure blocks! What polite magic word do we say?',
          kr: '알록달록 A-B-C 보물 블록을 찾았어! 가게 주인에게 어떤 매너 말을 할까?',
          choices: ['Thank you!', 'Please!', 'Nice to meet you!'],
          hintEn: "You can say, 'Thank you!'",
          hintKr: "'Thank you!'라고 인사해 보자!"
        }
      ]
    }
  };

  const INITIAL_WEAK_EXPRESSIONS = [
    { id: 'w1', wrong: "Let's have a ramen.", correct: "Let's have some ramen.", category: '셀 수 없는 명사 (some)', pillar: 'daily', reviewCount: 1, mastered: false, source: '어제 수업' },
    { id: 'w2', wrong: 'I hungry.', correct: 'I am hungry.', category: 'be동사 (I am + 감정)', pillar: 'daily', reviewCount: 0, mastered: false, source: '그제 수업' },
    { id: 'w3', wrong: 'Give me apple.', correct: 'An apple, please!', category: '부탁하는 매너 (please)', pillar: 'manners', reviewCount: 1, mastered: false, source: '어제 수업' }
  ];

  const PHONETIC_MAP = [
    { pattern: /\b(lamen|ramyeon|lamyeon)\b/gi, target: 'ramen', note: '발음 보정 (lamen → ramen)' },
    { pattern: /\b(banna|banan|panana)\b/gi, target: 'banana', note: '발음 보정 (banna → banana)' },
    { pattern: /\b(epple|apul|aple)\b/gi, target: 'apple', note: '발음 보정 (epple → apple)' },
    { pattern: /\b(tenk you|sank you|tank you)\b/gi, target: 'thank you', note: '발음 보정 (thank you)' },
    { pattern: /\b(sory|solly)\b/gi, target: 'sorry', note: '발음 보정 (sorry)' },
    { pattern: /\b(fibe|paive|pive)\b/gi, target: 'five', note: '발음 보정 (five)' },
    { pattern: /\b(suni|sonny)\b/gi, target: 'sunny', note: '발음 보정 (sunny)' },
    { pattern: /\b(heppy|hapi)\b/gi, target: 'happy', note: '발음 보정 (happy)' }
  ];

  const GRAMMAR_PATTERNS = [
    { regex: /let'?s\s+have\s+a\s+ramen/i, correct: "Let's have some ramen.", category: '셀 수 없는 명사 (a ramen → some ramen)', pillar: 'daily' },
    { regex: /\ba\s+ramen\b/i, correct: 'some ramen', category: '셀 수 없는 명사 (some)', pillar: 'daily' },
    { regex: /\ba\s+water\b/i, correct: 'some water, please', category: '셀 수 없는 명사 (some water)', pillar: 'manners' },
    { regex: /\bi\s+(hungry|happy|excited|sleepy|sad|ready)\b/i, correct: (m) => `I am ${m[1].toLowerCase()}.`, category: 'be동사 빠짐 (I am + 감정)', pillar: 'daily' },
    { regex: /\bi\s+am\s+like\s+([a-z\s]+)/i, correct: (m) => `I like ${m[1].trim().replace(/[.!?]+$/, '')}.`, category: '동사 중복 (I like)', pillar: 'daily' },
    { regex: /\b(two|three|four|five|six|seven|eight|ten)\s+(apple|banana|cup|cupcake|bowl|bandage|balloon)\b(?!s)/i, correct: (m) => `${m[1][0].toUpperCase() + m[1].slice(1)} ${m[2].toLowerCase()}s, please!`, category: '복수형 -s', pillar: 'daily' },
    { regex: /\bgive\s+me\s+([a-z\s]+)/i, correct: (m) => `Can I have ${m[1].trim().replace(/[.!?]+$/, '')}, please?`, category: '부탁 매너 (please)', pillar: 'manners' },
    { regex: /\bit'?s\s+rain\b/i, correct: "It's rainy.", category: '날씨 형용사 (rainy)', pillar: 'daily' },
    { regex: /\bit'?s\s+sun\b/i, correct: "It's sunny.", category: '날씨 형용사 (sunny)', pillar: 'daily' }
  ];

  const KOREAN_TO_ENGLISH = [
    { keys: ['공룡', '티라노'], en: 'I love dinosaurs!', krMeaning: '공룡 좋아해요', pillar: 'daily' },
    { keys: ['유치원', '어린이집', '학교'], en: 'I went to kindergarten!', krMeaning: '유치원에 갔어요', pillar: 'daily' },
    { keys: ['피자'], en: 'I like pizza!', krMeaning: '피자 좋아해요', pillar: 'daily' },
    { keys: ['아이스크림'], en: 'I want some ice cream, please!', krMeaning: '아이스크림 먹고 싶어요', pillar: 'manners' },
    { keys: ['강아지', '멍멍'], en: 'I like cute puppies!', krMeaning: '강아지가 좋아요', pillar: 'daily' },
    { keys: ['고양이', '야옹'], en: 'I like cute cats!', krMeaning: '고양이가 좋아요', pillar: 'daily' },
    { keys: ['엄마'], en: 'I love my mommy!', krMeaning: '엄마 사랑해요', pillar: 'daily' },
    { keys: ['아빠'], en: 'I love my daddy!', krMeaning: '아빠 사랑해요', pillar: 'daily' },
    { keys: ['생일'], en: 'Happy birthday!', krMeaning: '생일이에요', pillar: 'calendar' },
    { keys: ['로봇', '변신'], en: 'I like cool robots!', krMeaning: '멋진 로봇이 좋아요', pillar: 'daily' },
    { keys: ['공주', '요정'], en: 'I like magic princesses!', krMeaning: '마법 공주가 좋아요', pillar: 'daily' },
    { keys: ['우주', '로켓', '달'], en: "Let's go to the moon!", krMeaning: '우주에 가자', pillar: 'daily' },
    { keys: ['라면', '국수'], en: "Let's have some ramen!", krMeaning: '라면 먹자', pillar: 'daily' },
    { keys: ['사과'], en: 'An apple, please!', krMeaning: '사과 주세요', pillar: 'manners' },
    { keys: ['바나나'], en: 'A banana, please!', krMeaning: '바나나 주세요', pillar: 'manners' },
    { keys: ['케이크', '컵케이크', '딸기'], en: 'A strawberry cupcake, please!', krMeaning: '컵케이크 주세요', pillar: 'manners' },
    { keys: ['배고파', '배고프'], en: 'I am hungry!', krMeaning: '배고파요', pillar: 'daily' },
    { keys: ['행복', '좋아', '신나', '재밌'], en: 'I feel happy!', krMeaning: '기분이 좋아요', pillar: 'daily' },
    { keys: ['졸려', '피곤'], en: 'I am sleepy.', krMeaning: '졸려요', pillar: 'daily' },
    { keys: ['고마워', '감사'], en: 'Thank you!', krMeaning: '고마워요', pillar: 'manners' },
    { keys: ['미안', '죄송'], en: "I'm sorry!", krMeaning: '미안해요', pillar: 'manners' },
    { keys: ['괜찮아'], en: "It's okay!", krMeaning: '괜찮아요', pillar: 'manners' },
    { keys: ['나눠', '같이 먹'], en: "Let's share!", krMeaning: '같이 나눠 먹자', pillar: 'manners' },
    { keys: ['차례'], en: 'Your turn, my turn!', krMeaning: '차례를 지켜요', pillar: 'manners' },
    { keys: ['안녕', '반가'], en: 'Nice to meet you!', krMeaning: '만나서 반가워요', pillar: 'manners' },
    { keys: ['월요일'], en: 'On Monday!', krMeaning: '월요일', pillar: 'calendar' },
    { keys: ['화요일'], en: 'On Tuesday!', krMeaning: '화요일', pillar: 'calendar' },
    { keys: ['토요일'], en: 'On Saturday!', krMeaning: '토요일', pillar: 'calendar' },
    { keys: ['일요일'], en: 'On Sunday!', krMeaning: '일요일', pillar: 'calendar' },
    { keys: ['맑아'], en: "It's sunny!", krMeaning: '날씨가 맑아요', pillar: 'daily' },
    { keys: ['비'], en: "It's rainy!", krMeaning: '비가 와요', pillar: 'daily' }
  ];

  return {
    assetUrl,
    BACKGROUND_SETS,
    PERSONALITY_PROFILES,
    RIG_PRESETS,
    DEFAULT_CHARACTERS,
    ROLEPLAY_DOMAINS,
    INITIAL_WEAK_EXPRESSIONS,
    PHONETIC_MAP,
    GRAMMAR_PATTERNS,
    KOREAN_TO_ENGLISH
  };
})();
