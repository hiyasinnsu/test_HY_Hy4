import {
  BOSS,
  ENEMY_BULLET_RADIUS,
  FIELD,
  LIMITS,
  PLAYER,
  SCORE,
  TUNING,
} from './config.js';
import { TAU, angleTo, circleOverlap, clamp } from './math.js';
import {
  ATTACK_LABELS,
  aimedFan,
  petal,
  ring,
  spiral,
  sweepingWall,
} from './patterns.js';
import { createRng } from './rng.js';
import {
  STATES,
  addScore,
  canTransition,
  clearBonus,
  commitHighScore,
  createScoreState,
  registerGraze,
  tickCombo,
  transition,
} from './state.js';

export const BOSS_NAME = '星喰みのオボロ';

// ステージ進行。ボスは最後のウェーブ後に登場する。
export const WAVES = Object.freeze([
  { at: 1.2, type: 'line', count: 5, path: 'straight', hp: 70, fire: 2.4, shots: 1, drop: 0.18 },
  { at: 8.0, type: 'sine', count: 6, path: 'sine', hp: 80, fire: 2.1, shots: 3, drop: 0.24 },
  { at: 15.5, type: 'dive', count: 5, path: 'dive', hp: 80, fire: 2.6, shots: 1, drop: 0.2 },
  { at: 23.0, type: 'side', count: 4, path: 'side', dir: 1, hp: 95, fire: 2.0, shots: 3, drop: 0.26 },
  { at: 24.5, type: 'side', count: 4, path: 'side', dir: -1, hp: 95, fire: 2.0, shots: 3, drop: 0.26 },
  { at: 32.0, type: 'line', count: 7, path: 'straight', hp: 110, fire: 1.8, shots: 3, drop: 0.2 },
  { at: 39.5, type: 'sine', count: 8, path: 'sine', hp: 125, fire: 1.8, shots: 3, drop: 0.24 },
  { at: 47.0, type: 'elite', count: 2, path: 'hover', hp: 520, elite: true, fire: 1.6, shots: 5, drop: 1 },
  { at: 51.5, type: 'dive', count: 7, path: 'dive', hp: 140, fire: 2.0, shots: 3, drop: 0.2 },
]);

// ボスは 3 フェーズ。5 種類の弾幕を組み合わせる。
export const BOSS_PHASES = Object.freeze([
  Object.freeze(['ring', 'fan']),
  Object.freeze(['fan', 'spiral', 'petal']),
  Object.freeze(['wall', 'spiral', 'ring', 'petal']),
]);

const BOSS_ATTACK_DURATION = Object.freeze({
  ring: 4.6,
  fan: 4.0,
  spiral: 3.4,
  petal: 4.2,
  wall: 4.6,
});

function makePool(size) {
  const pool = new Array(size);
  for (let i = 0; i < size; i += 1) {
    pool[i] = { active: false };
  }
  return pool;
}

function createPlayer() {
  return {
    x: PLAYER.START_X,
    y: PLAYER.START_Y,
    r: PLAYER.HIT_RADIUS,
    lives: PLAYER.LIVES,
    bombs: PLAYER.BOMBS,
    power: 0,
    invuln: 0,
    fireTimer: 0,
    bombCooldown: 0,
    focus: false,
    alive: true,
    touch: {
      active: false,
      x: PLAYER.START_X,
      y: PLAYER.START_Y,
    },
  };
}

