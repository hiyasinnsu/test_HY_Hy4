import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAU,
  approach,
  circleOverlap,
  clamp,
  distance,
  normalizeAngle,
} from '../src/math.js';

test('clamp: bounds are inclusive and inverted ranges are not produced', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(5, 0, 10), 5);
});

test('circleOverlap: touching circles count as a hit', () => {
  assert.equal(circleOverlap(0, 0, 3, 7, 0, 4), true);
  assert.equal(circleOverlap(0, 0, 3, 7.01, 0, 4), false);
  assert.equal(circleOverlap(10, 10, 1, 10, 10, 1), true);
});

test('distance and normalizeAngle', () => {
  assert.equal(distance(0, 0, 3, 4), 5);
  assert.ok(Math.abs(normalizeAngle(TAU + 0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(normalizeAngle(-TAU - 0.5) - -0.5) < 1e-12);
  assert.ok(Math.abs(normalizeAngle(Math.PI * 3) - -Math.PI) < 1e-12);
});

test('approach: moves toward the target without overshooting', () => {
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(10, 0, 3), 7);
  assert.equal(approach(9, 10, 3), 10);
  assert.equal(approach(5, 5, 3), 5);
});
