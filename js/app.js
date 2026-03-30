/**
 * app.js — 메인 컨트롤러
 * tsx 참조 코드의 상태 관리 및 화면 전환 로직 반영
 */

const App = (() => {
  // ── 전역 상태 ────────────────────────────────────────────
  let jpFile = null;
  let krFile = null;
  let pairs = [];        // { jp, kr, ji, ki }
  let simScores = [];    // { len, num, alpha, sym, pos, total } | null
  let statuses = [];     // 'none' | 'good' | 'warning' | 'error'
  let comments = [];     // string[]
  let krTexts = [];      // string[] (편집된 번역문)
  let matchInfo = null;  // { total, matched, jp, kr }
  let loading = false;
  let currentScreen = 'upload'; // 'upload' | 'processing' | 'review'

  // ── 초기화 ───────────────────────────────────────────────
  function init() {
    renderStepBar(0);
    bindUploadEvents();
    bindHeaderEvents();
    bindFilterEvents();
    bindSortEvent();
    console.log('[JP-KO] 앱 초기화');
  }

  // ── 스텝 바 ──────────────────────────────────────────────
  const STEPS = ['파일 업로드', '문장 매칭', '검토'];

  function renderStepBar(activeIdx) {
    const bar = document.getElementById('step-bar');
    if (!bar) return;
    bar.innerHTML = STEPS.map((label, idx) => {
      const state = idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'pending';
      const numText = idx < activeIdx ? '✓' : String(idx + 1);
      const arrow = idx < STEPS.length - 1 ? `<span class="step-bar-arrow">›</span>` : '';
      return `
        <div class="step-bar-item">
          <div class="step-bar-num ${state}">${numText}</div>
          <span class="step-bar-label ${state}">${label}</span>
          ${arrow}
        </div>`;
    }).join('');
  }

  // ── 화면 전환 ─────────────────────────────────────────────
  function showScreen(name) {
    currentScreen = name;
    document.getElementById('screen-upload').style.display     = name === 'upload'     ? 'block' : 'none';
    document.getElementById('screen-processing').style.display = name === 'processing' ? 'flex'  : 'none';

    const reviewEl = document.getElementById('screen-review');
    if (name === 'review') {
      reviewEl.style.display = 'flex';
      reviewEl.style.flexDirection = 'column';
      reviewEl.style.flex = '1';
      reviewEl.style.overflow = 'hidden';
    } else {
      reviewEl.style.display = 'none';
    }

    // 헤더 액션 표시
    const actions = document.getElementById('header-actions');
    if (actions) actions.style.display = name === 'review' ? 'flex' : 'none';

    // 스텝 인디케이터: upload=0활성, processing=1활성, review=2활성(1완료)
    const stepIdx = name === 'upload' ? 0 : name === 'processing' ? 1 : 2;
    renderStepBar(stepIdx);
  }

  // ── 업로드 이벤트 ─────────────────────────────────────────
  function bindUploadEvents() {
    // JP
    const inputJp = document.getElementById('input-jp');
    const dropJp  = document.getElementById('drop-jp');
    if (inputJp) inputJp.addEventListener('change', e => setFile('jp', e.target.files[0]));
    if (dropJp)  setupDrop(dropJp, f => setFile('jp', f));

    // KO
    const inputKo = document.getElementById('input-ko');
    const dropKo  = document.getElementById('drop-ko');
    if (inputKo) inputKo.addEventListener('change', e => setFile('kr', e.target.files[0]));
    if (dropKo)  setupDrop(dropKo, f => setFile('kr', f));

    // 시작 버튼
    const btn = document.getElementById('btn-start');
    if (btn) btn.addEventListener('click', handleStart);
  }

  function setupDrop(zone, onFile) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
  }

  function setFile(lang, file) {
    if (!file || !file.name.endsWith('.docx')) {
      showError('.docx 파일만 업로드할 수 있습니다.');
      return;
    }
    if (lang === 'jp') {
      jpFile = file;
      updateDropZone('jp', file);
    } else {
      krFile = file;
      updateDropZone('ko', file);
    }
    updateStartButton();
  }

  function updateDropZone(lang, file) {
    const zone = document.getElementById(`drop-${lang}`);
    const info = document.getElementById(`drop-${lang}-info`);
    if (!zone || !info) return;

    zone.classList.remove('has-file-jp', 'has-file-ko');
    // X 버튼 제거
    const existing = zone.querySelector('.file-drop-clear');
    if (existing) existing.remove();

    if (file) {
      zone.classList.add(`has-file-${lang}`);
      info.innerHTML = `
        <div class="file-drop-name ${lang}">${escHtml(file.name)}</div>
        <div class="file-drop-size">${(file.size / 1024).toFixed(1)} KB</div>`;

      // X 버튼 추가
      const clearBtn = document.createElement('button');
      clearBtn.className = 'file-drop-clear';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (lang === 'jp') jpFile = null;
        else krFile = null;
        info.innerHTML = `<div class="file-drop-hint">.docx 클릭하여 업로드</div>`;
        zone.classList.remove(`has-file-${lang}`);
        clearBtn.remove();
        updateStartButton();
      });
      zone.appendChild(clearBtn);
    } else {
      info.innerHTML = `<div class="file-drop-hint">.docx 클릭하여 업로드</div>`;
    }
  }

  function updateStartButton() {
    const btn = document.getElementById('btn-start');
    if (!btn) return;
    const ready = jpFile && krFile && !loading;
    btn.disabled = !ready;
    btn.className = `btn-start ${ready ? 'ready' : 'disabled'}`;
    btn.textContent = loading ? '문장 매칭 중...' : ready ? '검토 시작 →' : '두 파일을 모두 업로드해 주세요';
  }

  // ── 처리 시작 ─────────────────────────────────────────────
  async function handleStart() {
    if (!jpFile || !krFile || loading) return;
    loading = true;
    updateStartButton();
    showError('');
    hideDebugLog();
    showScreen('processing');

    const statusEl = document.getElementById('proc-status');
    const logEl    = document.getElementById('proc-log');

    try {
      setStatus('파일을 읽고 있습니다...');
      addLog('파일 읽기 시작...');

      // 파일 → 텍스트 추출
      const [jpRaw, krRaw] = await Promise.all([
        extractDocx(jpFile),
        extractDocx(krFile),
      ]);
      addLog(`JP ${jpRaw.length}자 / KR ${krRaw.length}자`);

      // 전처리
      const jpSents = Preprocessor.extractSentences(jpRaw);
      const krSents = Preprocessor.extractSentences(krRaw);
      addLog(`JP ${jpSents.length}문장 / KR ${krSents.length}문장`);

      setStatus('문장을 매칭하고 있습니다...');
      await sleep(80);

      // 매칭
      const matchResult = Matcher.match(jpSents, krSents);
      const matched = Matcher.buildDisplayRows(matchResult);
      addLog(`매칭 ${matchResult.pairs.length}쌍 완료`);

      // 유사도 계산
      setStatus('유사도를 계산하고 있습니다...');
      const scores = matched.map(row => {
        if (row.type !== 'matched') return null;
        const s = Similarity.calculate(
          row.jaText, row.koText,
          row.jaIdx, jpSents.length,
          row.koIdx, krSents.length
        );
        // tsx의 키 형식으로 변환 (len, num, alpha, sym, pos, total)
        return {
          len:   s.details.length?.value  ?? 0,
          num:   s.details.number?.isNA   ? null : (s.details.number?.value  ?? null),
          alpha: s.details.alphabet?.isNA ? null : (s.details.alphabet?.value ?? null),
          sym:   s.details.symbol?.isNA   ? null : (s.details.symbol?.value  ?? null),
          pos:   s.details.position?.value ?? 0,
          total: s.overall,
        };
      });

      pairs     = matched;
      simScores = scores;
      statuses  = Array(matched.length).fill('none');
      comments  = Array(matched.length).fill('');
      krTexts   = matched.map(r => r.koText || '');
      matchInfo = {
        jp:      jpSents.length,
        kr:      krSents.length,
        matched: matchResult.pairs.length,
        total:   matched.length,
      };

      addLog(`총 ${matched.length}행 완료`);
      setStatus('처리 완료!');

      // 매칭 완료 후 약간의 대기 후 자동으로 검토 화면으로 전환
      await sleep(300);
      showScreen('review');
      Reviewer.init(pairs, simScores, statuses, comments, krTexts, matchInfo);

    } catch (err) {
      console.error(err);
      setStatus(`오류: ${err.message}`);
      addLog(`❌ ${err.message}`);
    } finally {
      loading = false;
    }

    function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
    function addLog(msg) {
      if (!logEl) return;
      const div = document.createElement('div');
      div.className = 'log-line';
      div.textContent = msg;
      logEl.appendChild(div);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // ── docx 텍스트 추출 ──────────────────────────────────────
  async function extractDocx(file) {
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const div = document.createElement('div');
    div.innerHTML = result.value;
    const paras = [...div.querySelectorAll('p')]
      .map(p => p.textContent.trim()).filter(s => s.length > 0);
    if (paras.length > 1) return paras.join('\n');
    // fallback: raw text
    const raw = await mammoth.extractRawText({ arrayBuffer: buf });
    return raw.value.trim();
  }

  // ── 헤더 버튼 ─────────────────────────────────────────────
  function bindHeaderEvents() {
    const btnDl  = document.getElementById('btn-dl');
    const btnNew = document.getElementById('btn-header-new');
    if (btnDl)  btnDl.addEventListener('click', () => Reviewer.downloadTranslation());
    if (btnNew) btnNew.addEventListener('click', resetAll);

    const btnGo = document.getElementById('btn-go-review');
    if (btnGo) btnGo.addEventListener('click', () => {
      showScreen('review');
      Reviewer.init(pairs, simScores, statuses, comments, krTexts, matchInfo);
    });
  }

  // ── 필터 & 정렬 ───────────────────────────────────────────
  function bindFilterEvents() {
    document.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        Reviewer.onFilter(btn.dataset.filter);
      });
    });
    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) clearBtn.addEventListener('click', () => Reviewer.onFilter('all'));
  }

  function bindSortEvent() {
    const sortHeader = document.getElementById('sort-header');
    if (sortHeader) sortHeader.addEventListener('click', () => Reviewer.toggleSort());
  }

  // ── 다운로드 ──────────────────────────────────────────────
  function downloadTranslation() {
    const text = krTexts.filter(s => s && s.length > 0).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '번역문_수정본.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── 리셋 ──────────────────────────────────────────────────
  function resetAll() {
    jpFile = krFile = null;
    pairs = []; simScores = []; statuses = []; comments = []; krTexts = [];
    matchInfo = null; loading = false;
    updateDropZone('jp', null);
    updateDropZone('ko', null);
    updateStartButton();
    hideDebugLog();
    showError('');

    // 처리 화면 초기화
    const procLog = document.getElementById('proc-log');
    if (procLog) procLog.innerHTML = '';
    const btnGo = document.getElementById('btn-go-review');
    if (btnGo) btnGo.style.display = 'none';

    showScreen('upload');
  }

  // ── 헬퍼 ──────────────────────────────────────────────────
  function showError(msg) {
    const el = document.getElementById('upload-error');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.textContent = msg;
  }

  function hideDebugLog() {
    const el = document.getElementById('upload-debug');
    if (el) el.style.display = 'none';
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── 외부에서 statuses/krTexts 업데이트 ───────────────────
  function setRowStatus(idx, s) { statuses[idx] = s; }
  function setRowKrText(idx, v) { krTexts[idx] = v; }
  function setRowComment(idx, v) { comments[idx] = v; }

  function getProgress() {
    const total = pairs.length;
    const reviewed = statuses.filter(s => s !== 'none').length;
    return total > 0 ? Math.round((reviewed / total) * 100) : 0;
  }

  function updateHeaderProgress() {
    const pct = getProgress();
    const fill = document.getElementById('header-progress-fill');
    const pctEl = document.getElementById('header-pct');
    if (fill) fill.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  return {
    init,
    setRowStatus, setRowKrText, setRowComment,
    updateHeaderProgress,
    getStatuses: () => statuses,
    getKrTexts:  () => krTexts,
    getComments: () => comments,
    getKrFile:   () => krFile,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
