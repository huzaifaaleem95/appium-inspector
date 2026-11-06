import {SERVER_TYPES} from '../constants/session-builder.js';

// Default MJPEG ports used by the drivers that support streaming the device screen.
// Both drivers forward the port from the device to the Appium host automatically.
export const LIVE_MIRROR_PORTS = {
  uiautomator2: 7810,
  xcuitest: 9100,
};

// Only inject for servers the user runs themselves: cloud vendors expose their own streams
// (or none), and an injected port would not be reachable from this machine anyway.
const LIVE_MIRROR_SERVER_TYPES = [SERVER_TYPES.LOCAL, SERVER_TYPES.REMOTE, SERVER_TYPES.ADVANCED];

const getCap = (caps, name) => caps[`appium:${name}`] ?? caps[name];

/**
 * Returns which driver the capabilities target ('uiautomator2', 'xcuitest' or null),
 * using automationName first and falling back to platformName defaults.
 */
export function getLiveMirrorDriver(caps) {
  const automationName = String(getCap(caps, 'automationName') ?? '').toLowerCase();
  if (automationName) {
    return automationName in LIVE_MIRROR_PORTS ? automationName : null;
  }
  const platformName = String(caps.platformName ?? '').toLowerCase();
  if (platformName === 'android') {
    return 'uiautomator2';
  }
  if (platformName === 'ios') {
    return 'xcuitest';
  }
  return null;
}

/**
 * Adds `appium:mjpegServerPort` to new-session capabilities so the Inspector shows a live,
 * continuously updating device screen instead of a static screenshot.
 * Leaves the capabilities untouched if the user already configured MJPEG, if the driver
 * does not support it, or if the server is a cloud vendor.
 */
export function withLiveMirrorCaps(caps, serverType) {
  if (!LIVE_MIRROR_SERVER_TYPES.includes(serverType)) {
    return caps;
  }
  if (getCap(caps, 'mjpegServerPort') !== undefined || getCap(caps, 'mjpegScreenshotUrl') !== undefined) {
    return caps;
  }
  const driverName = getLiveMirrorDriver(caps);
  if (!driverName) {
    return caps;
  }
  return {...caps, 'appium:mjpegServerPort': LIVE_MIRROR_PORTS[driverName]};
}

// After an iOS session on a real device served by a local Appium server, the XCUITest driver
// leaves WebDriverAgent running (the device keeps showing "Automation Running"). Returns the
// device UDID if Live Inspector should stop it, or null. Skipped when the session reused a
// separately managed WebDriverAgent (webDriverAgentUrl). Simulators are filtered out later.
export function getLocalIosDeviceUdidToClean({driver, sessionCaps = {}, featureCaps = {}, serverDetails = {}}) {
  if (featureCaps.automationName !== 'xcuitest') {
    return null;
  }
  const caps = driver?.capabilities ?? {};
  const getCap = (name) => caps[name] ?? caps[`appium:${name}`] ?? sessionCaps[`appium:${name}`] ?? sessionCaps[name];
  if (getCap('webDriverAgentUrl')) {
    return null;
  }
  let host;
  try {
    host = new URL(serverDetails.serverUrl).hostname;
  } catch {
    return null;
  }
  const isLocalServer = ['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(host);
  const udid = getCap('udid');
  return isLocalServer && typeof udid === 'string' ? udid : null;
}
