/**
 * reviewer.js — 검토 화면 렌더러
 * tsx 참조 코드의 UI를 순수 HTML/CSS/JS로 구현
 */

const Reviewer = (() => {
  // 내부 상태 (App에서 초기화 시 복사본 유지)
  let _pairs    = [];
  let _scores   = [];
  let _statuses = [];
  let _comments = [];
  let _krTexts  = [];
  let _matchInfo = null;
  let _filter    = 'all';
  let _sortDir   = null;
  let _collapsedSim = {};
  let _editIdx   = null;

  const SIM_ITEMS = [
    { key: 'len',   label: '길이',   color: '#6366f1' },
    { key: 'num',   label: '숫자',   color: '#0ea5e9' },
    { key: 'alpha', label: '알파벳', color: '#10b981' },
    { key: 'sym',   label: '기호',   color: '#f59e0b' },
    { key: 'pos',   label: '위치',   color: '#ec4899' },
  ];

  const STATUS_META = {
    none:    { label: '미검토',   btnText: '',   bg: 'transparent', border: '#e5e7eb', text: '#6b7280' },
    good:    { label: '✅ 정상',  btnText: '✅', bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
    warning: { label: '⚠️ 주의', btnText: '⚠️', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
    error:   { label: '❌ 오류',  btnText: '❌', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  };

  // ── 초기화 ────────────────────────────────────────────────
  function init(pairs, scores, statuses, comments, krTexts, matchInfo) {
    _pairs     = pairs;
    _scores    = scores;
    _statuses  = statuses ? [...statuses] : Array(pairs.length).fill('none');
    _comments  = comments ? [...comments] : Array(pairs.length).fill('');
    _krTexts   = krTexts  ? [...krTexts]  : pairs.map(p => p.koText || '');
    _matchInfo = matchInfo;
    _filter    = 'all';
    _sortDir   = null;
    _collapsedSim = {};
    _editIdx   = null;

    updateMatchInfo();
    updateFilters();
    render();
  }

  // ── 매칭 정보 ─────────────────────────────────────────────
  function updateMatchInfo() {
    const el = document.getElementById('match-info');
    if (!el || !_matchInfo) return;
    el.innerHTML = `JP <strong>${_matchInfo.jp}</strong>문장 · KR <strong>${_matchInfo.kr}</strong>문장 · <strong>${_matchInfo.matched}쌍 매칭</strong>`;
  }

  // ── 필터 업데이트 ─────────────────────────────────────────
  function updateFilters() {
    const counts = { none: 0, good: 0, warning: 0, error: 0 };
    _statuses.forEach(s => { if (counts[s] !== undefined) counts[s]++; });

    ['none', 'good', 'warning', 'error'].forEach(key => {
      const pill = document.getElementById(`fpill-${key}`);
      if (!pill) return;
      const count = pill.querySelector('.filter-pill-count');
      if (count) count.textContent = counts[key];
      pill.className = 'filter-pill';
      if (_filter === key) pill.classList.add(`active-${key}`);
    });

    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) clearBtn.style.display = (_filter !== 'all') ? 'inline-block' : 'none';

    const sortHeader = document.getElementById('sort-header');
    if (sortHeader) {
      const icon = _sortDir === 'asc' ? ' ↑' : _sortDir === 'desc' ? ' ↓' : ' ↕';
      sortHeader.textContent = `유사도${icon}`;
      sortHeader.classList.toggle('sorted', _sortDir !== null);
    }

    // 헤더 진행률 업데이트
    const reviewed = _statuses.filter(s => s !== 'none').length;
    const total    = _statuses.length;
    const pct      = total > 0 ? Math.round((reviewed / total) * 100) : 0;
    const fill  = document.getElementById('header-progress-fill');
    const pctEl = document.getElementById('header-pct');
    if (fill)  fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  // ── 행 목록 결정 (필터 + 정렬) ────────────────────────────
  function getDisplayList() {
    let list = _pairs.map((p, i) => ({
      ...p,
      i,
      status:  _statuses[i] || 'none',
      comment: _comments[i] || '',
      scores:  _scores[i],
      krEdit:  _krTexts[i] ?? p.koText ?? '',
    }));

    if (_filter !== 'all') {
      list = list.filter(r => r.status === _filter);
    }

    if (_sortDir) {
      list = [...list].sort((a, b) => {
        const ta = a.scores?.total ?? -1;
        const tb = b.scores?.total ?? -1;
        return _sortDir === 'asc' ? ta - tb : tb - ta;
      });
    }

    return list;
  }

  // ── 메인 렌더 ─────────────────────────────────────────────
  function render() {
    const listEl = document.getElementById('review-list');
    if (!listEl) return;

    const rows = getDisplayList();

    if (rows.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:60px;color:#9ca3af;font-size:13px;">해당하는 문장이 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = rows.map(r => renderRow(r)).join('');
    bindRowEvents(listEl);
  }

  // ── 행 렌더 ───────────────────────────────────────────────
  function renderRow(r) {
    const { i, status, comment, scores, krEdit } = r;
    const jaText = r.jaText ?? r.jp ?? '';
    const isUnmatched = !jaText || !krEdit;
    const statusMeta = STATUS_META[status] ?? STATUS_META.none;
    const simOpen  = !_collapsedSim[i];

    return `
    <div class="review-row ${status !== 'none' ? `status-${status}` : ''} ${isUnmatched ? 'unmatched' : ''}" data-idx="${i}">

      <!-- 번호 + 검토 버튼 -->
      <div class="row-num-cell">
        <span class="row-num">${i + 1}</span>
        ${['good', 'warning', 'error'].map(k => `
          <button class="status-btn ${status === k ? `active-${k}` : ''}"
                  data-action="status" data-idx="${i}" data-status="${k}">
            ${STATUS_META[k].btnText}
          </button>`).join('')}
      </div>

      <!-- 일본어 원문 -->
      <div class="row-jp-cell">
        <div class="lang-badge-jp">JP</div>
        <div class="cell-text-jp ${!jaText ? 'cell-text-empty' : ''}">
          ${highlightText(jaText, krEdit, scores)}
        </div>
      </div>

      <!-- 한국어 번역문 -->
      <div class="row-ko-cell" data-idx="${i}">
        <div class="ko-cell-header">
          <span class="lang-badge-ko">KO</span>
          <button class="btn-edit-ko" data-action="edit-ko" data-idx="${i}">
            <span style="font-size:10px;">✏️</span> 수정
          </button>
          ${status !== 'none' ? `<span class="status-label-badge ${status}">${statusMeta.label}</span>` : ''}
        </div>
        <div class="cell-text-ko ${!krEdit ? 'cell-text-empty' : ''}">
          ${highlightText(krEdit, jaText, scores)}
        </div>
        ${comment ? `<div class="memo-display" style="color:${statusMeta.text}">💬 ${esc(comment)}</div>` : ''}
        <input class="memo-input" type="text" placeholder="메모..."
               data-action="memo" data-idx="${i}"
               value="${esc(comment)}"
               onclick="event.stopPropagation()">
      </div>

      <!-- 유사도 -->
      <div class="row-sim-cell" data-action="toggle-sim" data-idx="${i}">
        ${renderSimCell(scores, i, simOpen)}
      </div>

    </div>`;
  }

  // ── 유사도 셀 렌더 ────────────────────────────────────────
  function renderSimCell(scores, idx, isOpen) {
    if (!scores) return `<div class="sim-empty">—</div>`;

    const pct = Math.floor(scores.total * 100 + 0.0001);
    const badgeClass = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low';
    const totalColor = pct >= 75 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';

    const detailHtml = SIM_ITEMS.map(({ key, label, color }) => {
      const val = scores[key];
      const isNA = val === null || val === undefined;
      const vPct = isNA ? 0 : Math.floor(val * 100 + 0.0001);
      return `
        <div class="sim-row">
          <span class="sim-label">${label}</span>
          ${isNA
            ? `<span class="sim-na">N/A</span>`
            : `<div class="sim-bar-track"><div class="sim-bar-fill" style="width:${vPct}%;background:${color}"></div></div>
               <span class="sim-value">${vPct}%</span>`}
        </div>`;
    }).join('');
    return `
      <div class="sim-header-row">
        <span class="sim-badge ${badgeClass}">${pct}%</span>
        <span class="sim-toggle">${isOpen ? '▲' : '▼'}</span>
      </div>
      ${isOpen ? `<div class="sim-panel">${detailHtml}</div>` : ''}`;
  }

  // ── 이벤트 바인딩 (위임) ──────────────────────────────────
  let _modalBound = false;
  function bindRowEvents(listEl) {
    listEl.addEventListener('click', handleRowClick);
    listEl.addEventListener('blur',  handleBlur,  true);
    listEl.addEventListener('input', handleInput, true);

    if (!_modalBound) {
      document.querySelectorAll('[data-action="close-modal"]').forEach(el => {
        el.onclick = closeEditModal;
      });
      document.getElementById('btn-modal-save').onclick = saveEdit;
      _modalBound = true;
    }
  }

  function handleRowClick(e) {
    // 상태 버튼
    const statusBtn = e.target.closest('[data-action="status"]');
    if (statusBtn) {
      const i = parseInt(statusBtn.dataset.idx);
      const newStatus = statusBtn.dataset.status;
      _statuses[i] = _statuses[i] === newStatus ? 'none' : newStatus;
      if (typeof App !== 'undefined') App.setRowStatus(i, _statuses[i]);
      updateFilters();
      render();
      return;
    }

    // 수정 버튼 클릭
    const editBtn = e.target.closest('[data-action="edit-ko"]');
    if (editBtn) {
      const i = parseInt(editBtn.dataset.idx);
      openEditModal(i);
      return;
    }

    // 유사도 토글
    const simCell = e.target.closest('[data-action="toggle-sim"]');
    if (simCell) {
      const i = parseInt(simCell.dataset.idx);
      _collapsedSim[i] = !_collapsedSim[i];
      simCell.innerHTML = renderSimCell(_scores[i], i, !_collapsedSim[i]);
      return;
    }
  }

  // ── 수정 모달 제어 ─────────────────────────────────────────
  function openEditModal(idx) {
    _editIdx = idx;
    const jaText = _pairs[idx].jaText || _pairs[idx].jp || '';
    const koText = _krTexts[idx] || '';

    document.getElementById('modal-jp-text').textContent = jaText;
    document.getElementById('modal-ko-text').textContent = koText;
    document.getElementById('modal-edit-area').value    = koText;
    document.getElementById('edit-modal').style.display = 'flex';
  }

  function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    _editIdx = null;
  }

  function saveEdit() {
    if (_editIdx === null) return;
    const newText = document.getElementById('modal-edit-area').value;
    const i = _editIdx;

    // 데이터 업데이트
    _krTexts[i] = newText;
    if (typeof App !== 'undefined') App.setRowKoText(i, newText);

    // 유사도 재계산
    if (window.Similarity && _matchInfo) {
      const p = _pairs[i];
      const s = Similarity.calculate(p.jaText, newText, p.jaIdx, _matchInfo.jp, p.koIdx, _matchInfo.kr);
      _scores[i] = {
        len:   s.details.length?.value  ?? 0,
        num:   s.details.number?.isNA   ? null : (s.details.number?.value  ?? null),
        alpha: s.details.alphabet?.isNA ? null : (s.details.alphabet?.value ?? null),
        sym:   s.details.symbol?.isNA   ? null : (s.details.symbol?.value  ?? null),
        pos:   s.details.position?.value ?? 0,
        total: s.overall,
      };
      if (typeof App !== 'undefined') App.setRowScores(i, _scores[i]);
    }

    closeEditModal();
    updateFilters();
    render();
  }

  function handleBlur(e) {
    const ta = e.target;
    if (ta.dataset.action === 'ko-edit') {
      const i = parseInt(ta.dataset.idx);
      _krTexts[i] = ta.value;
      if (typeof App !== 'undefined') App.setRowKrText(i, ta.value);
      _editIdx = null;
      render();
    }
  }

  function handleInput(e) {
    const el = e.target;
    if (el.dataset.action === 'memo') {
      const i = parseInt(el.dataset.idx);
      _comments[i] = el.value;
      if (typeof App !== 'undefined') App.setRowComment(i, el.value);
    }
    if (el.dataset.action === 'ko-edit') {
      const i = parseInt(el.dataset.idx);
      _krTexts[i] = el.value;
      if (typeof App !== 'undefined') App.setRowKrText(i, el.value);
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }

  // ── 외부 API ──────────────────────────────────────────────
  function onFilter(filter) {
    _filter = (_filter === filter && filter !== 'all') ? 'all' : filter;
    updateFilters();
    render();
  }

  function toggleSort() {
    _sortDir = _sortDir === null ? 'asc' : _sortDir === 'asc' ? 'desc' : null;
    updateFilters();
    render();
  }

  async function downloadTranslation() {
    if (typeof App === 'undefined' || typeof App.getKrFile !== 'function' || !window.JSZip) {
      return downloadTxt();
    }
    const krFile = App.getKrFile();
    if (!krFile) return downloadTxt();

    try {
      // 1. 원본 Word 파일 열기
      const zip = await JSZip.loadAsync(krFile);
      const xmlStr = await zip.file("word/document.xml").async("string");
      const xmlDoc = new DOMParser().parseFromString(xmlStr, "application/xml");

      const wps = xmlDoc.getElementsByTagName("w:p");

      // 2. 편집된 문장을 원본 인덱스(koIdx) 기준으로 맵핑
      const editsByKoIdx = {};
      _pairs.forEach((p, i) => {
        if (p.koIdx !== -1) {
          editsByKoIdx[p.koIdx] = _krTexts[i] || ''; // 빈 문자 배열 처리
        }
      });

      let currentKoIdx = 0; // 추출 시 사용했던 순차 인덱스와 일치시킴

      for (let i = 0; i < wps.length; i++) {
        const p = wps[i];
        let fullText = '';
        const wts = Array.from(p.getElementsByTagName('w:t'));
        for (let t of wts) fullText += t.textContent;

        const textTrim = fullText.trim();
        if (!textTrim) continue; // 빈 줄은 패스 (mammoth 동작 방식과 일치)

        // 태그 라인인지 확인 (전처리 단계에서 무시된 단락은 건너뜀 - 단락 번호 등 보존)
        if (window.Preprocessor.isTagLine(fullText)) continue;

        // 이 단락은 currentKoIdx의 원본 문장에 해당함
        const edit = editsByKoIdx[currentKoIdx];
        if (edit !== undefined) {
          // 단락 맨 앞의 문서 기호(예: 【０００１】)가 있다면 유지하고 본문만 교체
          const match = fullText.match(/^(【[０-９0-9\s]+】|〔[^〕]*〕)/);
          const prefix = match ? match[0] + ' ' : '';
          const newFullText = prefix + edit;

          // 단락 안의 텍스트 노드(<w:t>)들을 새 텍스트로 치환
          if (wts.length > 0) {
            wts[0].textContent = newFullText;
            wts[0].setAttribute('xml:space', 'preserve'); // 들여쓰기/띄어쓰기 유지
            // 텍스트 조각 제거
            for (let j = 1; j < wts.length; j++) {
              wts[j].parentNode.removeChild(wts[j]);
            }
          }
        }
        currentKoIdx++; // 유효한 문장이었으므로 인덱스 증가
      }

      // 3. 수정된 XML 저장
      const serializer = new XMLSerializer();
      const newXmlStr = serializer.serializeToString(xmlDoc);
      zip.file("word/document.xml", newXmlStr);

      // 4. 새로운 DOCX 생성 및 다운로드 (원본 서식 그대로 유지)
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '번역문_수정본.docx';
      a.click();
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error('DOCX 생성 오류:', e);
      alert('Word 문서 생성 중 문제가 발생했습니다. 일반 TXT 파일로 다운로드합니다.');
      downloadTxt();
    }
  }

  function downloadTxt() {
    const text = _krTexts.filter(s => s && s.length > 0).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '번역문_수정본.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── 유틸 ──────────────────────────────────────────────────
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function highlightText(text, otherText, scores) {
    if (!text) return '（미매칭）';
    if (!scores) return esc(text);

    const isNumBad   = scores.num !== null && Math.floor(scores.num * 100 + 0.0001) < 100;
    const isAlphaBad = scores.alpha !== null && Math.floor(scores.alpha * 100 + 0.0001) < 100;
    const isSymBad   = scores.sym !== null && Math.floor(scores.sym * 100 + 0.0001) < 100;

    if (!isNumBad && !isAlphaBad && !isSymBad) return esc(text);

    const norm = window.Preprocessor ? window.Preprocessor.normChar : (c => c);

    function getUnmatchedIndicesSet(strA, strB, typeFn) {
      const a = [], b = [];
      for (let i = 0; i < strA.length; i++) if (typeFn(norm(strA[i]))) a.push({ c: norm(strA[i]), i });
      for (let i = 0; i < (strB || '').length; i++) if (typeFn(norm(strB[i]))) b.push({ c: norm(strB[i]), i });

      a.reverse();
      b.reverse();

      const table = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          if (a[i - 1].c === b[j - 1].c) table[i][j] = table[i - 1][j - 1] + 1;
          else table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
        }
      }

      let i = a.length, j = b.length;
      const matchedIndicesA = new Set();
      while (i > 0 && j > 0) {
        if (a[i - 1].c === b[j - 1].c) {
          matchedIndicesA.add(a[i - 1].i);
          i--; j--;
        } else if (table[i - 1][j] > table[i][j - 1]) {
          i--;
        } else {
          j--;
        }
      }

      const unmatched = new Set();
      for (const item of a) if (!matchedIndicesA.has(item.i)) unmatched.add(item.i);
      return unmatched;
    }

    const combinedUnmatched = getUnmatchedIndicesSet(text, otherText, c => {
      return /[0-9A-Za-z]/.test(c) || "!?@#$%^&*+=|~`\\\"';:,./<>(){}[]\\\\-_".indexOf(c) !== -1;
    });

    const colorNum   = 'rgba(14, 165, 233, 0.3)';
    const colorAlpha = 'rgba(16, 185, 129, 0.3)';
    const colorSym   = 'rgba(245, 158, 11, 0.3)';

    let html = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      let bgColor = null;

      if (combinedUnmatched.has(i)) {
        const nc = norm(c);
        if (isNumBad && /[0-9]/.test(nc)) bgColor = colorNum;
        else if (isAlphaBad && /[A-Za-z]/.test(nc)) bgColor = colorAlpha;
        else if (isSymBad && "!?@#$%^&*+=|~`\\\"';:,./<>(){}[]\\\\-_".indexOf(nc) !== -1) bgColor = colorSym;
      }

      const escaped = esc(c);
      if (bgColor) {
        html += `<span style="background-color: ${bgColor}; padding: 0 1px; border-radius: 2px; font-weight: bold; color: #1f2937;">${escaped}</span>`;
      } else {
        html += escaped;
      }
    }
    return html;
  }

  return { init, onFilter, toggleSort, downloadTranslation };
})();

if (typeof window !== 'undefined') window.Reviewer = Reviewer;