export class Game {
  constructor({ highScore = 0, seed = 1 } = {}) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    this.rng = createRng(this.seed);
    this.state = STATES.TITLE;
    this.score = createScoreState(highScore);
    this.events = [];
    this.shockwaves = [];
    this.enemyBullets = makePool(LIMITS.ENEMY_BULLETS);
    this.playerBullets = makePool(LIMITS.PLAYER_BULLETS);
    this.particles = makePool(LIMITS.PARTICLES);
    this.items = makePool(LIMITS.ITEMS);
    this.enemies = makePool(LIMITS.ENEMIES);
    this.cursors = {
      enemy: 0,
      player: 0,
      particle: 0,
      item: 0,
      enemyEntity: 0,
    };
    this.keyMove = { x: 0, y: 0 };
    this.player = createPlayer();
    this.time = 0;
    this.waveIndex = 0;
    this.waveTotal = WAVES.length;
    this.boss = null;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.clearTimer = 0;
    this.flash = 0;
    this.shake = 0;
    this._resetWorld();
  }

  _resetWorld() {
    commitHighScore(this.score);
    this.score = createScoreState(this.score.highScore);
    this.player = createPlayer();
    for (const pool of [
      this.enemyBullets,
      this.playerBullets,
      this.particles,
      this.items,
      this.enemies,
    ]) {
      for (const entry of pool) entry.active = false;
    }
    for (const key of Object.keys(this.cursors)) this.cursors[key] = 0;
    this.boss = null;
    this.time = 0;
    this.waveIndex = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.clearTimer = 0;
    this.flash = 0;
    this.shake = 0;
    this.shockwaves.length = 0;
    this.events.length = 0;
    this.keyMove.x = 0;
    this.keyMove.y = 0;
  }

  start(seed = this.seed) {
    if (!canTransition(this.state, STATES.PLAYING)) return false;
    const from = this.state;
    this._resetWorld();
    this.seed = Number.isFinite(seed) ? seed >>> 0 : 1;
    this.rng = createRng(this.seed);
    this.state = transition(from, STATES.PLAYING);
    this.events.push('start');
    return true;
  }

  pause() {
    if (this.state !== STATES.PLAYING) return false;
    this.state = transition(this.state, STATES.PAUSED);
    this.clearTouch();
    return true;
  }

  resume() {
    if (this.state !== STATES.PAUSED) return false;
    this.state = transition(this.state, STATES.PLAYING);
    return true;
  }

  toTitle() {
    if (this.state === STATES.TITLE) return false;
    if (!canTransition(this.state, STATES.TITLE)) return false;
    this.state = transition(this.state, STATES.TITLE);
    this._resetWorld();
    return true;
  }

  update(dt) {
    if (this.state !== STATES.PLAYING) return;
    this.time += dt;
    this.updatePlayer(dt);
    this.updateShooting(dt);
    this.updateStage(dt);
    this.updateEnemies(dt);
    if (this.state !== STATES.PLAYING) return;
    this.updateBoss(dt);
    this.updatePlayerBullets(dt);
    this.updateEnemyBullets(dt);
    if (this.state !== STATES.PLAYING) return;
    this.updateItems(dt);
    this.updateParticles(dt);
    this.updateEffects(dt);
    tickCombo(this.score, dt);
  }

  setKeyMove(x, y) {
    this.keyMove.x = clamp(Number(x) || 0, -1, 1);
    this.keyMove.y = clamp(Number(y) || 0, -1, 1);
  }

  setFocus(value) {
    this.player.focus = Boolean(value);
  }

  setTouchActive(active) {
    this.player.touch.active = Boolean(active);
    if (!active) {
      this.player.touch.x = this.player.x;
      this.player.touch.y = this.player.y;
    }
  }

  setTouchTarget(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.player.touch.x = clamp(x, 12, FIELD.WIDTH - 12);
    this.player.touch.y = clamp(y, 26, FIELD.HEIGHT - 28);
  }

  clearTouch() {
    this.setTouchActive(false);
  }

  getPlayerPosition() {
    return { x: this.player.x, y: this.player.y };
  }

  drainEvents() {
    if (this.events.length === 0) return null;
    const events = this.events;
    this.events = [];
    return events;
  }

  updatePlayer(dt) {
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.bombCooldown = Math.max(0, p.bombCooldown - dt);

    if (p.touch.active) {
      const follow = 1 - Math.exp(-28 * dt);
      p.x += (p.touch.x - p.x) * follow;
      p.y += (p.touch.y - p.y) * follow;
    } else {
      const len = Math.hypot(this.keyMove.x, this.keyMove.y);
      if (len > 0.001) {
        const speed = p.focus ? PLAYER.FOCUS_SPEED : PLAYER.SPEED;
        p.x += (this.keyMove.x / len) * speed * dt;
        p.y += (this.keyMove.y / len) * speed * dt;
      }
    }

    p.x = clamp(p.x, 12, FIELD.WIDTH - 12);
    p.y = clamp(p.y, 26, FIELD.HEIGHT - 28);
  }

  updateShooting(dt) {
    const p = this.player;
    p.fireTimer -= dt;
    if (p.fireTimer > 0) return;
    p.fireTimer += PLAYER.FIRE_INTERVAL;
    if (p.fireTimer < 0) p.fireTimer = 0;
    this.firePlayerShots();
    this.events.push('shot');
  }

  firePlayerShots() {
    const p = this.player;
    const count = 2 + Math.min(p.power, PLAYER.MAX_POWER);
    const width = p.focus ? 0.52 : 1;
    for (let i = 0; i < count; i += 1) {
      const offset = (i - (count - 1) / 2) * 7 * width;
      this.spawnPlayerBullet(p.x + offset, p.y - 10, -Math.PI / 2, PLAYER.SHOT_SPEED, PLAYER.SHOT_DAMAGE);
    }
    if (p.power >= 3) {
      const spread = p.focus ? 0.1 : 0.24;
      this.spawnPlayerBullet(p.x, p.y - 6, -Math.PI / 2 - spread, PLAYER.SHOT_SPEED * 0.94, PLAYER.SHOT_DAMAGE);
      this.spawnPlayerBullet(p.x, p.y - 6, -Math.PI / 2 + spread, PLAYER.SHOT_SPEED * 0.94, PLAYER.SHOT_DAMAGE);
    }
  }

  spawnPlayerBullet(x, y, angle, speed, damage) {
    const b = this._acquire(this.playerBullets, 'player');
    if (!b) return;
    b.x = clamp(x, 2, FIELD.WIDTH - 2);
    b.y = y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.r = 3;
    b.damage = damage;
  }

  updateStage(dt) {
    if (this.bossDefeated) {
      this.player.invuln = Math.max(this.player.invuln, 0.5);
      if (this.clearTimer > 0) {
        this.clearTimer -= dt;
        if (this.clearTimer <= 0) this.finishClear();
      }
      return;
    }

    while (this.waveIndex < WAVES.length && this.time >= WAVES[this.waveIndex].at) {
      this.spawnWave(WAVES[this.waveIndex], this.waveIndex);
      this.waveIndex += 1;
    }

    if (!this.bossSpawned && this.time >= BOSS.SPAWN_TIME) {
      this.spawnBoss();
    }
  }

  spawnWave(wave, waveIndex) {
    const count = wave.count;
    const path = wave.path || 'straight';
    for (let i = 0; i < count; i += 1) {
      let x;
      let y;
      let delay;
      let baseY = 0;
      if (path === 'side') {
        x = wave.dir > 0 ? -28 - i * 16 : FIELD.WIDTH + 28 + i * 16;
        y = 92 + i * 62;
        baseY = y;
        delay = i * 0.22;
      } else if (path === 'dive') {
        const offset = i - (count - 1) / 2;
        x = FIELD.WIDTH / 2 + offset * 54;
        y = -30 - Math.abs(offset) * 18;
        delay = i * 0.12;
      } else if (wave.elite) {
        x = FIELD.WIDTH / 2 + (i === 0 ? -72 : 72);
        y = -46;
        delay = i * 0.55;
      } else {
        x = count === 1 ? FIELD.WIDTH / 2 : 46 + (i / (count - 1)) * (FIELD.WIDTH - 92);
        y = -24 - (i % 2) * 16;
        delay = i * 0.15;
      }

      const e = this._acquire(this.enemies, 'enemyEntity');
      if (!e) break;
      const hp = wave.elite ? wave.hp + waveIndex * 18 : wave.hp + waveIndex * 6;
      Object.assign(e, {
        x,
        y,
        baseX: x,
        baseY,
        t: -delay,
        phase: this.rng.range(0, TAU),
        path,
        dir: wave.dir || 1,
        elite: Boolean(wave.elite),
        hp,
        maxHp: hp,
        r: wave.elite ? 20 : 14,
        scoreValue: wave.elite ? SCORE.ELITE : SCORE.ENEMY + waveIndex * 10,
        fireInterval: wave.fire,
        fireTimer: 1.1 + this.rng.range(0, 0.8) + delay,
        shots: wave.shots,
        dropChance: wave.drop,
        warning: false,
        hitFlash: 0,
        retreat: false,
        diving: false,
        dx: 0,
        dy: 0,
      });
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.t += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.t < 0) continue;
      e.warning = false;

      if (e.retreat) {
        e.y -= 280 * dt;
        e.x += Math.sin(e.t * 6) * 30 * dt;
        if (e.y < -70) e.active = false;
        continue;
      }

      switch (e.path) {
        case 'sine':
          e.y += 40 * dt;
          e.x = e.baseX + Math.sin(e.t * 2.1 + e.phase) * 54;
          break;
        case 'dive':
          if (e.t < 1.1) {
            e.y += 26 * dt;
          } else if (!e.diving) {
            e.diving = true;
            const a = angleTo(e.x, e.y, p.x, p.y);
            e.dx = Math.cos(a) * 170;
            e.dy = Math.sin(a) * 170;
          } else {
            e.x += e.dx * dt;
            e.y += e.dy * dt;
          }
          break;
        case 'side':
          e.x += e.dir * 102 * dt;
          e.y = e.baseY + Math.sin(e.t * 1.9 + e.phase) * 18;
          break;
        case 'hover':
          e.y += (128 - e.y) * Math.min(1, dt * 1.2);
          e.x = e.baseX + Math.sin(e.t * 1.1 + e.phase) * 34;
          break;
        case 'straight':
        default:
          e.y += 48 * dt;
          e.x = e.baseX + Math.sin(e.t * 1.5 + e.phase) * 22;
          break;
      }

      if (e.path === 'side' && e.t > 1.5 && (e.x < -70 || e.x > FIELD.WIDTH + 70)) {
        e.active = false;
        continue;
      }
      if (e.y > FIELD.HEIGHT + 60 || e.y < -140) {
        e.active = false;
        continue;
      }

      if (e.y > -4 && e.y < 430 && e.x > 4 && e.x < FIELD.WIDTH - 4) {
        e.fireTimer -= dt;
        if (e.fireTimer < 0.55) e.warning = true;
        if (e.fireTimer <= 0) {
          e.fireTimer += e.fireInterval;
          e.warning = false;
          this.enemyFire(e);
        }
      }

      if (e.y > 0 && circleOverlap(p.x, p.y, p.r, e.x, e.y, e.r)) {
        this.hitPlayer();
        if (this.state !== STATES.PLAYING) return;
      }
    }
  }

  enemyFire(e) {
    if (this.state !== STATES.PLAYING) return;
    const shots = e.shots || 1;
    const spread = shots <= 1 ? 0 : shots >= 5 ? 1.05 : 0.5;
    const speed = TUNING.ENEMY_BULLET_SPEED + (e.elite ? 4 : 0);
    this._emit(aimedFan(e.x, e.y, this.player.x, this.player.y, {
      count: shots,
      spread,
      speed,
      color: e.elite ? 3 : 0,
      type: shots >= 5 ? 'petal' : 'orb',
    }));
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    if (b.hitFlash > 0) b.hitFlash = Math.max(0, b.hitFlash - dt);
    if (b.invuln > 0) b.invuln = Math.max(0, b.invuln - dt);

    if (b.entering) {
      b.y += 96 * dt;
      if (b.y >= BOSS.ENTER_Y) {
        b.y = BOSS.ENTER_Y;
        b.entering = false;
        b.windup = 1.25;
        b.invuln = 0.35;
        b.pendingKind = b.queue[0];
        this.flash = Math.max(this.flash, 0.3);
        this.shake = Math.max(this.shake, 8);
        this.addShockwave(b.x, b.y, { color: 2, maxRadius: 220, life: 0.8 });
        this.events.push('boss');
      }
      return;
    }

    if (b.hp <= 0) return;
    b.x = FIELD.WIDTH / 2 + Math.sin(b.t * 0.62) * 82;
    b.y = BOSS.ENTER_Y + Math.sin(b.t * 1.3) * 9;

    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup > 0) return;
    }
    if (!b.attack) {
      this.startBossAttack(b);
      return;
    }

    const a = b.attack;
    a.t += dt;
    if (a.t >= a.duration) {
      b.attack = null;
      b.currentLabel = '';
      b.windup = 0.95 + this.rng.range(0, 0.35);
      b.pendingKind = b.queue[b.attackIndex % b.queue.length];
      return;
    }

    const rate = 1 + b.phase * 0.17;
    const speedBoost = 1 + b.phase * 0.06;
    a.tick -= dt;
    if (a.tick > 0) return;

    switch (a.kind) {
      case 'ring':
        a.tick += 1.55 / rate;
        this._emit(ring(b.x, b.y, {
          count: 18,
          speed: 70 * speedBoost,
          offset: a.angle,
          color: 0,
        }));
        a.angle += 0.28;
        break;
      case 'fan':
        a.tick += 0.92 / rate;
        this._emit(aimedFan(b.x, b.y, this.player.x, this.player.y, {
          count: 7,
          spread: 1.0,
          speed: 92 * speedBoost,
          color: 2,
        }));
        break;
      case 'spiral':
        a.tick += 0.062 / rate;
        a.angle += 0.21;
        this._emit(spiral(b.x, b.y, {
          count: 2,
          speed: 80 * speedBoost,
          startAngle: a.angle,
          step: Math.PI,
          color: 1,
        }));
        break;
      case 'petal':
        a.tick += 1.2 / rate;
        a.angle += 0.37;
        this._emit(petal(b.x, b.y, {
          petals: 6,
          perPetal: 3,
          speed: 74 * speedBoost,
          offset: a.angle,
          color: 3,
        }));
        break;
      case 'wall':
        a.tick += 1.2 / rate;
        this._emit(sweepingWall({
          x: FIELD.WIDTH / 2,
          y: -12,
          count: 9,
          spacing: 38,
          gapIndex: a.gapIndex,
          gapWidth: 2,
          speed: 72 * speedBoost,
          sweep: 24,
          color: 2,
        }));
        a.gapIndex = (a.gapIndex + 3) % 8;
        break;
      default:
        break;
    }
  }

  startBossAttack(b) {
    const kind = b.pendingKind || b.queue[0];
    b.attackIndex += 1;
    b.attack = {
      kind,
      label: ATTACK_LABELS[kind] || '',
      t: 0,
      tick: 0.32,
      angle: this.rng.angle(),
      gapIndex: this.rng.int(0, 7),
      duration: BOSS_ATTACK_DURATION[kind] || 4,
    };
    b.currentLabel = b.attack.label;
    this.events.push('bossAttack');
  }

  spawnBoss() {
    this.bossSpawned = true;
    this.clearEnemyBullets(true);
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.retreat = true;
      e.warning = false;
    }
    this.boss = {
      name: BOSS_NAME,
      x: FIELD.WIDTH / 2,
      y: -70,
      t: 0,
      hp: BOSS.MAX_HP,
      maxHp: BOSS.MAX_HP,
      phase: 0,
      entering: true,
      invuln: 0.6,
      hitFlash: 0,
      windup: 0,
      attack: null,
      attackIndex: 0,
      queue: BOSS_PHASES[0],
      pendingKind: BOSS_PHASES[0][0],
      currentLabel: '',
      dead: false,
    };
    this.flash = Math.max(this.flash, 0.2);
    this.events.push('warning');
  }

  damageBoss(amount) {
    const b = this.boss;
    if (!b || b.dead || b.entering || b.invuln > 0) return false;
    b.hp = Math.max(0, b.hp - amount);
    b.hitFlash = 0.07;
    while (
      b.phase < BOSS_PHASES.length - 1
      && b.hp <= b.maxHp * (1 - (b.phase + 1) / BOSS_PHASES.length)
    ) {
      this.enterBossPhase(b.phase + 1);
    }
    if (b.hp <= 0) {
      this.killBoss();
    }
    return true;
  }

  enterBossPhase(phase) {
    const b = this.boss;
    if (!b) return;
    b.phase = phase;
    b.queue = BOSS_PHASES[Math.min(phase, BOSS_PHASES.length - 1)];
    b.attackIndex = 0;
    b.pendingKind = b.queue[0];
    b.attack = null;
    b.currentLabel = '';
    b.windup = 1.45;
    b.invuln = 0.8;
    addScore(this.score, SCORE.BOSS_PHASE);
    this.clearEnemyBullets(true);
    this.flash = Math.max(this.flash, 0.55);
    this.shake = Math.max(this.shake, 14);
    this.addShockwave(b.x, b.y, { color: 1, maxRadius: 200, life: 0.9 });
    this.events.push('phase');
  }

  killBoss() {
    const b = this.boss;
    if (!b) return;
    this.boss = null;
    this.bossDefeated = true;
    this.clearTimer = 2.0;
    addScore(this.score, SCORE.BOSS_DEFEAT);
    commitHighScore(this.score);
    this.clearEnemyBullets(true);
    this.burst(b.x, b.y, 70, { color: 2, speed: 210, life: 1.1, size: 3 });
    this.burst(b.x, b.y, 36, { color: 0, speed: 140, life: 0.8, size: 2 });
    this.addShockwave(b.x, b.y, { color: 2, maxRadius: 260, life: 1 });
    this.addShockwave(b.x, b.y, { color: 1, maxRadius: 180, life: 1.3 });
    this.flash = 1;
    this.shake = 24;
    this.player.invuln = Math.max(this.player.invuln, 3);
    this.events.push('bossDown');
  }

  finishClear() {
    addScore(this.score, clearBonus({
      lives: this.player.lives,
      bombs: this.player.bombs,
      graze: this.score.graze,
    }));
    commitHighScore(this.score);
    this.state = transition(this.state, STATES.CLEAR);
    this.clearTouch();
    this.events.push('clear');
  }

  updatePlayerBullets(dt) {
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.x < -14 || b.x > FIELD.WIDTH + 14) {
        b.active = false;
        continue;
      }

      if (this.boss && !this.boss.entering) {
        const boss = this.boss;
        if (circleOverlap(b.x, b.y, b.r, boss.x, boss.y, BOSS.COLLISION_RADIUS)) {
          b.active = false;
          this.damageBoss(b.damage);
          continue;
        }
      }

      for (const e of this.enemies) {
        if (!e.active || e.t < 0) continue;
        if (circleOverlap(b.x, b.y, b.r, e.x, e.y, e.r)) {
          b.active = false;
          this.damageEnemy(e, b.damage);
          break;
        }
      }
    }
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -40 || b.x > FIELD.WIDTH + 40 || b.y < -50 || b.y > FIELD.HEIGHT + 50) {
        b.active = false;
        continue;
      }

      if (!p.alive) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d2 = dx * dx + dy * dy;
      const hitR = p.r + b.r;
      if (p.invuln <= 0 && d2 <= hitR * hitR) {
        b.active = false;
        this.hitPlayer();
        if (this.state !== STATES.PLAYING) return;
        continue;
      }
      const grazeR = PLAYER.GRAZE_RADIUS + b.r;
      if (!b.grazed && d2 <= grazeR * grazeR) {
        b.grazed = true;
        registerGraze(this.score);
        this._spawnParticle(
          b.x,
          b.y,
          this.rng.range(-25, 25),
          this.rng.range(-25, 25),
          0.28,
          1.4,
          1,
        );
        this.events.push('graze');
      }
    }
  }

  hitPlayer() {
    const p = this.player;
    if (this.state !== STATES.PLAYING || !p.alive || p.invuln > 0) return false;
    p.lives -= 1;
    p.power = Math.max(0, p.power - 1);
    this.score.combo = 0;
    this.score.comboTimer = 0;
    this.clearTouch();
    this.clearEnemyBullets(true);
    this.burst(p.x, p.y, 30, { color: 0, speed: 190, life: 0.75, size: 2.6 });
    this.addShockwave(p.x, p.y, { color: 0, maxRadius: 120, life: 0.55 });
    this.flash = Math.max(this.flash, 0.7);
    this.shake = Math.max(this.shake, 16);
    this.events.push('hit');

    if (p.lives <= 0) {
      p.lives = 0;
      p.alive = false;
      commitHighScore(this.score);
      this.state = transition(this.state, STATES.GAMEOVER);
      this.events.push('gameover');
      return true;
    }

    p.x = PLAYER.START_X;
    p.y = PLAYER.START_Y;
    p.touch.x = p.x;
    p.touch.y = p.y;
    p.invuln = PLAYER.INVULN_TIME;
    p.bombs = PLAYER.BOMBS;
    p.fireTimer = 0;
    return true;
  }

  useBomb() {
    const p = this.player;
    if (this.state !== STATES.PLAYING || !p.alive) return false;
    if (p.bombs <= 0 || p.bombCooldown > 0) return false;
    p.bombs -= 1;
    p.bombCooldown = TUNING.BOMB_COOLDOWN;
    p.invuln = Math.max(p.invuln, TUNING.BOMB_INVULN);
    this.clearEnemyBullets(true);
    for (const e of this.enemies) {
      if (e.active) this.killEnemy(e);
    }
    if (this.boss) this.damageBoss(TUNING.BOMB_DAMAGE);
    this.flash = 1;
    this.shake = Math.max(this.shake, 18);
    this.addShockwave(p.x, p.y, { color: 1, maxRadius: 300, life: 0.8 });
    this.addShockwave(p.x, p.y, { color: 2, maxRadius: 210, life: 1 });
    this.events.push('bomb');
    return true;
  }

  damageEnemy(e, amount) {
    if (!e.active) return false;
    e.hp -= amount;
    e.hitFlash = 0.1;
    if (e.hp <= 0) this.killEnemy(e);
    return true;
  }

  killEnemy(e) {
    if (!e.active) return;
    e.active = false;
    addScore(this.score, e.scoreValue);
    this.burst(e.x, e.y, e.elite ? 34 : 14, {
      color: e.elite ? 2 : 1,
      speed: e.elite ? 180 : 110,
      life: e.elite ? 0.8 : 0.55,
      size: e.elite ? 3 : 2,
    });
    if (e.elite) {
      this.flash = Math.max(this.flash, 0.35);
      this.shake = Math.max(this.shake, 10);
      this.addShockwave(e.x, e.y, { color: 2, maxRadius: 150, life: 0.7 });
      this.events.push('eliteDown');
    } else {
      this.events.push('enemyDown');
    }
    if (this.rng.next() < e.dropChance) this.spawnPowerItem(e.x, e.y);
  }

  spawnPowerItem(x, y) {
    const item = this._acquire(this.items, 'item');
    if (!item) return;
    item.x = clamp(x, 16, FIELD.WIDTH - 16);
    item.y = y;
    item.age = 0;
  }

  updateItems(dt) {
    const p = this.player;
    for (const item of this.items) {
      if (!item.active) continue;
      item.age += dt;
      const dx = p.x - item.x;
      const dy = p.y - item.y;
      const d2 = dx * dx + dy * dy;
      if (p.alive && d2 < 95 * 95) {
        const pull = 1 - Math.exp(-5 * dt);
        item.x += dx * pull;
        item.y += dy * pull;
      } else {
        item.y += 54 * dt;
        item.x += Math.sin(item.age * 4.2 + item.y * 0.04) * 14 * dt;
      }
      if (item.y > FIELD.HEIGHT + 20) {
        item.active = false;
        continue;
      }
      if (p.alive && circleOverlap(item.x, item.y, 8, p.x, p.y, p.r + 10)) {
        item.active = false;
        if (p.power < PLAYER.MAX_POWER) {
          p.power += 1;
          addScore(this.score, 50);
        } else {
          addScore(this.score, SCORE.POWER_MAX);
        }
        this.events.push('power');
        this.burst(item.x, item.y, 8, { color: 2, speed: 80, life: 0.45, size: 1.8 });
      }
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.1 * dt;
      p.vy *= 1 - 2.1 * dt;
      p.vy += 24 * dt;
    }
  }

  updateEffects(dt) {
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 30);
    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const wave = this.shockwaves[i];
      wave.age += dt;
      if (wave.age >= wave.life) this.shockwaves.splice(i, 1);
    }
  }

  clearEnemyBullets(withParticles = true) {
    let cleared = 0;
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.active = false;
      cleared += 1;
      if (withParticles && cleared % 3 === 0) {
        this._spawnParticle(
          b.x,
          b.y,
          this.rng.range(-40, 40),
          this.rng.range(-40, 40),
          0.35,
          1.6,
          b.color,
        );
      }
    }
    if (cleared > 0) this.events.push('clear');
    return cleared;
  }

  burst(x, y, count, {
    color = 1,
    speed = 120,
    life = 0.6,
    size = 2.2,
  } = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = this.rng.angle();
      const magnitude = this.rng.range(speed * 0.2, speed);
      this._spawnParticle(
        x,
        y,
        Math.cos(angle) * magnitude,
        Math.sin(angle) * magnitude,
        life * this.rng.range(0.6, 1.1),
        size * this.rng.range(0.6, 1.5),
        color,
      );
    }
  }

  addShockwave(x, y, { color = 1, maxRadius = 160, life = 0.6 } = {}) {
    this.shockwaves.push({ x, y, color, maxRadius, life, age: 0 });
    if (this.shockwaves.length > 24) this.shockwaves.shift();
  }

  _spawnParticle(x, y, vx, vy, life, size, color) {
    const p = this._acquire(this.particles, 'particle');
    if (!p) return;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.age = 0;
    p.life = Math.max(0.05, life);
    p.size = size;
    p.color = color;
  }

  _emit(list) {
    for (const src of list) {
      const b = this._acquire(this.enemyBullets, 'enemy');
      if (!b) return;
      b.x = src.x;
      b.y = src.y;
      b.vx = src.vx;
      b.vy = src.vy;
      b.r = src.radius || ENEMY_BULLET_RADIUS;
      b.color = src.color || 0;
      b.type = src.type || 'orb';
      b.age = 0;
      b.grazed = false;
    }
  }

  _acquire(pool, key) {
    const start = this.cursors[key];
    for (let i = 0; i < pool.length; i += 1) {
      const index = (start + i) % pool.length;
      const entry = pool[index];
      if (!entry.active) {
        entry.active = true;
        this.cursors[key] = (index + 1) % pool.length;
        return entry;
      }
    }
    return null;
  }

  getBossInfo() {
    const b = this.boss;
    if (!b) return null;
    return {
      name: b.name,
      hp: b.hp,
      maxHp: b.maxHp,
      phase: b.phase,
      ratio: clamp(b.hp / b.maxHp, 0, 1),
      warning: b.windup > 0 || b.entering,
      label: b.entering ? '接近中' : (b.attack ? b.attack.label : (ATTACK_LABELS[b.pendingKind] || '')),
    };
  }

  getDisplayHighScore() {
    return Math.max(this.score.highScore, this.score.score);
  }
}
