import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, mulberry32 } from '../src/rng.js';

test('mulberry32: same seed produces the same sequence', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const valuesA = Array.from({ length: 24 }, () => a());
  const valuesB = Array.from({ length: 24 }, () => b());
  assert.deepEqual(valuesA, valuesB);
});

test('mulberry32: different seeds diverge and values stay in [0, 1)', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const valuesA = Array.from({ length: 32 }, () => a());
  const valuesB = Array.from({ length: 32 }, () => b());
  assert.notDeepEqual(valuesA, valuesB);
  for (const value of valuesA) {
    assert.ok(value >= 0 && value < 1, `out of range: ${value}`);
  }
});

test('createRng: int stays inclusive and range stays bounded', () => {
  const rng = createRng(9876);
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const value = rng.int(3, 7);
    assert.ok(value >= 3 && value <= 7, `out of bounds: ${value}`);
    assert.equal(Number.isInteger(value), true);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7]);

  for (let i = 0; i < 50; i += 1) {
    const value = rng.range(-2, 4);
    assert.ok(value >= -2 && value < 4);
  }
});
