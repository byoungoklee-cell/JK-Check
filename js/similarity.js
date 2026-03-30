/**
 * similarity.js — 유사도 계산
 * tsx의 seqSimilarity / calcSimScores 로직을 그대로 반영
 */

const Similarity = (() => {

  const SYM_SET = new Set('!?@#$%^&*+=|~`"\';:,./<>(){}[]\\-_'.split(''));

  const SYM_NORM = (() => {
    const m = {};
    for (let i = 0xFF01; i <= 0xFF5E; i++)
      m[String.fromCharCode(i)] = String.fromCharCode(i - 0xFEE0);
    Object.assign(m, {
      '\u3000': ' ', '、': ',', '。': '.', '「': '"', '」': '"',
      '【': '[', '】': ']', '〔': '[', '〕': ']',
      '～': '~', '〜': '~', '…': '.', '—': '-', '–': '-', '―': '-',
    });
    return m;
  })();

  function normChar(c) { return SYM_NORM[c] ?? c; }

  function extractNums(s) {
    return ([...s].map(normChar).join('').match(/[0-9]+/g) || []).flatMap(n => [...n]);
  }

  function extractAlpha(s) {
    return ([...s].map(normChar).join('').match(/[A-Za-z]+/g) || []).flatMap(w => [...w.toLowerCase()]);
  }

  function extractSyms(s) {
    return [...s].map(normChar).filter(c => SYM_SET.has(c));
  }

  // LCS 기반 시퀀스 유사도 (tsx의 seqSimilarity와 동일)
  function seqSimilarity(a, b) {
    if (!a.length && !b.length) return null;
    if (!a.length || !b.length) return 0;

    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++)
        dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

    const lcs = dp[n][m];
    const sA = new Set(a), sB = new Set(b);
    const shared = [...sA].filter(x => sB.has(x)).length;
    const union  = new Set([...sA, ...sB]).size;
    return (union > 0 ? shared / union : 0) * 0.4 + (lcs / Math.max(n, m)) * 0.6;
  }

  /**
   * 유사도 계산 (tsx의 calcSimScores와 동일)
   * @param {string} jp
   * @param {string} kr
   * @param {number} ji  — JP 인덱스
   * @param {number} jn  — JP 전체 문장 수
   * @param {number} ki  — KR 인덱스
   * @param {number} kn  — KR 전체 문장 수
   * @returns {{ overall, details }}
   */
  function calculate(jp, kr, ji, jn, ki, kn) {
    if (!jp || !kr) {
      return {
        overall: 0,
        details: {
          length:   { value: 0, label: '길이',    isNA: false },
          number:   { value: null, label: '숫자',   isNA: true },
          alphabet: { value: null, label: '알파벳', isNA: true },
          symbol:   { value: null, label: '기호',   isNA: true },
          position: { value: 0, label: '위치',    isNA: false },
        },
      };
    }

    const ratio = kr.length / Math.max(jp.length, 1);
    const optimalRatio = jp.length <= 20 ? 1.0 : 1.2;
    const len   = Math.max(0, Math.min(1,
      ratio >= 0.5 && ratio <= 2.5 ? 1 - Math.abs(ratio - optimalRatio) / 1.5 : 0
    ));

    const numVal   = seqSimilarity(extractNums(jp),  extractNums(kr));
    const alphaVal = seqSimilarity(extractAlpha(jp), extractAlpha(kr));
    const symVal   = seqSimilarity(extractSyms(jp),  extractSyms(kr));
    const pos      = Math.max(0, 1 - Math.abs(
      (jn > 1 ? ji / (jn - 1) : 0) - (kn > 1 ? ki / (kn - 1) : 0)
    ) * 3);

    const total = Math.max(0, Math.min(1,
      len * 0.25 +
      (numVal   ?? 1) * 0.30 +
      (alphaVal ?? 1) * 0.20 +
      (symVal   ?? 1) * 0.10 +
      pos * 0.15
    ));

    return {
      overall: total,
      details: {
        length:   { value: len,      label: '길이',    isNA: false },
        number:   { value: numVal,   label: '숫자',    isNA: numVal   === null },
        alphabet: { value: alphaVal, label: '알파벳',  isNA: alphaVal === null },
        symbol:   { value: symVal,   label: '기호',    isNA: symVal   === null },
        position: { value: pos,      label: '위치',    isNA: false },
      },
    };
  }

  return { calculate };
})();

if (typeof window !== 'undefined') window.Similarity = Similarity;
