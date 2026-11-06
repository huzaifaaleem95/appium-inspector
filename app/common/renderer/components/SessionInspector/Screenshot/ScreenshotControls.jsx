import {
  IconArrowsExchange,
  IconCrosshair,
  IconDeviceMobile,
  IconDownload,
  IconEyePlus,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMovie,
  IconObjectScan,
  IconPhoto,
  IconSquarePlus,
} from '@tabler/icons-react';
import {Button, Space, Tooltip} from 'antd';
import {useTranslation} from 'react-i18next';

import {BUTTON} from '../../../constants/antd-types.js';
import {PLATFORMS_WITHOUT_W3C_ACTIONS} from '../../../constants/common.js';
import {SCREENSHOT_INTERACTION_MODE} from '../../../constants/screenshot.js';
import {downloadFile} from '../../../utils/file-handling.js';

import styles from './Screenshot.module.css';

const {SELECT, TAP_SWIPE, TAP_ELEMENT, LIVE} = SCREENSHOT_INTERACTION_MODE;

const downloadScreenshot = (screenshot) => {
  const href = `data:image/png;base64,${screenshot}`;
  const filename = `appium-inspector-${new Date().toJSON()}.png`;
  downloadFile(href, filename);
};

/**
 * Button for switching between MJPEG and regular screenshot capture mode.
 * Only shown if the session was started in MJPEG mode.
 */
const ScreenshotCaptureModeControls = ({setMjpegState, isUsingMjpegMode, setRefreshingState, applyClientMethod}) => {
  const {t} = useTranslation();
  const useMjpegLabel = t('useMjpegStream');
  const useScreenshotLabel = t('useScreenshotApi');

  const switchScreenCaptureMode = (shouldUseMjpeg) => {
    setMjpegState(shouldUseMjpeg);
    if (!shouldUseMjpeg) {
      setRefreshingState({source: true});
    }
    applyClientMethod({methodName: 'getPageSource'});
  };

  return (
    <Space.Compact>
      <Tooltip title={useMjpegLabel} placement="topLeft">
        <Button
          aria-label={useMjpegLabel}
          icon={<IconMovie size={18} />}
          onClick={() => switchScreenCaptureMode(true)}
          type={isUsingMjpegMode ? BUTTON.PRIMARY : BUTTON.DEFAULT}
        />
      </Tooltip>
      <Tooltip title={useScreenshotLabel} placement="topLeft">
        <Button
          aria-label={useScreenshotLabel}
          icon={<IconPhoto size={18} />}
          onClick={() => switchScreenCaptureMode(false)}
          type={!isUsingMjpegMode ? BUTTON.PRIMARY : BUTTON.DEFAULT}
        />
      </Tooltip>
    </Space.Compact>
  );
};

/**
 * Button for toggling visibility of element handles (+/- centroids).
 */
const ToggleElementHandlesButton = ({showCentroids, toggleShowCentroids, isGestureEditorVisible}) => {
  const {t} = useTranslation();
  const toggleHandlesLabel = showCentroids ? t('Hide Element Handles') : t('Show Element Handles');

  return (
    <Tooltip title={toggleHandlesLabel}>
      <Button
        aria-label={toggleHandlesLabel}
        icon={<IconEyePlus size={18} />}
        onClick={() => toggleShowCentroids()}
        type={showCentroids ? BUTTON.PRIMARY : BUTTON.DEFAULT}
        disabled={isGestureEditorVisible}
      />
    </Tooltip>
  );
};

/**
 * Button allowing to switch between the Element Mode, Tap By Element Mode, and
 * Coordinates Mode when interacting with the screenshot.
 */
