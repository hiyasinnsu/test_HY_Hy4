import { TUNING } from './config.js';

export const STATES = Object.freeze({
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  GAMEOVER: 'gameover',
  CLEAR: 'clear',
});

// 明示的に許可した遷移だけを通す。UI とゲーム本体の状態ずれを防ぐ。
export const TRANSITIONS = Object.freeze({
  [STATES.TITLE]: Object.freeze([STATES.PLAYING]),
  [STATES.PLAYING]: Object.freeze([STATES.PAUSED, STATES.GAMEOVER, STATES.CLEAR, STATES.TITLE]),
  [STATES.PAUSED]: Object.freeze([STATES.PLAYING, STATES.TITLE]),
  [STATES.GAMEOVER]: Object.freeze([STATES.PLAYING, STATES.TITLE]),
  [STATES.CLEAR]: Object.freeze([STATES.PLAYING, STATES.TITLE]),
});

export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function transition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`invalid state transition: ${from} -> ${to}`);
  }
  return to;
}

export function createScoreState(highScore = 0) {
  const safeHigh = Number.isFinite(highScore) ? Math.max(0, Math.floor(highScore)) : 0;
  return {
    score: 0,
    highScore: safeHigh,
    graze: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
  };
}

export function addScore(scoreState, base, multiplier = 1) {
  const amount = Math.max(0, Math.round(base * multiplier));
  scoreState.score += amount;
  return amount;
}

// かすりは連続するほど 1 回の価値が上がる（10 → 最大 50）。
export function grazeScore(combo) {
  return 10 + Math.min(40, Math.floor(Math.max(0, combo - 1) / 5) * 5);
}

export function registerGraze(scoreState) {
  scoreState.graze += 1;
  scoreState.combo += 1;
  scoreState.comboTimer = TUNING.GRAZE_COMBO_TIME;
  if (scoreState.combo > scoreState.bestCombo) {
    scoreState.bestCombo = scoreState.combo;
  }
  return addScore(scoreState, grazeScore(scoreState.combo));
}

export function tickCombo(scoreState, dt) {
  if (scoreState.combo === 0) return;
  scoreState.comboTimer -= dt;
  if (scoreState.comboTimer <= 0) {
    scoreState.combo = 0;
    scoreState.comboTimer = 0;
  }
}

export function commitHighScore(scoreState) {
  scoreState.highScore = Math.max(scoreState.highScore, scoreState.score);
  return scoreState.highScore;
}

export function displayHighScore(scoreState) {
  return Math.max(scoreState.highScore, scoreState.score);
}

export function clearBonus({ lives = 0, bombs = 0, graze = 0 } = {}) {
  const safeLives = Math.max(0, Math.floor(Number(lives) || 0));
  const safeBombs = Math.max(0, Math.floor(Number(bombs) || 0));
  const safeGraze = Math.max(0, Math.floor(Number(graze) || 0));
  return safeLives * 500 + safeBombs * 200 + safeGraze * 2;
}
