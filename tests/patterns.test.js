import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aimedFan,
  petal,
  ring,
  spiral,
  sweepingWall,
} from '../src/patterns.js';
import { TAU } from '../src/math.js';

function close(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
}

test('ring: 16 bullets evenly spaced with the requested speed', () => {
  const bullets = ring(180, 100, { count: 16, speed: 76, offset: 0.25 });
  assert.equal(bullets.length, 16);
  for (let i = 0; i < bullets.length; i += 1) {
    assert.equal(bullets[i].x, 180);
    assert.equal(bullets[i].y, 100);
    close(bullets[i].angle, 0.25 + (i / 16) * TAU);
    close(Math.hypot(bullets[i].vx, bullets[i].vy), 76);
  }
});

test('aimedFan: bullets bracket the aimed direction symmetrically', () => {
  const bullets = aimedFan(180, 100, 180, 500, { count: 7, spread: Math.PI / 3, speed: 92 });
  assert.equal(bullets.length, 7);
  const middle = bullets[3];
  close(middle.angle, Math.PI / 2);
  close(bullets[0].angle, Math.PI / 2 - Math.PI / 6);
  close(bullets[6].angle, Math.PI / 2 + Math.PI / 6);
  for (const b of bullets) {
    close(Math.hypot(b.vx, b.vy), 92);
    assert.ok(b.vy > 0);
  }
});

test('spiral: each bullet advances by the step angle', () => {
  const bullets = spiral(180, 100, {
    count: 6,
    speed: 80,
    startAngle: 1,
    step: 0.3,
  });
  assert.equal(bullets.length, 6);
  bullets.forEach((b, i) => close(b.angle, 1 + i * 0.3));
});

test('petal: petal count multiplies and speeds vary outward', () => {
  const bullets = petal(180, 100, { petals: 6, perPetal: 3, speed: 78, offset: 0.1 });
  assert.equal(bullets.length, 18);
  for (const b of bullets) {
    assert.ok(b.speed >= 78 * 0.72 - 1e-9 && b.speed <= 78 * 1.02 + 1e-9);
    close(Math.hypot(b.vx, b.vy), b.speed);
  }
  const firstPetal = bullets.slice(0, 3);
  assert.ok(firstPetal[0].speed < firstPetal[1].speed);
  assert.ok(firstPetal[1].speed < firstPetal[2].speed);
});

test('sweepingWall: removes the gap and sweeps sideways', () => {
  const bullets = sweepingWall({
    x: 180,
    y: -12,
    count: 9,
    spacing: 38,
    gapIndex: 3,
    gapWidth: 2,
    speed: 78,
    sweep: 26,
  });
  assert.equal(bullets.length, 7);
  const xs = bullets.map((b) => b.x);
  assert.equal(xs.includes(142), false);
  assert.equal(xs.includes(180), false);
  for (const b of bullets) {
    assert.equal(b.vx, 26);
    assert.equal(b.vy, 78);
    assert.equal(b.angle, Math.PI / 2);
  }

  const tinyGap = sweepingWall({ count: 9, gapWidth: 8, gapIndex: 3 });
  assert.equal(tinyGap.length, 1, 'a wall must always leave at least one bullet');
  const noHole = sweepingWall({ count: 1, gapWidth: 2 });
  assert.equal(noHole.length, 1);
});
