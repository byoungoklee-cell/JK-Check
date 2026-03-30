/**
 * matcher.js — DP 문장 매칭
 * tsx의 matchSentences 로직을 그대로 반영
 */

const Matcher = (() => {

  /**
   * DP 기반 1:1 문장 매칭 (tsx의 matchSentences와 동일)
   */
  function match(jpList, krList) {
    const n = jpList.length, m = krList.length;

    function simRaw(i, j) {
      return Similarity.calculate(
        jpList[i], krList[j], i, n, j, m
      ).overall;
    }

    // dp[i][j] = i개 JP, j개 KR 소비 시 최적 점수
    const dp   = Array.from({ length: n + 1 }, () => new Float32Array(m + 1).fill(-Infinity));
    const from = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));

    dp[0][0] = 0;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= m; j++) {
        if (dp[i][j] === -Infinity) continue;
        // 매칭
        if (i < n && j < m) {
          const v = dp[i][j] + simRaw(i, j);
          if (v > dp[i+1][j+1]) { dp[i+1][j+1] = v; from[i+1][j+1] = 'm'; }
        }
        // JP 스킵
        if (i < n) {
          const v = dp[i][j] - 0.1;
          if (v > dp[i+1][j]) { dp[i+1][j] = v; from[i+1][j] = 'sj'; }
        }
        // KR 스킵
        if (j < m) {
          const v = dp[i][j] - 0.1;
          if (v > dp[i][j+1]) { dp[i][j+1] = v; from[i][j+1] = 'sk'; }
        }
      }
    }

    // 역추적
    const pairs = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      const f = from[i][j];
      if (f === 'm') {
        pairs.unshift({ jp: jpList[i-1], kr: krList[j-1], ji: i-1, ki: j-1 });
        i--; j--;
      } else if (f === 'sj' || j === 0) {
        pairs.unshift({ jp: jpList[i-1], kr: '', ji: i-1, ki: -1 });
        i--;
      } else {
        pairs.unshift({ jp: '', kr: krList[j-1], ji: -1, ki: j-1 });
        j--;
      }
    }

    const matched    = pairs.filter(p => p.jp && p.kr);
    const unmatchedJa = pairs.filter(p => p.jp && !p.kr);
    const unmatchedKo = pairs.filter(p => !p.jp && p.kr);

    return { pairs: matched, unmatchedJa, unmatchedKo, all: pairs };
  }

  /**
   * 매칭 결과를 reviewer.js가 사용하는 행 형식으로 변환
   * tsx에서는 pairs 배열을 그대로 사용하므로 여기서 정렬만 함
   */
  function buildDisplayRows(matchResult) {
    return matchResult.all
      .filter(p => p.jp || p.kr)
      .map((p, idx) => ({
        num:         idx + 1,
        type:        p.jp && p.kr ? 'matched' : p.jp ? 'unmatchedJa' : 'unmatchedKo',
        jaIdx:       p.ji,
        koIdx:       p.ki,
        jaText:      p.jp || '',
        koText:      p.kr || '',
        similarity:  null,
        similarityDetails: null,
        status:      'none',
        memo:        '',
        editedKoText: null,
      }));
  }

  return { match, buildDisplayRows };
})();

if (typeof window !== 'undefined') window.Matcher = Matcher;
