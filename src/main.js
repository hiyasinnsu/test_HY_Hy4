import { FIELD, MAX_FRAME_DELTA, PLAYER, STEP } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  loadHighScore,
  loadMuted,
  saveHighScore,
  saveMuted,
} from './storage.js';
import { STATES } from './state.js';

const dom = {
  stage: document.getElementById('stage'),
  canvas: document.getElementById('game'),
  overlay: document.getElementById('overlay'),
  kicker: document.getElementById('overlay-kicker'),
  title: document.getElementById('overlay-title'),
  body: document.getElementById('overlay-body'),
  stats: document.getElementById('overlay-stats'),
  primary: document.getElementById('btn-primary'),
  secondary: document.getElementById('btn-secondary'),
  home: document.getElementById('btn-title'),
  bomb: document.getElementById('btn-bomb'),
  pause: document.getElementById('btn-pause'),
  sound: document.getElementById('btn-sound'),
  fullscreen: document.getElementById('btn-fullscreen'),
  score: document.getElementById('hud-score'),
  high: document.getElementById('hud-hi'),
  lives: document.getElementById('hud-lives'),
  bombs: document.getElementById('hud-bombs'),
  power: document.getElementById('hud-power-fill'),
  graze: document.getElementById('hud-graze'),
  combo: document.getElementById('hud-combo'),
  comboWrap: document.getElementById('hud-combo-wrap'),
  wave: document.getElementById('hud-wave'),
  bossBar: document.getElementById('boss-bar'),
  bossName: document.getElementById('boss-name'),
  bossPhase: document.getElementById('boss-phase'),
  bossFill: document.getElementById('boss-fill'),
  bossLabel: document.getElementById('boss-label'),
};

const storedHighScore = loadHighScore();
const muted = loadMuted();
let runCounter = 0;

function createSeed() {
  runCounter += 1;
  const random = Math.floor(Math.random() * 0xffffffff);
  return (Date.now() ^ Math.imul(runCounter, 0x9e3779b9) ^ random) >>> 0;
}

const game = new Game({ highScore: storedHighScore, seed: createSeed() });
const renderer = new Renderer(dom.canvas);
const audio = createAudio({ muted });

const input = createInput({
  canvas: dom.canvas,
  game,
  actions: {
    onGesture: () => audio.unlock(),
    onBomb: () => tryBomb(),
    onPause: () => togglePause(),
    onPrimary: () => primaryAction(),
    onSound: () => toggleSound(),
    onFullscreen: () => toggleFullscreen(),
  },
});

let lastFrame = performance.now();
let accumulator = 0;
let overlayState = null;
let lastHudAt = 0;

function formatScore(value) {
  return String(Math.max(0, Math.floor(value))).padStart(7, '0');
}

