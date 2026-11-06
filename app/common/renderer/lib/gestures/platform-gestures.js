// Maps the high-level element gestures offered in the Live mode Interact menu
// to driver-specific `mobile:` commands, with a generic W3C pointer-actions fallback.

export const ELEMENT_GESTURES = {
  DOUBLE_TAP: 'doubleTap',
  LONG_PRESS: 'longPress',
  SWIPE: 'swipe',
  SCROLL: 'scroll',
  PINCH_OPEN: 'pinchOpen',
  PINCH_CLOSE: 'pinchClose',
  DRAG: 'drag',
};

export const DIRECTIONS = ['up', 'down', 'left', 'right'];

const {DOUBLE_TAP, LONG_PRESS, SWIPE, SCROLL, PINCH_OPEN, PINCH_CLOSE, DRAG} = ELEMENT_GESTURES;

const ANDROID = 'uiautomator2';
const IOS = 'xcuitest';

/**
 * Builds the `mobile:` command for a gesture on an element.
 * The element ID is NOT included in the returned options; it is merged in by the driver layer
 * (and emitted as `el.id` by the code recorder), since IDs are only valid for the current session.
 *
 * @param {string|undefined} automationName lowercase automationName of the session
 * @param {string} gesture one of ELEMENT_GESTURES
 * @param {Object} opts gesture options: {direction, durationMs, endX, endY, center: {x, y}}
 * @returns {{script: string, opts: Object, usesElement: boolean}|null} null if the driver has no native command
 */
export function getMobileGestureCommand(automationName, gesture, opts = {}) {
  const {direction, durationMs = 1000, endX, endY, center} = opts;

  if (automationName === ANDROID) {
    switch (gesture) {
      case DOUBLE_TAP:
        return {script: 'mobile: doubleClickGesture', opts: {}, usesElement: true};
      case LONG_PRESS:
        return {script: 'mobile: longClickGesture', opts: {duration: durationMs}, usesElement: true};
      case SWIPE:
        return {script: 'mobile: swipeGesture', opts: {direction, percent: 0.75}, usesElement: true};
      case SCROLL:
        return {script: 'mobile: scrollGesture', opts: {direction, percent: 1.0}, usesElement: true};
      case PINCH_OPEN:
        return {script: 'mobile: pinchOpenGesture', opts: {percent: 0.75}, usesElement: true};
      case PINCH_CLOSE:
        return {script: 'mobile: pinchCloseGesture', opts: {percent: 0.75}, usesElement: true};
      case DRAG:
        return {script: 'mobile: dragGesture', opts: {endX, endY}, usesElement: true};
      default:
        return null;
    }
  }

  if (automationName === IOS) {
    switch (gesture) {
      case DOUBLE_TAP:
        return {script: 'mobile: doubleTap', opts: {}, usesElement: true};
      case LONG_PRESS:
        return {script: 'mobile: touchAndHold', opts: {duration: durationMs / 1000}, usesElement: true};
      case SWIPE:
        return {script: 'mobile: swipe', opts: {direction}, usesElement: true};
      case SCROLL:
        return {script: 'mobile: scroll', opts: {direction}, usesElement: true};
      case PINCH_OPEN:
        return {script: 'mobile: pinch', opts: {scale: 2, velocity: 1}, usesElement: true};
      case PINCH_CLOSE:
        return {script: 'mobile: pinch', opts: {scale: 0.5, velocity: -1}, usesElement: true};
      case DRAG:
        // absolute coordinates, so no element is needed
        return {
          script: 'mobile: dragFromToForDuration',
          opts: {fromX: center.x, fromY: center.y, toX: endX, toY: endY, duration: 0.5},
          usesElement: false,
        };
      default:
        return null;
    }
  }

  return null;
}

const move = (x, y, duration = 0) => ({type: 'pointerMove', duration, x: Math.round(x), y: Math.round(y)});
const down = {type: 'pointerDown', button: 0};
const up = {type: 'pointerUp', button: 0};
const pause = (duration) => ({type: 'pause', duration});

/**
 * Builds W3C pointer actions (in the Inspector's `{pointerName: [actions]}` format)
 * for drivers without native `mobile:` gestures. Uses the element's bounds in device coordinates.
 *
 * @param {string} gesture one of ELEMENT_GESTURES
 * @param {{x1: number, y1: number, x2: number, y2: number}} bounds element bounds
 * @param {Object} opts gesture options: {direction, durationMs, endX, endY}
 * @returns {Object|null} pointer actions keyed by pointer name
 */
export function getW3CGestureActions(gesture, bounds, opts = {}) {
  const {direction, durationMs = 1000, endX, endY} = opts;
  const cx = (bounds.x1 + bounds.x2) / 2;
  const cy = (bounds.y1 + bounds.y2) / 2;
  const halfW = ((bounds.x2 - bounds.x1) / 2) * 0.75;
  const halfH = ((bounds.y2 - bounds.y1) / 2) * 0.75;
  // finger travel for a swipe in each direction (scroll moves the finger the opposite way)
  const vectors = {up: [0, -halfH], down: [0, halfH], left: [-halfW, 0], right: [halfW, 0]};

  switch (gesture) {
    case DOUBLE_TAP:
      return {finger1: [move(cx, cy), down, pause(50), up, pause(100), down, pause(50), up]};
    case LONG_PRESS:
      return {finger1: [move(cx, cy), down, pause(durationMs), up]};
    case SWIPE:
    case SCROLL: {
      const [dx, dy] = vectors[direction] || [0, 0];
      const sign = gesture === SCROLL ? -1 : 1;
      return {
        finger1: [move(cx - sign * dx, cy - sign * dy), down, move(cx + sign * dx, cy + sign * dy, 500), up],
      };
    }
    case PINCH_OPEN:
    case PINCH_CLOSE: {
      const [near, far] = gesture === PINCH_OPEN ? [0.1, 1] : [1, 0.1];
      return {
        finger1: [move(cx - halfW * near, cy), down, move(cx - halfW * far, cy, 500), up],
        finger2: [move(cx + halfW * near, cy), down, move(cx + halfW * far, cy, 500), up],
      };
    }
    case DRAG:
      return {finger1: [move(cx, cy), down, pause(600), move(endX, endY, 600), up]};
    default:
      return null;
  }
}
