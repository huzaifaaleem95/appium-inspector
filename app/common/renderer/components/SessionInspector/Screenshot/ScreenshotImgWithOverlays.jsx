import {Spin} from 'antd';
import {useState} from 'react';

import {SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';
import {INSPECTOR_TABS} from '../../../constants/session-inspector.js';
import LiveScreenSurface from './Live/LiveScreenSurface.jsx';
import CoordinatesContainer from './Overlays/CoordinatesContainer.jsx';
import ElementOverlays from './Overlays/ElementOverlays.jsx';
import GestureTrail from './Overlays/GestureTrail.jsx';
import TapSwipeTrail from './Overlays/TapSwipeTrail.jsx';
import {handleSwipeOnScreenshot, handleTapOnScreenshot} from './pointer-actions.js';

import styles from './Screenshot.module.css';

const {SELECT, TAP_SWIPE, TAP_ELEMENT, LIVE} = SCREENSHOT_INTERACTION_MODE;

/**
 * Shows the app screenshot along with various overlay elements,
 * such as divs that highlight the elements' bounding boxes
 */
const ScreenshotImgWithOverlays = (props) => {
  const {
    screenshot,
    imageElRef,
    windowSize,
    serverDetails,
    isUsingMjpegMode,
    methodCallInProgress,
    screenshotInteractionMode,
    coordStart,
    coordEnd,
    clearCoordAction,
    scaleRatio,
    selectedTick,
    tapTickCoordinates,
    setCoordStart,
    setCoordEnd,
    showGesture,
    selectedInspectorTab,
    applyClientMethod,
  } = props;

  const [x, setX] = useState();
  const [y, setY] = useState();

  // Used when creating a gesture and clicking on screenshot to set move coordinates
  const handleScreenshotClick = async () => {
    if (selectedTick && x && y) {
      await tapTickCoordinates(x, y);
    }
  };

  // Used during screenshot Coordinates Mode
  const handleScreenshotDown = async () => {
    if (screenshotInteractionMode === TAP_SWIPE && x && y) {
      await setCoordStart(x, y);
    }
  };

  // Used during screenshot Coordinates Mode
  const handleScreenshotUp = async () => {
    if (screenshotInteractionMode !== TAP_SWIPE || !coordStart?.x || !coordStart?.y || !x || !y) {
      return;
    }
    await setCoordEnd(x, y);
    if (Math.abs(coordStart.x - x) < 5 && Math.abs(coordStart.y - y) < 5) {
      await handleTapOnScreenshot({x, y}, applyClientMethod);
    } else {
      await handleSwipeOnScreenshot(coordStart, {x, y}, applyClientMethod);
    }
    await clearCoordAction();
  };

  const handleScreenshotCoordsUpdate = async (e) => {
    if (screenshotInteractionMode !== SELECT && screenshotInteractionMode !== TAP_ELEMENT) {
      const offsetX = e.nativeEvent.offsetX;
      const offsetY = e.nativeEvent.offsetY;
      const newX = offsetX * scaleRatio;
      const newY = offsetY * scaleRatio;
      // screenshot container can exceed the screenshot bounds,
      // so ignore coordinates outside the screenshot bounds
      if (newX > windowSize.width || newY > windowSize.height) {
        return await handleScreenshotLeave();
      }
      setX(Math.round(newX));
      setY(Math.round(newY));
    }
  };

  const handleScreenshotLeave = async () => {
    setX(null);
    setY(null);
    await clearCoordAction();
  };

  // If we're tapping or swiping, show the 'crosshair' cursor style
  const screenshotStyle = {};
  if (screenshotInteractionMode === TAP_SWIPE || selectedTick) {
    screenshotStyle.cursor = 'crosshair';
  }

  const screenSrc = isUsingMjpegMode ? serverDetails.mjpegScreenshotUrl : `data:image/png;base64,${screenshot}`;

  // Live mode: one surface for both controlling the device and inspecting elements
  if (screenshotInteractionMode === LIVE) {
    return (
      <Spin size="large" spinning={!!methodCallInProgress && !isUsingMjpegMode}>
        <div className={styles.innerScreenshotContainer}>
          <LiveScreenSurface {...props} screenSrc={screenSrc} />
        </div>
      </Spin>
    );
  }

  // Show loading indicator if a method call is in progress, unless using MJPEG mode.
  return (
    <Spin size="large" spinning={!!methodCallInProgress && !isUsingMjpegMode}>
      <div className={styles.innerScreenshotContainer}>
        <div
          style={screenshotStyle}
          onMouseDown={handleScreenshotDown}
          onMouseUp={handleScreenshotUp}
          onMouseMove={handleScreenshotCoordsUpdate}
          onMouseOver={handleScreenshotCoordsUpdate}
          onMouseLeave={handleScreenshotLeave}
          onClick={handleScreenshotClick}
          className={styles.screenshotBox}
        >
          {screenshotInteractionMode !== SELECT && screenshotInteractionMode !== TAP_ELEMENT && (
            <CoordinatesContainer x={x} y={y} />
          )}
          <img src={screenSrc} id="screenshot" ref={imageElRef} />
          {(screenshotInteractionMode === SELECT || screenshotInteractionMode === TAP_ELEMENT) && (
            <ElementOverlays {...props} />
          )}
          {screenshotInteractionMode === TAP_SWIPE && (
            <TapSwipeTrail coordStart={coordStart} coordEnd={coordEnd} x={x} y={y} scaleRatio={scaleRatio} />
          )}
          {selectedInspectorTab === INSPECTOR_TABS.GESTURES && showGesture && (
            <GestureTrail gesture={showGesture} scaleRatio={scaleRatio} />
          )}
        </div>
      </div>
    </Spin>
  );
};

export default ScreenshotImgWithOverlays;
