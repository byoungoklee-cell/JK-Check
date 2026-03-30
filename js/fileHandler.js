/**
 * fileHandler.js — app.js에서 직접 mammoth를 사용하므로
 * 여기서는 드롭존 drag & drop 초기화 유틸만 제공 (레거시 호환)
 */
const FileHandler = (() => {
  function init() {
    // app.js가 직접 처리하므로 여기서는 아무 것도 하지 않음
  }
  function reset() {}
  return { init, reset };
})();

if (typeof window !== 'undefined') window.FileHandler = FileHandler;
