/* ==========================================================================
   TalkieFriends v2 — Parent Text Report Generator (Rule 5: NO TTS!)
   ========================================================================== */

window.TFReport = (function () {
  function buildReportData({ character, roleplay, background, transcript, sessionCorrections, sessionPillars, stars, weakExpressions }) {
    const prof = window.TFEngine.getProfile(character);
    const childTurns = transcript.filter((t) => t.role === 'child');
    const vocabSet = new Set(roleplay.keyVocab || []);
    sessionCorrections.forEach((c) => vocabSet.add(c.correct));

    const praises = [];
    if (stars > 0) {
      praises.push(`${character.nameKr}(${prof.nameKr})와 "${roleplay.titleKr}" 역할극을 즐기며 별 ${stars}개를 모았어요!`);
    }
    if (sessionPillars.manners > 0) {
      praises.push('역할극 속에서 "Please", "Thank you", "Let\'s share", "Your turn, my turn" 같은 매너 표현을 자연스럽게 활용했어요.');
    }
    if (sessionPillars.calendar > 0) {
      praises.push('요일(Days)·달(Months) 달력 개념을 가게 영업일/병원 예약/소풍 날짜와 자연스럽게 연결해 말했어요.');
    }
    if (sessionPillars.daily > 0) {
      praises.push('숫자 세기, 파닉스, 날씨, 감정 표현 등 6~7세 기초 일상 회화에 자신감 있게 참여했어요.');
    }
    const repeatedSuccess = transcript.filter((t) => t.tag && t.tag.includes('따라 말하기 성공')).length;
    if (repeatedSuccess > 0) {
      praises.push(`부드러운 교정 문장을 끝까지 ${repeatedSuccess}번 따라 말하며 올바른 영어 패턴을 몸에 익혔어요!`);
    }
    if (praises.length === 0) {
      praises.push(`${character.nameKr}(${prof.nameKr})와 ${background.nameKr} 무대에서 놀이를 시작할 준비를 마쳤어요.`);
    }

    const corrections = sessionCorrections.length > 0
      ? sessionCorrections
      : weakExpressions.filter((w) => !w.mastered).slice(0, 3).map((w) => ({
          wrong: w.wrong,
          correct: w.correct,
          category: w.category,
          nextMission: `다음·다다음 수업 역할극 미션에서 "${w.correct}" 자연스럽게 재질문 예정`
        }));

    const excerpts = transcript
      .filter((t) => t.role === 'ai' || t.role === 'child')
      .slice(-8);

    return {
      dateStr: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
      topic: {
        roleplayTitle: `${roleplay.titleKr} (${roleplay.areaBadge})`,
        backgroundName: background.nameKr,
        characterName: `${character.nameKr} (${character.nameEn}) · ${prof.nameKr}`,
        turnsCount: childTurns.length,
        stars
      },
      vocab: Array.from(vocabSet),
      praises,
      corrections,
      excerpts
    };
  }

  function renderReportHTML(report) {
    const vocabHtml = report.vocab.map((v) => `<span class="vocab-chip">${escapeHtml(v)}</span>`).join('');
    const praisesHtml = report.praises.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    const correctionsHtml = report.corrections.length
      ? report.corrections
          .map(
            (c) => `
          <div class="correction-row">
            <div><span class="bad">아이 발화: "${escapeHtml(c.wrong)}"</span> → <span class="good">교정 표현: "${escapeHtml(c.correct)}"</span></div>
            <span class="tip">📌 포인트: ${escapeHtml(c.category)} · ${escapeHtml(c.nextMission || '다음 수업 역할극 미션에 반복 복습 예약')}</span>
          </div>`
          )
          .join('')
      : `<p class="side-helper">오늘 수업에서는 틀린 문장이 없었어요! 아주 훌륭합니다 👏</p>`;

    const excerptsHtml = report.excerpts.length
      ? report.excerpts
          .map(
            (e) => `
          <div class="excerpt-line ${e.role}">
            <strong>${e.role === 'child' ? '🧒 아이' : '🧸 ' + escapeHtml(e.speaker || '선생님')}:</strong>
            ${escapeHtml(e.text)}
            ${e.tag ? `<span style="margin-left:6px;font-size:11px;color:#8E7E72;">[${escapeHtml(e.tag)}]</span>` : ''}
          </div>`
          )
          .join('')
      : `<p class="side-helper">아직 진행된 Live 대화가 없습니다. Live 무대에서 대화를 나눈 뒤 "." 또는 "끝"을 입력해 보세요!</p>`;

    return `
      <div class="report-section">
        <h3>① 오늘 놀이 주제</h3>
        <p><strong>${escapeHtml(report.topic.roleplayTitle)}</strong></p>
        <p style="margin-top:4px;">🎬 무대 배경: ${escapeHtml(report.topic.backgroundName)} · 🧸 캐릭터: <strong>${escapeHtml(report.topic.characterName)}</strong></p>
        <p style="color:#6E6259;margin-top:4px;">📅 ${escapeHtml(report.dateStr)} · 아이 발화 ${report.topic.turnsCount}턴 · 획득 별 ⭐ ${report.topic.stars}개</p>
      </div>
      <div class="report-section">
        <h3>② 핵심 단어·문장</h3>
        <div class="vocab-chips">${vocabHtml}</div>
      </div>
      <div class="report-section">
        <h3>③ 잘한 점</h3>
        <ul>${praisesHtml}</ul>
      </div>
      <div class="report-section">
        <h3>④ 약점 및 틀린 문장 분석 (다음 수업 복습 포인트)</h3>
        <div class="correction-table">${correctionsHtml}</div>
      </div>
      <div class="report-section">
        <h3>⑤ 주요 대화 발췌</h3>
        <div class="excerpt-list">${excerptsHtml}</div>
      </div>`;
  }

  function formatPlainText(report) {
    return [
      `[TalkieFriends 부모님 확인용 영어 놀이 리포트 · ${report.dateStr}]`,
      '',
      '① 오늘 놀이 주제',
      `- 역할극: ${report.topic.roleplayTitle}`,
      `- 배경 세트: ${report.topic.backgroundName} / 캐릭터: ${report.topic.characterName}`,
      `- 아이 발화 ${report.topic.turnsCount}턴 / 획득 별 ⭐${report.topic.stars}`,
      '',
      '② 핵심 단어·문장',
      `- ${report.vocab.join(', ')}`,
      '',
      '③ 잘한 점',
      ...report.praises.map((p) => `- ${p}`),
      '',
      '④ 약점 및 틀린 문장 분석',
      ...(report.corrections.length
        ? report.corrections.map((c) => `- "${c.wrong}" → "${c.correct}" (${c.category})`)
        : ['- 특이 오류 없음']),
      '',
      '⑤ 주요 대화 발췌',
      ...(report.excerpts.length
        ? report.excerpts.map((e) => `- ${e.role === 'child' ? '아이' : e.speaker || '선생님'}: ${e.text}`)
        : ['- 대화 기록 없음'])
    ].join('\n');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderHistoryHTML(historyList) {
    if (!historyList || !historyList.length) {
      return '<p style="font-size:12.5px;color:#6C6378;margin:4px 0;">아직 저장된 지난 수업 기록이 없어요. 놀이를 끝내면 날짜별로 자동 누적되고 다른 컴퓨터에도 동기화됩니다.</p>';
    }
    return historyList
      .slice(0, 12)
      .map(
        (h) => `
      <div class="correction-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <strong>${escapeHtml(h.dateStr)}</strong> · ${escapeHtml(h.topic.roleplayTitle)}
          <span class="tip">🧸 ${escapeHtml(h.topic.characterName)} · 발화 ${h.topic.turnsCount}턴 · ⭐ ${h.topic.stars}</span>
        </div>
        <span class="mastery-pill">${h.corrections.length ? `복습 ${h.corrections.length}건` : '완벽!'}</span>
      </div>`
      )
      .join('');
  }

  return { buildReportData, renderReportHTML, renderHistoryHTML, formatPlainText };
})();
