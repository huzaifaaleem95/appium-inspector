import {POINTER_TYPES} from '../../../constants/gestures.js';
import {DEFAULT_SWIPE, DEFAULT_TAP, SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';

const {POINTER_UP, POINTER_DOWN, PAUSE, POINTER_MOVE} = POINTER_TYPES;
const {TAP, SWIPE} = SCREENSHOT_INTERACTION_MODE;

// Coordinate-based tap/swipe on the device screen. These use the fixed action shapes
// that the code recorder knows how to read back (see codeFor_tap / codeFor_swipe).

export const handleTapOnScreenshot = async (tapPoint, applyClientMethod) => {
  const {POINTER_NAME, DURATION_1, DURATION_2, BUTTON} = DEFAULT_TAP;
  await applyClientMethod({
    methodName: TAP,
    args: [
      {
        [POINTER_NAME]: [
          {type: POINTER_MOVE, duration: DURATION_1, x: tapPoint.x, y: tapPoint.y},
          {type: POINTER_DOWN, button: BUTTON},
          {type: PAUSE, duration: DURATION_2},
          {type: POINTER_UP, button: BUTTON},
        ],
      },
    ],
  });
};

export const handleSwipeOnScreenshot = async (swipeStartPoint, swipeEndPoint, applyClientMethod) => {
  const {POINTER_NAME, DURATION_1, DURATION_2, BUTTON, ORIGIN} = DEFAULT_SWIPE;
  await applyClientMethod({
    methodName: SWIPE,
    args: {
      [POINTER_NAME]: [
        {type: POINTER_MOVE, duration: DURATION_1, x: swipeStartPoint.x, y: swipeStartPoint.y},
        {type: POINTER_DOWN, button: BUTTON},
        {
          type: POINTER_MOVE,
          duration: DURATION_2,
          origin: ORIGIN,
          x: swipeEndPoint.x,
          y: swipeEndPoint.y,
        },
        {type: POINTER_UP, button: BUTTON},
      ],
    },
  });
};
