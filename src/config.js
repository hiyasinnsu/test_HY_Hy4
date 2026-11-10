// ゲーム全体で共有する定数。DOM に依存しない。
export const FIELD = Object.freeze({ WIDTH: 360, HEIGHT: 640 });

// 固定タイムステップ。フレーム差で難易度が変わらないようにする。
export const STEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.1;

export const LIMITS = Object.freeze({
  ENEMY_BULLETS: 600,
  PLAYER_BULLETS: 160,
  PARTICLES: 420,
  ITEMS: 24,
  ENEMIES: 64,
});

export const PLAYER = Object.freeze({
  START_X: 180,
  START_Y: 552,
  HIT_RADIUS: 3,
  GRAZE_RADIUS: 16,
  SPEED: 235,
  FOCUS_SPEED: 110,
  LIVES: 3,
  BOMBS: 3,
  INVULN_TIME: 2,
  FIRE_INTERVAL: 0.075,
  SHOT_DAMAGE: 7,
  SHOT_SPEED: 560,
  MAX_POWER: 4,
});

export const ENEMY_BULLET_RADIUS = 3.2;

export const BOSS = Object.freeze({
  MAX_HP: 6000,
  SPAWN_TIME: 58,
  ENTER_Y: 190,
  COLLISION_RADIUS: 44,
});

export const SCORE = Object.freeze({
  ENEMY: 120,
  ELITE: 600,
  BOSS_PHASE: 1200,
  BOSS_DEFEAT: 8000,
  POWER_MAX: 250,
});

// 難易度と可読性のための調整値。スマホの小画面でも避けられる弾速に抑える。
export const TUNING = Object.freeze({
  BOMB_INVULN: 1.6,
  BOMB_DAMAGE: 300,
  BOMB_COOLDOWN: 0.7,
  GRAZE_COMBO_TIME: 1.6,
  ENEMY_BULLET_SPEED: 88,
});
