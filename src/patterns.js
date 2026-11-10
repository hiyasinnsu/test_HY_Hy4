import { TAU, clamp } from './math.js';

export const ATTACK_LABELS = Object.freeze({
  ring: '放射リング',
  fan: '自機狙い扇型',
  spiral: '回転スパイラル',
  petal: '花びら弾',
  wall: '掃射の壁',
});

function countOf(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bullet(x, y, angle, speed, options = {}) {
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    speed,
    radius: options.radius ?? 3.2,
    color: options.color ?? 0,
    type: options.type ?? 'orb',
  };
}

export function ring(x, y, {
  count = 16,
  speed = 76,
  offset = 0,
  radius = 3.2,
  color = 0,
  type = 'orb',
} = {}) {
  const n = countOf(count, 1);
  const bullets = [];
  for (let i = 0; i < n; i += 1) {
    const angle = offset + (i / n) * TAU;
    bullets.push(bullet(x, y, angle, speed, { radius, color, type }));
  }
  return bullets;
}

export function aimedFan(x, y, targetX, targetY, {
  count = 5,
  spread = Math.PI / 3,
  speed = 92,
  radius = 3.2,
  color = 1,
  type = 'orb',
} = {}) {
  const n = countOf(count, 1);
  const base = Math.atan2(targetY - y, targetX - x);
  const bullets = [];
  for (let i = 0; i < n; i += 1) {
    const offset = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
    bullets.push(bullet(x, y, base + offset, speed, { radius, color, type }));
  }
  return bullets;
}

export function spiral(x, y, {
  count = 2,
  speed = 80,
  startAngle = 0,
  step = 0.22,
  radius = 3.2,
  color = 2,
  type = 'orb',
} = {}) {
  const n = countOf(count, 1);
  const bullets = [];
  for (let i = 0; i < n; i += 1) {
    bullets.push(bullet(x, y, startAngle + i * step, speed, { radius, color, type }));
  }
  return bullets;
}

// 花びら状: 花びらごとに角度を扇状に散らし、外側ほど速くして花の輪郭を作る。
export function petal(x, y, {
  petals = 6,
  perPetal = 3,
  speed = 78,
  offset = 0,
  spread = 0.24,
  radius = 3.2,
  color = 3,
  type = 'petal',
} = {}) {
  const p = countOf(petals, 1);
  const q = countOf(perPetal, 1);
  const bullets = [];
  for (let i = 0; i < p; i += 1) {
    const base = offset + (i / p) * TAU;
    for (let j = 0; j < q; j += 1) {
      const t = q === 1 ? 0.5 : j / (q - 1);
      const angle = base + (t - 0.5) * spread;
      const s = speed * (0.72 + 0.3 * t);
      bullets.push(bullet(x, y, angle, s, { radius, color, type }));
    }
  }
  return bullets;
}

// 上部から降る壁。gapWidth 個ぶんの安全な隙間を空け、全体を横に流す。
export function sweepingWall({
  x = 180,
  y = -12,
  count = 9,
  spacing = 38,
  gapIndex = 3,
  gapWidth = 2,
  speed = 78,
  sweep = 26,
  radius = 3.2,
  color = 1,
  type = 'orb',
} = {}) {
  const n = Math.max(2, countOf(count, 2));
  const gap = Math.max(1, Math.min(countOf(gapWidth, 1), n - 1));
  const gapStart = clamp(Math.floor(Number(gapIndex) || 0), 0, n - gap);
  const bullets = [];
  for (let i = 0; i < n; i += 1) {
    if (i >= gapStart && i < gapStart + gap) continue;
    const px = x + (i - (n - 1) / 2) * spacing;
    const b = bullet(px, y, Math.PI / 2, speed, { radius, color, type });
    b.vx = sweep;
    b.vy = speed;
    b.angle = Math.PI / 2;
    bullets.push(b);
  }
  return bullets;
}
