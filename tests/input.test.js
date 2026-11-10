import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeTouchTarget } from '../src/input.js';

test('relative touch keeps the finger-to-ship offset instead of snapping', () => {
  const playerStart = { x: 100, y: 500 };
  const pointerStart = { x: 210, y: 610 };
  const pointerNow = { x: 270, y: 590 };
  const target = relativeTouchTarget(playerStart, pointerStart, pointerNow);

  assert.deepEqual(target, { x: 160, y: 480 });
  assert.deepEqual(
    { x: target.x - pointerNow.x, y: target.y - pointerNow.y },
    { x: playerStart.x - pointerStart.x, y: playerStart.y - pointerStart.y },
  );
});

test('relative touch does not move when the finger does not move', () => {
  const start = { x: 180, y: 552 };
  assert.deepEqual(relativeTouchTarget(start, start, start), start);
});
