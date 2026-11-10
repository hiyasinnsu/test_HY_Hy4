import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, FIELD, LIMITS } from '../src/config.js';
import {
  BOSS_PHASES,
  Game,
  WAVES,
} from '../src/game.js';
import { STATES } from '../src/state.js';

function activeCount(pool) {
  let count = 0;
  for (const entry of pool) if (entry.active) count += 1;
  return count;
}

test('game: starts on title, transitions through pause and returns to title', () => {
  const game = new Game({ highScore: 1234, seed: 7 });
  assert.equal(game.state, STATES.TITLE);
  assert.equal(game.score.highScore, 1234);
  assert.equal(game.player.lives, 3);
  assert.equal(game.player.bombs, 3);

  assert.equal(game.start(7), true);
  assert.equal(game.state, STATES.PLAYING);
  assert.equal(game.pause(), true);
  assert.equal(game.state, STATES.PAUSED);
  assert.equal(game.resume(), true);
  assert.equal(game.state, STATES.PLAYING);
  assert.equal(game.toTitle(), true);
  assert.equal(game.state, STATES.TITLE);
  assert.equal(game.score.score, 0);
  assert.equal(game.score.highScore, 1234);
});

test('game: touch target moves the ship without snapping outside the field', () => {
  const game = new Game({ seed: 5 });
  game.start(5);
  game.setTouchActive(true);
  game.setTouchTarget(300, 200);
  for (let i = 0; i < 90; i += 1) game.updatePlayer(1 / 60);
  assert.ok(game.player.x > 280, `x=${game.player.x}`);
  assert.ok(game.player.y < 260, `y=${game.player.y}`);

  game.setTouchTarget(-100, 9999);
  for (let i = 0; i < 120; i += 1) game.updatePlayer(1 / 60);
  assert.ok(Math.abs(game.player.x - 12) < 1e-9);
  assert.ok(Math.abs(game.player.y - (FIELD.HEIGHT - 28)) < 1e-9);
});

test('game: bomb consumes a stock, clears bullets and starts a cooldown', () => {
  const game = new Game({ seed: 9 });
  game.start(9);
  game._emit([
    { x: 100, y: 100, vx: 0, vy: 40, radius: 3.2, color: 0, type: 'orb' },
    { x: 120, y: 120, vx: 0, vy: 40, radius: 3.2, color: 1, type: 'orb' },
  ]);
  assert.equal(activeCount(game.enemyBullets), 2);

  assert.equal(game.useBomb(), true);
  assert.equal(game.player.bombs, 2);
  assert.equal(activeCount(game.enemyBullets), 0);
  assert.ok(game.player.invuln >= 1.5);
  assert.equal(game.useBomb(), false, 'cooldown must block a second bomb');
});

test('game: the last life ends the run with gameover', () => {
  const game = new Game({ seed: 11 });
  game.start(11);
  game.player.lives = 1;
  game.player.invuln = 0;
  game._emit([
    {
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      radius: 3.2,
      color: 0,
      type: 'orb',
    },
  ]);
  game.updateEnemyBullets(1 / 60);
  assert.equal(game.state, STATES.GAMEOVER);
  assert.equal(game.player.lives, 0);
  assert.equal(game.player.alive, false);
  assert.ok(game.score.highScore >= 0);
});

test('game: a minute of play advances every wave and spawns the boss under the bullet cap', () => {
  const game = new Game({ seed: 2026 });
  game.start(2026);
  let maxBullets = 0;
  let maxEnemies = 0;
  for (let i = 0; i < 60 * 60; i += 1) {
    game.player.invuln = Math.max(game.player.invuln, 5);
    game.update(1 / 60);
    if (i % 20 === 0) {
      maxBullets = Math.max(maxBullets, activeCount(game.enemyBullets));
      maxEnemies = Math.max(maxEnemies, activeCount(game.enemies));
    }
    if (game.state !== STATES.PLAYING) break;
  }
  assert.equal(game.state, STATES.PLAYING);
  assert.equal(game.waveIndex, WAVES.length);
  assert.equal(game.bossSpawned, true);
  assert.ok(game.boss, 'boss should exist after 58 seconds');
  assert.ok(maxBullets <= LIMITS.ENEMY_BULLETS);
  assert.ok(maxBullets > 0, 'some bullets should have been fired by the boss or enemies');
  assert.ok(maxEnemies >= 3, `enemy waves should overlap; max active was ${maxEnemies}`);
});

test('game: boss exposes three phases using all five attack patterns', () => {
  assert.equal(BOSS_PHASES.length, 3);
  const kinds = new Set(BOSS_PHASES.flat());
  for (const required of ['ring', 'fan', 'spiral', 'petal', 'wall']) {
    assert.equal(kinds.has(required), true, `missing pattern: ${required}`);
  }
  for (let i = 1; i < WAVES.length; i += 1) {
    assert.ok(WAVES[i].at > WAVES[i - 1].at, 'wave times must be increasing');
  }
});

test('game: boss phases advance, and defeating the boss reaches clear', () => {
  const game = new Game({ seed: 77 });
  game.start(77);
  game.spawnBoss();
  game.boss.entering = false;
  game.boss.y = BOSS.ENTER_Y;
  game.boss.invuln = 0;

  const scoreBefore = game.score.score;
  game.damageBoss(2200);
  assert.equal(game.boss.phase, 1);
  assert.equal(game.score.score - scoreBefore, 1200);
  assert.ok(game.boss.invuln > 0, 'phase change must provide a short invulnerability');

  game.boss.invuln = 0;
  game.damageBoss(2200);
  assert.equal(game.boss.phase, 2);

  game.boss.invuln = 0;
  const scoreBeforeBossDown = game.score.score;
  game.damageBoss(5000);
  assert.equal(game.boss, null);
  assert.equal(game.bossDefeated, true);
  assert.ok(game.clearTimer > 0);
  assert.ok(game.score.score > scoreBeforeBossDown, 'boss defeat must award score');

  game.updateStage(1.0);
  assert.equal(game.state, STATES.PLAYING);
  game.updateStage(1.2);
  assert.equal(game.state, STATES.CLEAR);
  assert.ok(game.score.highScore > 0);
});

test('game: each boss attack emits bullets', () => {
  const game = new Game({ seed: 31 });
  game.start(31);
  game.spawnBoss();
  game.boss.entering = false;
  game.boss.y = BOSS.ENTER_Y;
  game.boss.invuln = 0;
  for (const kind of ['ring', 'fan', 'spiral', 'petal', 'wall']) {
    game.clearEnemyBullets(false);
    game.boss.attack = null;
    game.boss.windup = 0;
    game.boss.pendingKind = kind;
    game.boss.attackIndex = 0;
    for (let i = 0; i < 150; i += 1) game.updateBoss(1 / 60);
    assert.ok(activeCount(game.enemyBullets) > 0, `${kind} produced no bullets`);
  }
});
