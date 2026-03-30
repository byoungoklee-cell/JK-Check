/**
 * preprocessor.js — 텍스트 전처리
 * tsx의 stripTags / isTagLine / splitAndClean 로직 통합
 */

const Preprocessor = (() => {

  // 전각→반각 정규화 맵
  const SYM_NORM = (() => {
    const m = {};
    for (let i = 0xFF01; i <= 0xFF5E; i++)
      m[String.fromCharCode(i)] = String.fromCharCode(i - 0xFEE0);
    Object.assign(m, {
      '\u3000': ' ', '、': ',', '，': ',', '､': ',', '。': '.', '．': '.',
      '「': '"', '」': '"', '『': '"', '』': '"',
      '\u201C': '"', '\u201D': '"', '\u2018': "'", '\u2019': "'",
      '【': '[', '】': ']', '〔': '[', '〕': ']',
      '〈': '<', '〉': '>', '《': '<', '》': '>',
      '～': '~', '〜': '~', '…': '.', '‥': '.', '·': ',', '･': ',',
      '—': '-', '–': '-', '―': '-',
    });
    return m;
  })();

  function normChar(c) { return SYM_NORM[c] ?? c; }

  // 숫자 태그 등 제거
  function stripTags(s) {
    return s
      .replace(/【[０-９0-9\s]+】/g, '')
      .replace(/〔[^〕]*〕/g, '')
      .replace(/^\s*[\u3000\s]+/, '')
      .trim();
  }

  // 숫자/기호만으로 구성된 짧은 태그 줄 판별
  function isTagLine(s) {
    const t = stripTags(s);
    if (!t.length) return true;
    if (t.length <= 6 && /^[0-9０-９\s\-_・]+$/.test(t)) return true;
    return false;
  }

  // HTML → 문장 배열 추출 (mammoth의 HTML 결과 또는 raw text)
  function extractSentences(input) {
    let raw = '';

    // HTML 문자열인지 확인
    if (input.includes('<p>') || input.includes('<p ')) {
      const div = document.createElement('div');
      div.innerHTML = input;
      const paras = [...div.querySelectorAll('p')]
        .map(p => p.textContent.trim()).filter(s => s.length > 0);
      if (paras.length > 1) {
        raw = paras.join('\n');
      } else {
        raw = div.textContent;
      }
    } else {
      raw = input;
    }

    // 줄 단위로 분리 + 전처리
    return raw
      .split(/\r\n|\r|\n|\u000B|\u000C|\u2028|\u2029/)
      .map(s => {
        const stripped = stripTags(s);
        // 전각→반각 정규화
        return [...stripped].map(normChar).join('').trim();
      })
      .filter(s => s.length > 0 && !isTagLine(s));
  }

  return { extractSentences, stripTags, normChar, isTagLine };
})();

if (typeof window !== 'undefined') window.Preprocessor = Preprocessor;
