import {describe, expect, it} from 'vitest';

import {
  ELEMENT_GESTURES,
  getMobileGestureCommand,
  getW3CGestureActions,
} from '../../app/common/renderer/lib/gestures/platform-gestures.js';

const {DOUBLE_TAP, LONG_PRESS, SWIPE, SCROLL, PINCH_OPEN, DRAG} = ELEMENT_GESTURES;

describe('lib/gestures/platform-gestures.js', function () {
  describe('#getMobileGestureCommand', function () {
    it('should map Android gestures to UiAutomator2 mobile commands', function () {
      expect(getMobileGestureCommand('uiautomator2', LONG_PRESS, {durationMs: 2000})).toEqual({
        script: 'mobile: longClickGesture',
        opts: {duration: 2000},
        usesElement: true,
      });
      expect(getMobileGestureCommand('uiautomator2', SWIPE, {direction: 'left'}).opts).toEqual({
        direction: 'left',
        percent: 0.75,
      });
      expect(getMobileGestureCommand('uiautomator2', DRAG, {endX: 5, endY: 6}).opts).toEqual({endX: 5, endY: 6});
    });

    it('should map iOS gestures to XCUITest mobile commands', function () {
      expect(getMobileGestureCommand('xcuitest', LONG_PRESS, {durationMs: 1500}).opts).toEqual({duration: 1.5});
      expect(getMobileGestureCommand('xcuitest', DOUBLE_TAP).script).toBe('mobile: doubleTap');
      expect(getMobileGestureCommand('xcuitest', PINCH_OPEN).opts).toEqual({scale: 2, velocity: 1});
      expect(getMobileGestureCommand('xcuitest', DRAG, {center: {x: 1, y: 2}, endX: 3, endY: 4})).toEqual({
        script: 'mobile: dragFromToForDuration',
        opts: {fromX: 1, fromY: 2, toX: 3, toY: 4, duration: 0.5},
        usesElement: false,
      });
    });

    it('should return null for other drivers', function () {
      expect(getMobileGestureCommand('espresso', DOUBLE_TAP)).toBeNull();
      expect(getMobileGestureCommand(undefined, SWIPE)).toBeNull();
    });
  });

  describe('#getW3CGestureActions', function () {
    const bounds = {x1: 0, y1: 0, x2: 200, y2: 400};

    it('should long press at the element center', function () {
      expect(getW3CGestureActions(LONG_PRESS, bounds, {durationMs: 800}).finger1).toEqual([
        {type: 'pointerMove', duration: 0, x: 100, y: 200},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 800},
        {type: 'pointerUp', button: 0},
      ]);
    });

    it('should move the finger in the swipe direction and opposite for scroll', function () {
      const swipeUp = getW3CGestureActions(SWIPE, bounds, {direction: 'up'}).finger1;
      expect(swipeUp[0].y).toBeGreaterThan(swipeUp[2].y);
      const scrollUp = getW3CGestureActions(SCROLL, bounds, {direction: 'up'}).finger1;
      expect(scrollUp[0].y).toBeLessThan(scrollUp[2].y);
    });

    it('should use two fingers for pinch', function () {
      expect(Object.keys(getW3CGestureActions(PINCH_OPEN, bounds))).toEqual(['finger1', 'finger2']);
    });
  });
});
