/** Drag only the player's non-interactive header/artwork on touch devices. */
export function playerDismiss(node: HTMLElement, dismiss: () => void) {
  let gesture: {
    id: number;
    x: number;
    y: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    distance: number;
    dragging: boolean;
  } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)');

  function release() {
    const previous = gesture;
    gesture = null;
    if (previous && node.hasPointerCapture?.(previous.id))
      node.releasePointerCapture(previous.id);
  }
  function settle(close = false) {
    release();
    node.dataset.playerDismiss = close ? 'closing' : 'settling';
    node.style.setProperty(
      '--player-drag-y',
      close ? `${node.clientHeight}px` : '0px',
    );
    timer = setTimeout(
      () => {
        timer = undefined;
        if (close) dismiss();
        else {
          delete node.dataset.playerDismiss;
          suppressClick = false;
        }
      },
      motion.matches ? 0 : 220,
    );
  }
  function down(event: PointerEvent) {
    if (gesture) {
      settle();
      return;
    }
    if (
      timer ||
      !mobile.matches ||
      event.pointerType === 'mouse' ||
      !event.isPrimary
    )
      return;
    const target = event.target;
    if (
      !(target instanceof Element) ||
      !target.closest('[data-player-drag-region]') ||
      target.closest('button, input, a, iframe, [role="tab"]')
    )
      return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      distance: 0,
      dragging: false,
    };
  }
  function move(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dy = event.clientY - gesture.y;
    const dx = Math.abs(event.clientX - gesture.x);
    if (!gesture.dragging) {
      if (Math.max(dx, Math.abs(dy)) < 10) return;
      if (dy <= 0 || dx >= dy) {
        release();
        return;
      }
      gesture.dragging = true;
      suppressClick = true;
      node.setPointerCapture?.(event.pointerId);
      node.dataset.playerDismiss = 'dragging';
    }
    if (event.cancelable) event.preventDefault();
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0)
      gesture.velocity = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = event.timeStamp;
    gesture.distance = Math.max(0, dy);
    node.style.setProperty('--player-drag-y', `${gesture.distance}px`);
  }
  function up(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.dragging) {
      release();
      return;
    }
    const velocity =
      event.timeStamp - gesture.lastTime < 100 ? gesture.velocity : 0;
    const threshold = Math.min(160, node.clientHeight * 0.22);
    settle(
      gesture.distance >= threshold ||
        (gesture.distance > 36 && velocity > 0.65),
    );
  }
  function cancel(event: PointerEvent) {
    // Touch starts with implicit capture on the artwork/header. Transferring
    // that capture to the sheet must not cancel the active drag.
    if (event.type === 'lostpointercapture' && event.target !== node) return;
    if (gesture?.id === event.pointerId) settle();
  }
  function click(event: MouseEvent) {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
  }
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('click', click, true);
  return () => {
    clearTimeout(timer);
    release();
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', cancel);
    node.removeEventListener('lostpointercapture', cancel);
    node.removeEventListener('click', click, true);
    delete node.dataset.playerDismiss;
    node.style.removeProperty('--player-drag-y');
  };
}
