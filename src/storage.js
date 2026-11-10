const HIGH_SCORE_KEY = 'hoshikuzu.highscore.v1';
const MUTED_KEY = 'hoshikuzu.muted.v1';

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

// プライベートモードや保存禁止環境でもゲームを止めないため、常に握りつぶす。
export function loadHighScore(storage = defaultStorage()) {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(HIGH_SCORE_KEY);
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.floor(value);
  } catch {
    return 0;
  }
}

export function saveHighScore(value, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    const safe = Math.max(0, Math.floor(Number(value) || 0));
    storage.setItem(HIGH_SCORE_KEY, String(safe));
    return true;
  } catch {
    return false;
  }
}

// 音はデフォルトでミュート。キーが無い場合もミュート扱い。
export function loadMuted(storage = defaultStorage()) {
  if (!storage) return true;
  try {
    const raw = storage.getItem(MUTED_KEY);
    if (raw === null) return true;
    return raw !== '0';
  } catch {
    return true;
  }
}

export function saveMuted(muted, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(MUTED_KEY, muted ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}
