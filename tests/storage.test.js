import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadHighScore,
  loadMuted,
  saveHighScore,
  saveMuted,
} from '../src/storage.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

test('storage: high score round-trips and invalid values fall back to zero', () => {
  const storage = fakeStorage();
  assert.equal(loadHighScore(storage), 0);
  assert.equal(saveHighScore(1234.9, storage), true);
  assert.equal(loadHighScore(storage), 1234);
  assert.equal(saveHighScore(-10, storage), true);
  assert.equal(loadHighScore(storage), 0);

  const invalid = fakeStorage({ 'hoshikuzu.highscore.v1': 'not-a-number' });
  assert.equal(loadHighScore(invalid), 0);
  assert.equal(loadHighScore(null), 0);
});

test('storage: sound defaults to muted and persists the choice', () => {
  const storage = fakeStorage();
  assert.equal(loadMuted(storage), true);
  assert.equal(saveMuted(false, storage), true);
  assert.equal(loadMuted(storage), false);
  assert.equal(saveMuted(true, storage), true);
  assert.equal(loadMuted(storage), true);
  assert.equal(loadMuted(null), true);
});
