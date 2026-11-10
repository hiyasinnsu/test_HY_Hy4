import { FIELD } from './config.js';
import { TAU, clamp } from './math.js';
import { createRng } from './rng.js';
import { STATES } from './state.js';

const BULLET_STYLES = [
  { core: '#fff2f9', mid: '#ff6fc4', ring: 'rgba(255,201,235,0.9)' },
  { core: '#eaffff', mid: '#4fd4ff', ring: 'rgba(198,246,255,0.9)' },
  { core: '#fffbe6', mid: '#ffc447', ring: 'rgba(255,233,168,0.9)' },
  { core: '#f8f0ff', mid: '#b57bff', ring: 'rgba(227,204,255,0.9)' },
];

const PARTICLE_COLORS = ['#ff7ac4', '#7df3ff', '#ffd166', '#c49bff'];
const STAR_COLORS = ['#cfe9ff', '#ffffff', '#9cc7ff', '#ffd9f2'];

function makeOrbSprite(style) {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(20, 20, 1, 20, 20, 18);
  gradient.addColorStop(0, style.core);
  gradient.addColorStop(0.3, style.mid);
  gradient.addColorStop(0.72, style.mid);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(20, 20, 18, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = style.ring;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(20, 20, 9, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(20, 20, 3.2, 0, TAU);
  ctx.fill();
  return canvas;
}

function makePetalSprite(style) {
  const size = 44;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.translate(22, 22);
  for (let i = 0; i < 4; i += 1) {
    ctx.save();
    ctx.rotate((i / 4) * TAU);
    const gradient = ctx.createLinearGradient(0, 0, 0, -17);
    gradient.addColorStop(0, style.mid);
    gradient.addColorStop(1, style.core);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(0, -9, 3.2, 8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 3.4, 0, TAU);
  ctx.fill();
  return canvas;
}

function makePlayerShotSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(8, 0, 8, 32);
  gradient.addColorStop(0, 'rgba(140,255,255,0)');
  gradient.addColorStop(0.25, 'rgba(120,244,255,0.55)');
  gradient.addColorStop(0.62, 'rgba(238,255,255,1)');
  gradient.addColorStop(1, 'rgba(90,200,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.fillRect(6, 1, 4, 30);
  ctx.fillStyle = 'rgba(200,255,255,0.9)';
  ctx.fillRect(7.5, 5, 1, 22);
  return canvas;
}

function makeItemSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 36;
  canvas.height = 36;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(18, 14, 2, 18, 18, 17);
  gradient.addColorStop(0, '#fffbe6');
  gradient.addColorStop(0.4, '#ffc94d');
  gradient.addColorStop(1, 'rgba(255,140,20,0.1)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(18, 18, 17, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,244,180,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(18, 18, 12, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#4a2600';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', 18, 19);
  return canvas;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.pixelWidth = FIELD.WIDTH;
    this.pixelHeight = FIELD.HEIGHT;
    this.scaleX = 1;
    this.scaleY = 1;
    this.time = 0;
    this.reducedMotion = false;
    this.motionQuery = null;
    this.starRng = createRng(0x5eed1234);
    this.stars = [];
    for (let i = 0; i < 96; i += 1) {
      this.stars.push({
        x: this.starRng.range(0, FIELD.WIDTH),
        y: this.starRng.range(0, FIELD.HEIGHT),
        z: this.starRng.range(0.25, 1.35),
        size: this.starRng.range(0.6, 2.1),
        color: this.starRng.pick(STAR_COLORS),
        twinkle: this.starRng.range(0, TAU),
      });
    }

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this.motionQuery.matches;
      const onChange = (event) => {
        this.reducedMotion = event.matches;
      };
      if (typeof this.motionQuery.addEventListener === 'function') {
        this.motionQuery.addEventListener('change', onChange);
      } else if (typeof this.motionQuery.addListener === 'function') {
        this.motionQuery.addListener(onChange);
      }
    }

    this.enemySprites = BULLET_STYLES.map((style) => ({
      orb: makeOrbSprite(style),
      petal: makePetalSprite(style),
    }));
    this.playerShotSprite = makePlayerShotSprite();
    this.itemSprite = makeItemSprite();
    this.resize(FIELD.WIDTH, FIELD.HEIGHT, 1);
  }

  resize(cssWidth, cssHeight, dpr) {
    const ratio = clamp(dpr || 1, 1, 2);
    this.pixelWidth = Math.max(1, Math.round(cssWidth * ratio));
    this.pixelHeight = Math.max(1, Math.round(cssHeight * ratio));
    this.canvas.width = this.pixelWidth;
    this.canvas.height = this.pixelHeight;
    this.scaleX = this.pixelWidth / FIELD.WIDTH;
    this.scaleY = this.pixelHeight / FIELD.HEIGHT;
    this._makeGradients();
  }

  _makeGradients() {
    const ctx = this.ctx;
    this.bgGradient = ctx.createLinearGradient(0, 0, 0, FIELD.HEIGHT);
    this.bgGradient.addColorStop(0, '#050817');
    this.bgGradient.addColorStop(0.48, '#090a1f');
    this.bgGradient.addColorStop(1, '#120a20');

    this.nebulaA = ctx.createRadialGradient(84, 150, 10, 84, 150, 250);
    this.nebulaA.addColorStop(0, 'rgba(44,96,190,0.28)');
    this.nebulaA.addColorStop(0.6, 'rgba(30,40,120,0.1)');
    this.nebulaA.addColorStop(1, 'rgba(0,0,0,0)');

    this.nebulaB = ctx.createRadialGradient(300, 470, 18, 300, 470, 280);
    this.nebulaB.addColorStop(0, 'rgba(165,60,170,0.2)');
    this.nebulaB.addColorStop(0.6, 'rgba(80,20,120,0.08)');
    this.nebulaB.addColorStop(1, 'rgba(0,0,0,0)');

    this.vignette = ctx.createRadialGradient(180, 320, 150, 180, 320, 390);
    this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
    this.vignette.addColorStop(1, 'rgba(0,0,12,0.55)');

    this.bossGradient = ctx.createRadialGradient(0, -4, 3, 0, 0, 36);
    this.bossGradient.addColorStop(0, '#fff7df');
    this.bossGradient.addColorStop(0.3, '#ffc25c');
    this.bossGradient.addColorStop(0.7, '#a75bff');
    this.bossGradient.addColorStop(1, 'rgba(68,20,120,0.2)');

    this.bossGlow = ctx.createRadialGradient(0, 0, 20, 0, 0, 108);
    this.bossGlow.addColorStop(0, 'rgba(170,100,255,0.32)');
    this.bossGlow.addColorStop(0.6, 'rgba(100,40,180,0.12)');
    this.bossGlow.addColorStop(1, 'rgba(0,0,0,0)');
  }

  render(game, dt, time) {
    this.time = time;
    const ctx = this.ctx;
    ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    this._updateStars(dt, game);
    this._drawBackground();

    const shake = this.reducedMotion ? 0 : Math.min(20, game.shake || 0) * 0.65;
    ctx.save();
    if (shake > 0.1) {
      ctx.translate(Math.sin(time * 91) * shake, Math.cos(time * 73) * shake * 0.7);
    }
    this._drawItems(game);
    this._drawEnemies(game);
    this._drawBoss(game);
    this._drawPlayerBullets(game);
    this._drawPlayer(game);
    this._drawEnemyBullets(game);
    this._drawParticles(game);
    this._drawShockwaves(game);
    this._drawBossWarning(game);
    ctx.restore();

    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);
    this._drawFlash(game);
  }

  _updateStars(dt, game) {
    const playing = game.state === STATES.PLAYING;
    const speed = playing ? 1 : 0.25;
    for (const star of this.stars) {
      star.y += star.z * 20 * speed * dt;
      star.twinkle += dt * (0.9 + star.z);
      if (star.y > FIELD.HEIGHT + 4) {
        star.y = -4;
        star.x = this.starRng.range(0, FIELD.WIDTH);
      }
    }
  }

  _drawBackground() {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.bgGradient;
    ctx.fillRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.nebulaA;
    ctx.fillRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);
    ctx.fillStyle = this.nebulaB;
    ctx.fillRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);

    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#78d7ff';
    ctx.lineWidth = 0.6;
    for (let x = 20; x < FIELD.WIDTH; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.HEIGHT);
      ctx.stroke();
    }
    for (let y = 20; y < FIELD.HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.WIDTH, y);
      ctx.stroke();
    }

    for (const star of this.stars) {
      const twinkle = 0.55 + 0.45 * Math.sin(star.twinkle);
      ctx.globalAlpha = clamp(twinkle * star.z, 0.15, 0.95);
      ctx.fillStyle = star.color;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawItems(game) {
    const ctx = this.ctx;
    for (const item of game.items) {
      if (!item.active) continue;
      const bob = Math.sin(item.age * 6) * 2;
      ctx.drawImage(this.itemSprite, item.x - 10, item.y - 10 + bob, 20, 20);
    }
  }

  _drawEnemies(game) {
    const ctx = this.ctx;
    for (const e of game.enemies) {
      if (!e.active || e.t < -0.2 || e.y < -40) continue;
      const flash = e.hitFlash > 0;
      const spin = Math.sin(e.t * 2 + e.phase) * 0.25;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(spin);
      if (e.elite) {
        this._hexPath(ctx, 18);
        ctx.fillStyle = flash ? 'rgba(255,255,255,0.75)' : 'rgba(80,40,30,0.85)';
        ctx.fill();
        ctx.strokeStyle = flash ? '#ffffff' : '#ffc36b';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = flash ? '#ffffff' : '#ff8a5c';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,220,160,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(11, 2);
        ctx.lineTo(6, 12);
        ctx.lineTo(-6, 12);
        ctx.lineTo(-11, 2);
        ctx.closePath();
        ctx.fillStyle = flash ? 'rgba(255,255,255,0.8)' : 'rgba(38,18,50,0.9)';
        ctx.fill();
        ctx.strokeStyle = flash ? '#ffffff' : '#ff79bc';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = flash ? '#ffffff' : 'rgba(255,166,212,0.9)';
        ctx.beginPath();
        ctx.arc(0, 1, 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      if (e.warning) {
        const pulse = 0.45 + 0.35 * Math.sin(this.time * 18);
        ctx.strokeStyle = `rgba(255,120,170,${pulse})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.elite ? 27 : 20, 0, TAU);
        ctx.stroke();
      }
      if (e.elite) {
        const ratio = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = 'rgba(10,10,20,0.75)';
        ctx.fillRect(e.x - 18, e.y - 29, 36, 4);
        ctx.fillStyle = '#ffc36b';
        ctx.fillRect(e.x - 18, e.y - 29, 36 * ratio, 4);
      }
    }
  }

  _drawBoss(game) {
    const b = game.boss;
    if (!b) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(b.x, b.y);

    ctx.fillStyle = this.bossGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 108, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.rotate(this.time * 0.18);
    for (let i = 0; i < 6; i += 1) {
      ctx.save();
      ctx.rotate((i / 6) * TAU);
      ctx.beginPath();
      ctx.moveTo(0, 7);
      ctx.bezierCurveTo(18, -2, 25, -22, 0, -49);
      ctx.bezierCurveTo(-25, -22, -18, -2, 0, 7);
      ctx.closePath();
      ctx.fillStyle = b.hitFlash > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(92,52,158,0.58)';
      ctx.fill();
      ctx.strokeStyle = b.hitFlash > 0 ? '#ffffff' : 'rgba(205,174,255,0.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.fillStyle = this.bossGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,244,220,0.95)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#2a0b3c';
    ctx.beginPath();
    ctx.ellipse(0, -2, 10, 15, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff5c9';
    ctx.beginPath();
    ctx.ellipse(0, -5, 4.5, 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff5fae';
    ctx.beginPath();
    ctx.arc(0, 24, 4, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.rotate(-this.time * 0.5);
    ctx.strokeStyle = 'rgba(190,140,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const windup = b.windup > 0;
    if (windup) {
      const pulse = 0.35 + 0.3 * Math.sin(this.time * 14);
      ctx.strokeStyle = `rgba(255,196,90,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 68 + Math.sin(this.time * 9) * 4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    const info = game.getBossInfo();
    if (info) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (windup) {
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = `rgba(255,220,150,${0.65 + 0.3 * Math.sin(this.time * 10)})`;
        ctx.fillText(`予告   ${info.label}`, b.x, b.y + 78);
      } else if (info.label) {
        ctx.font = '500 11px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,220,170,0.55)';
        ctx.fillText(info.label, b.x, b.y + 78);
      }
    }
  }

  _drawPlayerBullets(game) {
    const ctx = this.ctx;
    for (const b of game.playerBullets) {
      if (!b.active) continue;
      ctx.drawImage(this.playerShotSprite, b.x - 4, b.y - 13, 8, 26);
    }
  }

  _drawPlayer(game) {
    const p = game.player;
    if (!p.alive && game.state !== STATES.TITLE) return;
    const ctx = this.ctx;
    const blink = p.invuln > 0 && Math.floor(this.time * 16) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (blink) ctx.globalAlpha = 0.35;

    if (p.focus) {
      ctx.strokeStyle = 'rgba(120,255,225,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const flame = 8 + Math.sin(this.time * 34) * 3;
    ctx.fillStyle = 'rgba(92,226,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(0, 12 + flame);
    ctx.lineTo(4, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,142,238,0.5)';
    ctx.beginPath();
    ctx.moveTo(-2, 10);
    ctx.lineTo(0, 9 + flame * 0.6);
    ctx.lineTo(2, 10);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = '#65f7ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.lineTo(6, -4);
    ctx.lineTo(14, 6);
    ctx.lineTo(7, 4);
    ctx.lineTo(5, 11);
    ctx.lineTo(0, 7);
    ctx.lineTo(-5, 11);
    ctx.lineTo(-7, 4);
    ctx.lineTo(-14, 6);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(14,32,58,0.96)';
    ctx.fill();
    ctx.strokeStyle = '#79f8ff';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(255,128,222,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 4);
    ctx.stroke();

    if (p.invuln > 0) {
      ctx.strokeStyle = `rgba(120,250,255,${0.25 + 0.15 * Math.sin(this.time * 12)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 19, 0, TAU);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,70,150,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  _drawEnemyBullets(game) {
    const ctx = this.ctx;
    for (const b of game.enemyBullets) {
      if (!b.active) continue;
      const sprites = this.enemySprites[b.color % this.enemySprites.length];
      const sprite = b.type === 'petal' ? sprites.petal : sprites.orb;
      const size = b.type === 'petal' ? 19 : 15;
      ctx.drawImage(sprite, b.x - size / 2, b.y - size / 2, size, size);
    }
  }

  _drawParticles(game) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.particles) {
      if (!p.active) continue;
      const alpha = clamp(1 - p.age / p.life, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PARTICLE_COLORS[p.color % PARTICLE_COLORS.length];
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawShockwaves(game) {
    const ctx = this.ctx;
    for (const wave of game.shockwaves) {
      const t = clamp(wave.age / wave.life, 0, 1);
      const radius = wave.maxRadius * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = PARTICLE_COLORS[wave.color % PARTICLE_COLORS.length];
      ctx.lineWidth = 2 + (1 - t) * 2;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, Math.max(2, radius), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawBossWarning(game) {
    const b = game.boss;
    if (!b || !b.entering) return;
    const ctx = this.ctx;
    const alpha = 0.55 + 0.35 * Math.sin(this.time * 8);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 27px system-ui, sans-serif';
    ctx.fillStyle = `rgba(255,184,80,${alpha})`;
    ctx.fillText('WARNING', FIELD.WIDTH / 2, 320);
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,224,170,0.85)';
    ctx.fillText(b.name, FIELD.WIDTH / 2, 346);
    ctx.strokeStyle = `rgba(255,150,70,${alpha * 0.7})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(58, 300);
    ctx.lineTo(302, 300);
    ctx.moveTo(58, 360);
    ctx.lineTo(302, 360);
    ctx.stroke();
    ctx.restore();
  }

  _drawFlash(game) {
    if (!game.flash || game.flash <= 0) return;
    const ctx = this.ctx;
    const max = this.reducedMotion ? 0.35 : 0.8;
    ctx.globalAlpha = Math.min(max, game.flash * 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, FIELD.WIDTH, FIELD.HEIGHT);
    ctx.globalAlpha = 1;
  }

  _hexPath(ctx, radius) {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
