import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATES,
  addScore,
  canTransition,
  clearBonus,
  commitHighScore,
  createScoreState,
  displayHighScore,
  grazeScore,
  registerGraze,
  tickCombo,
  transition,
} from '../src/state.js';

test('state machine: only declared transitions are allowed', () => {
  assert.equal(canTransition(STATES.TITLE, STATES.PLAYING), true);
  assert.equal(canTransition(STATES.TITLE, STATES.PAUSED), false);
  assert.equal(canTransition(STATES.PLAYING, STATES.PAUSED), true);
  assert.equal(canTransition(STATES.PAUSED, STATES.PLAYING), true);
  assert.equal(canTransition(STATES.GAMEOVER, STATES.PLAYING), true);
  assert.equal(canTransition(STATES.CLEAR, STATES.TITLE), true);
  assert.equal(transition(STATES.TITLE, STATES.PLAYING), STATES.PLAYING);
  assert.throws(() => transition(STATES.TITLE, STATES.GAMEOVER), /invalid state transition/);
});

test('score: addScore applies a multiplier and floors no negative values', () => {
  const score = createScoreState(500);
  assert.equal(addScore(score, 100), 100);
  assert.equal(addScore(score, 25, 2.4), 60);
  assert.equal(addScore(score, -40), 0);
  assert.equal(score.score, 160);
  assert.equal(score.highScore, 500);
});

test('graze combo raises the per-graze value and times out', () => {
  const score = createScoreState();
  assert.equal(grazeScore(1), 10);
  assert.equal(grazeScore(5), 10);
  assert.equal(grazeScore(6), 15);
  assert.equal(grazeScore(60), 50);

  for (let i = 0; i < 6; i += 1) registerGraze(score);
  assert.equal(score.graze, 6);
  assert.equal(score.combo, 6);
  assert.equal(score.bestCombo, 6);
  assert.equal(score.score, 65);
  assert.ok(score.comboTimer > 0);

  tickCombo(score, 5);
  assert.equal(score.combo, 0);
  assert.equal(score.comboTimer, 0);
});

test('high score: commit and display take the maximum', () => {
  const score = createScoreState(1000);
  addScore(score, 750);
  assert.equal(displayHighScore(score), 1000);
  assert.equal(commitHighScore(score), 1000);
  addScore(score, 1000);
  assert.equal(displayHighScore(score), 1750);
  assert.equal(commitHighScore(score), 1750);
  assert.equal(score.highScore, 1750);
});

test('clear bonus: lives, bombs and graze are all counted', () => {
  assert.equal(clearBonus({ lives: 2, bombs: 1, graze: 10 }), 1000 + 200 + 20);
  assert.equal(clearBonus({ lives: -1, bombs: -2, graze: -3 }), 0);
  assert.equal(clearBonus(), 0);
});