const ScreenshotInteractionModeControls = ({
  screenshotInteractionMode,
  selectScreenshotInteractionMode,
  clearCoordAction,
  isGestureEditorVisible,
  platformName,
  swapMouseButtons,
}) => {
  // Disable the tap/swipe interaction mode on unsupported platforms
  const areW3CActionsUnsupported = PLATFORMS_WITHOUT_W3C_ACTIONS.includes(platformName);

  const {t} = useTranslation();
  const liveLabel = swapMouseButtons ? t('liveModeSwapped') : t('liveMode');
  const selectElemLabel = t('Select Elements');
  const tapElemLabel = t('Tap By Element');
  const tapCoordsLabel = areW3CActionsUnsupported ? t('w3cActionsUnsupported') : t('Tap/Swipe By Coordinates');

  const screenshotInteractionChange = (mode) => {
    clearCoordAction(); // When the action changes, reset the swipe action
    selectScreenshotInteractionMode(mode);
  };

  return (
    <Space.Compact>
      <Tooltip title={liveLabel}>
        <Button
          aria-label={liveLabel}
          icon={<IconDeviceMobile size={18} />}
          onClick={() => screenshotInteractionChange(LIVE)}
          type={screenshotInteractionMode === LIVE ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          disabled={isGestureEditorVisible}
        />
      </Tooltip>
      <Tooltip title={selectElemLabel}>
        <Button
          aria-label={selectElemLabel}
          icon={<IconObjectScan size={18} />}
          onClick={() => screenshotInteractionChange(SELECT)}
          type={screenshotInteractionMode === SELECT ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          disabled={isGestureEditorVisible}
        />
      </Tooltip>
      <Tooltip title={tapElemLabel}>
        <Button
          aria-label={tapElemLabel}
          icon={<IconSquarePlus size={18} />}
          onClick={() => screenshotInteractionChange(TAP_ELEMENT)}
          type={screenshotInteractionMode === TAP_ELEMENT ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          disabled={isGestureEditorVisible}
        />
      </Tooltip>
      <Tooltip title={tapCoordsLabel} placement={areW3CActionsUnsupported ? 'bottom' : 'top'}>
        <Button
          aria-label={tapCoordsLabel}
          icon={<IconCrosshair size={18} />}
          onClick={() => screenshotInteractionChange(TAP_SWIPE)}
          type={screenshotInteractionMode === TAP_SWIPE ? BUTTON.PRIMARY : BUTTON.DEFAULT}
          disabled={areW3CActionsUnsupported || isGestureEditorVisible}
        />
      </Tooltip>
    </Space.Compact>
  );
};

/**
 * Toggle for swapping which mouse button interacts and which inspects in Live mode.
 */
const SwapMouseButtonsButton = ({swapMouseButtons, setSwapMouseButtons}) => {
  const {t} = useTranslation();
  const label = t('liveSwapButtons');

  return (
    <Tooltip title={label}>
      <Button
        aria-label={label}
        icon={<IconArrowsExchange size={18} />}
        onClick={() => setSwapMouseButtons(!swapMouseButtons)}
        type={swapMouseButtons ? BUTTON.PRIMARY : BUTTON.DEFAULT}
      />
    </Tooltip>
  );
};

/**
 * Toggle for hiding the tabs panel, so the device screen fills the window.
 */
const ToggleSidePanelButton = ({isSidePanelHidden, toggleSidePanel}) => {
  const {t} = useTranslation();
  const label = isSidePanelHidden ? t('liveShowPanel') : t('liveDeviceOnly');
  const Icon = isSidePanelHidden ? IconLayoutSidebarRightExpand : IconLayoutSidebarRightCollapse;

  return (
    <Tooltip title={label}>
      <Button aria-label={label} icon={<Icon size={18} />} onClick={toggleSidePanel} />
    </Tooltip>
  );
};

/**
 * Button for downloading the current screenshot as a PNG file.
 */
const DownloadScreenshotButton = ({screenshot, showScreenshot, isUsingMjpegMode}) => {
  const {t} = useTranslation();
  const downloadLabel = t('Download Screenshot');

  return (
    <Tooltip title={downloadLabel}>
      <Button
        aria-label={downloadLabel}
        icon={<IconDownload size={18} />}
        onClick={() => downloadScreenshot(screenshot)}
        disabled={!showScreenshot || isUsingMjpegMode}
      />
    </Tooltip>
  );
};

/**
 * Control buttons shown above the app screenshot.
 */
const ScreenshotControls = (props) => {
  const {
    screenshot,
    screenshotInteractionMode,
    selectScreenshotInteractionMode,
    showScreenshot,
    serverDetails,
    isUsingMjpegMode,
    setMjpegState,
    setRefreshingState,
    toggleShowCentroids,
    showCentroids,
    isGestureEditorVisible,
    clearCoordAction,
    applyClientMethod,
    featureCaps,
    swapMouseButtons,
    setSwapMouseButtons,
    isSidePanelHidden,
    toggleSidePanel,
  } = props;
  const isLiveMode = screenshotInteractionMode === LIVE;

  return (
    <div className={styles.screenshotControls}>
      <Space size="small" wrap className={styles.screenshotControlsSpace}>
        {serverDetails.mjpegScreenshotUrl != null && (
          <ScreenshotCaptureModeControls
            setMjpegState={setMjpegState}
            isUsingMjpegMode={isUsingMjpegMode}
            setRefreshingState={setRefreshingState}
            applyClientMethod={applyClientMethod}
          />
        )}
        {!isLiveMode && (
          <ToggleElementHandlesButton
            showCentroids={showCentroids}
            toggleShowCentroids={toggleShowCentroids}
            isGestureEditorVisible={isGestureEditorVisible}
          />
        )}
        <ScreenshotInteractionModeControls
          screenshotInteractionMode={screenshotInteractionMode}
          selectScreenshotInteractionMode={selectScreenshotInteractionMode}
          clearCoordAction={clearCoordAction}
          isGestureEditorVisible={isGestureEditorVisible}
          platformName={featureCaps.platformName}
          swapMouseButtons={swapMouseButtons}
        />
        {isLiveMode && (
          <SwapMouseButtonsButton swapMouseButtons={swapMouseButtons} setSwapMouseButtons={setSwapMouseButtons} />
        )}
        <DownloadScreenshotButton
          screenshot={screenshot}
          showScreenshot={showScreenshot}
          isUsingMjpegMode={isUsingMjpegMode}
        />
        {toggleSidePanel && (
          <ToggleSidePanelButton isSidePanelHidden={isSidePanelHidden} toggleSidePanel={toggleSidePanel} />
        )}
      </Space>
    </div>
  );
};

export default ScreenshotControls;