function grouped(value) {
  return Math.max(0, Math.floor(value)).toLocaleString('ja-JP');
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setHidden(element, hidden) {
  if (element && element.hidden !== hidden) element.hidden = hidden;
}

function layout() {
  const viewport = window.visualViewport;
  const width = Math.max(1, viewport ? viewport.width : window.innerWidth);
  const height = Math.max(1, viewport ? viewport.height : window.innerHeight);
  const scale = Math.min(width / FIELD.WIDTH, height / FIELD.HEIGHT);
  const cssWidth = Math.max(1, Math.floor(FIELD.WIDTH * scale));
  const cssHeight = Math.max(1, Math.floor(FIELD.HEIGHT * scale));
  dom.stage.style.width = `${cssWidth}px`;
  dom.stage.style.height = `${cssHeight}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(cssWidth, cssHeight, dpr);
}

let layoutScheduled = false;
function scheduleLayout() {
  if (layoutScheduled) return;
  layoutScheduled = true;
  requestAnimationFrame(() => {
    layoutScheduled = false;
    layout();
  });
}

function persistHighScore() {
  saveHighScore(game.getDisplayHighScore());
}

function primaryAction() {
  audio.unlock();
  if (game.state === STATES.PLAYING) return;
  if (game.state === STATES.PAUSED) {
    resumeGame();
  } else {
    startRun();
  }
}

function secondaryAction() {
  audio.unlock();
  if (game.state === STATES.PAUSED) startRun();
  else if (game.state === STATES.GAMEOVER || game.state === STATES.CLEAR) toTitle();
}

function startRun() {
  persistHighScore();
  if (!game.start(createSeed())) return;
  input.cancelTouch();
  accumulator = 0;
  lastFrame = performance.now();
  syncOverlay(true);
  updateHud(true);
}

function resumeGame() {
  if (!game.resume()) return;
  accumulator = 0;
  lastFrame = performance.now();
  syncOverlay(true);
}

function togglePause() {
  if (game.state === STATES.PLAYING) {
    game.pause();
    input.cancelTouch();
    persistHighScore();
    syncOverlay(true);
  } else if (game.state === STATES.PAUSED) {
    resumeGame();
  }
}

function toTitle() {
  if (game.state === STATES.TITLE) return;
  persistHighScore();
  game.toTitle();
  input.cancelTouch();
  accumulator = 0;
  syncOverlay(true);
  updateHud(true);
}

function tryBomb() {
  if (game.state !== STATES.PLAYING) return;
  audio.unlock();
  game.useBomb();
}

function toggleSound() {
  audio.unlock();
  const next = !audio.isMuted();
  audio.setMuted(next);
  saveMuted(next);
  updateSoundButton();
}

function updateSoundButton() {
  const isMuted = audio.isMuted();
  setText(dom.sound, isMuted ? '音 OFF' : '音 ON');
  dom.sound.setAttribute('aria-label', isMuted ? '音をオンにする' : '音をオフにする');
  dom.sound.setAttribute('aria-pressed', String(!isMuted));
  dom.sound.classList.toggle('is-on', !isMuted);
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function toggleFullscreen() {
  const app = document.getElementById('app');
  const request = app.requestFullscreen || app.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    if (!fullscreenElement()) {
      if (request) {
        const result = request.call(app);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } else if (exit) {
      const result = exit.call(document);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    }
  } catch {
    // 全画面非対応の端末では何もしない。
  }
}

function syncOverlay(force = false) {
  const state = game.state;
  if (!force && state === overlayState) return;
  overlayState = state;

  if (state === STATES.PLAYING) {
    dom.overlay.hidden = true;
    return;
  }

  dom.overlay.hidden = false;
  let kicker = '';
  let title = '';
  let body = '';
  let stats = '';
  let primary = 'ゲーム開始';
  let secondary = null;
  let home = null;

  if (state === STATES.TITLE) {
    kicker = 'VERTICAL DANMAKU';
    title = '星屑弾幕';
    body = '指でドラッグして避け、自動射撃で敵を撃ち抜け。\n5種類のボス弾幕をかわして、星喰みを討て。';
    stats = `HI-SCORE  ${formatScore(game.getDisplayHighScore())}`;
    primary = 'ゲーム開始';
  } else if (state === STATES.PAUSED) {
    kicker = 'PAUSED';
    title = '一時停止';
    body = '呼吸を整えて、いつでも再開できる。';
    stats = `SCORE    ${formatScore(game.score.score)}\nGRAZE    ${game.score.graze}    COMBO ${game.score.combo}`;
    primary = '再開';
    secondary = 'リスタート';
    home = 'タイトルへ';
  } else if (state === STATES.GAMEOVER) {
    kicker = 'GAME OVER';
    title = '撃墜';
    body = '無念、力尽きた。\nもう一度、星屑の海へ。';
    stats = `SCORE    ${formatScore(game.score.score)}\nHI-SCORE ${formatScore(game.getDisplayHighScore())}\nGRAZE    ${game.score.graze}    BEST COMBO ${game.score.bestCombo}`;
    primary = 'もう一度';
    secondary = 'タイトルへ';
    persistHighScore();
  } else if (state === STATES.CLEAR) {
    kicker = 'STAGE CLEAR';
    title = '星喰み撃破';
    body = '星喰みのオボロを討ち果たした。\nその軌跡はハイスコアに残る。';
    stats = `SCORE    ${formatScore(game.score.score)}\nHI-SCORE ${formatScore(game.getDisplayHighScore())}\nGRAZE    ${game.score.graze}    BEST COMBO ${game.score.bestCombo}`;
    primary = 'もう一度';
    secondary = 'タイトルへ';
    persistHighScore();
  }

  setText(dom.kicker, kicker);
  setText(dom.title, title);
  setText(dom.body, body);
  setText(dom.stats, stats);
  setHidden(dom.stats, !stats);
  setText(dom.primary, primary);
  setHidden(dom.primary, false);
  setHidden(dom.secondary, secondary === null);
  if (secondary) setText(dom.secondary, secondary);
  setHidden(dom.home, home === null);
  if (home) setText(dom.home, home);
}

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHudAt < 80) return;
  lastHudAt = now;

  const player = game.player;
  setText(dom.score, formatScore(game.score.score));
  setText(dom.high, formatScore(game.getDisplayHighScore()));
  setText(dom.lives, grouped(player.lives));
  setText(dom.bombs, grouped(player.bombs));
  setText(dom.graze, grouped(game.score.graze));
  setText(dom.combo, grouped(game.score.combo));
  const showCombo = game.score.combo >= 2 && game.score.comboTimer > 0;
  setHidden(dom.comboWrap, !showCombo);
  const powerRatio = Math.round((player.power / PLAYER.MAX_POWER) * 100);
  dom.power.style.width = `${powerRatio}%`;

  let waveLabel;
  if (game.bossSpawned) waveLabel = game.bossDefeated ? 'BOSS DOWN' : 'BOSS BATTLE';
  else waveLabel = `WAVE ${Math.max(1, Math.min(game.waveIndex, game.waveTotal))}/${game.waveTotal}`;
  setText(dom.wave, waveLabel);

  const info = game.getBossInfo();
  setHidden(dom.bossBar, !info);
  if (info) {
    setText(dom.bossName, info.name);
    setText(dom.bossPhase, `PHASE ${info.phase + 1}/${3}`);
    dom.bossFill.style.width = `${Math.round(info.ratio * 100)}%`;
    const label = info.warning
      ? `予告: ${info.label || '接近中'}`
      : (info.label || '');
    setText(dom.bossLabel, label);
  }

  const bombDisabled = game.state !== STATES.PLAYING || player.bombs <= 0;
  if (dom.bomb.disabled !== bombDisabled) dom.bomb.disabled = bombDisabled;
  const pauseDisabled = game.state !== STATES.PLAYING && game.state !== STATES.PAUSED;
  if (dom.pause.disabled !== pauseDisabled) dom.pause.disabled = pauseDisabled;
}

function frame(now) {
  requestAnimationFrame(frame);
  let delta = (now - lastFrame) / 1000;
  lastFrame = now;
  if (!Number.isFinite(delta) || delta < 0) delta = 0;
  delta = Math.min(delta, MAX_FRAME_DELTA);

  if (game.state === STATES.PLAYING) {
    accumulator += delta;
    const move = input.getMoveVector();
    game.setKeyMove(move.x, move.y);
    game.setFocus(input.isFocus());
    let steps = 0;
    while (accumulator >= STEP && steps < 8 && game.state === STATES.PLAYING) {
      game.update(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (game.state !== STATES.PLAYING) accumulator = 0;
  } else {
    accumulator = 0;
  }

  renderer.render(game, delta, now / 1000);

  const events = game.drainEvents();
  if (events) {
    for (const event of events) audio.play(event);
  }

  syncOverlay(false);
  updateHud(false);
}

dom.primary.addEventListener('click', () => {
  audio.unlock();
  primaryAction();
});
dom.secondary.addEventListener('click', () => {
  audio.unlock();
  secondaryAction();
});
dom.home.addEventListener('click', () => {
  audio.unlock();
  toTitle();
});
dom.bomb.addEventListener('click', () => {
  audio.unlock();
  tryBomb();
});
dom.pause.addEventListener('click', () => {
  audio.unlock();
  togglePause();
});
dom.sound.addEventListener('click', () => {
  audio.unlock();
  toggleSound();
});
dom.fullscreen.addEventListener('click', () => {
  audio.unlock();
  toggleFullscreen();
});

window.addEventListener('resize', scheduleLayout, { passive: true });
window.addEventListener('orientationchange', scheduleLayout);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleLayout);
  window.visualViewport.addEventListener('scroll', scheduleLayout);
}
document.addEventListener('fullscreenchange', scheduleLayout);
document.addEventListener('webkitfullscreenchange', scheduleLayout);

window.addEventListener('pointerdown', () => audio.unlock(), { once: true, passive: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === STATES.PLAYING) {
      game.pause();
      input.cancelTouch();
      syncOverlay(true);
    }
    persistHighScore();
  } else {
    lastFrame = performance.now();
    accumulator = 0;
  }
});

// ウィンドウ外にフォーカスが移った間もゲームを進めない。
window.addEventListener('blur', () => {
  if (game.state === STATES.PLAYING) {
    game.pause();
    input.cancelTouch();
    persistHighScore();
    syncOverlay(true);
  }
});

window.addEventListener('beforeunload', persistHighScore);

if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) {
  dom.fullscreen.hidden = true;
}

layout();
updateSoundButton();
syncOverlay(true);
updateHud(true);
requestAnimationFrame(frame);
