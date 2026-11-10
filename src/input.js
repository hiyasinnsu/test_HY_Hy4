import { FIELD } from './config.js';
import { STATES } from './state.js';

// 指と自機の相対位置を保つ。タッチ開始時の自機位置に、指の移動量だけを足す。
export function relativeTouchTarget(playerStart, pointerStart, pointerNow) {
  return {
    x: playerStart.x + (pointerNow.x - pointerStart.x),
    y: playerStart.y + (pointerNow.y - pointerStart.y),
  };
}

// キーボードとタッチ（相対ドラッグ）をゲーム入力へ変換する。
export function createInput({ canvas, game, actions = {} }) {
  const keys = new Set();
  let pointerId = null;
  let dragStart = null;
  let dragPlayer = null;

  function gesture() {
    if (actions.onGesture) actions.onGesture();
  }

  function moveVector() {
    let x = 0;
    let y = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
    return { x, y };
  }

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD.WIDTH,
      y: ((clientY - rect.top) / rect.height) * FIELD.HEIGHT,
    };
  }

  function releasePointer() {
    if (pointerId !== null) {
      try {
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
      } catch {
        // capture が既に外れている場合は無視する。
      }
    }
    pointerId = null;
    dragStart = null;
    dragPlayer = null;
  }

  function cancelTouch() {
    releasePointer();
    game.clearTouch();
  }

  function onPointerDown(event) {
    if (game.state !== STATES.PLAYING) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointerId !== null) return;
    gesture();
    pointerId = event.pointerId;
    dragStart = toField(event.clientX, event.clientY);
    dragPlayer = game.getPlayerPosition();
    game.setTouchActive(true);
    game.setTouchTarget(dragPlayer.x, dragPlayer.y);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // 古いブラウザでは capture 不可でもドラッグは動く。
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (event.pointerId !== pointerId || !dragStart || !dragPlayer) return;
    const point = toField(event.clientX, event.clientY);
    const target = relativeTouchTarget(dragPlayer, dragStart, point);
    game.setTouchTarget(target.x, target.y);
    event.preventDefault();
  }

  function onPointerEnd(event) {
    if (event.pointerId !== pointerId) return;
    releasePointer();
    game.setTouchActive(false);
    event.preventDefault();
  }

  function onKeyDown(event) {
    const code = event.code;
    const handled = [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ShiftLeft', 'ShiftRight', 'Space', 'Enter',
      'Escape', 'KeyP', 'KeyX', 'KeyB', 'KeyZ', 'KeyM', 'KeyF',
    ];
    if (handled.includes(code)) {
      event.preventDefault();
      gesture();
    }

    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      keys.add(code);
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) {
      keys.add(code);
      return;
    }
    if (event.repeat) return;

    if (code === 'Escape' || code === 'KeyP') {
      if (actions.onPause) actions.onPause();
    } else if (code === 'KeyX' || code === 'KeyB') {
      if (actions.onBomb) actions.onBomb();
    } else if (code === 'Enter' || code === 'Space') {
      if (actions.onPrimary) actions.onPrimary();
    } else if (code === 'KeyM') {
      if (actions.onSound) actions.onSound();
    } else if (code === 'KeyF') {
      if (actions.onFullscreen) actions.onFullscreen();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onBlur() {
    keys.clear();
    cancelTouch();
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerEnd, { passive: false });
  canvas.addEventListener('pointercancel', onPointerEnd, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    getMoveVector: moveVector,
    isFocus() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    cancelTouch,
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
