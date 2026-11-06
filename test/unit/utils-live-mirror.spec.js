import {describe, expect, it} from 'vitest';

import {SERVER_TYPES} from '../../app/common/renderer/constants/session-builder.js';
import {getLiveMirrorDriver, withLiveMirrorCaps} from '../../app/common/renderer/utils/live-mirror.js';

describe('utils/live-mirror.js', function () {
  describe('#getLiveMirrorDriver', function () {
    it('should use automationName when present', function () {
      expect(getLiveMirrorDriver({'appium:automationName': 'UiAutomator2'})).toBe('uiautomator2');
      expect(getLiveMirrorDriver({automationName: 'XCUITest'})).toBe('xcuitest');
      expect(getLiveMirrorDriver({platformName: 'Android', 'appium:automationName': 'Espresso'})).toBeNull();
    });

    it('should fall back to platformName', function () {
      expect(getLiveMirrorDriver({platformName: 'Android'})).toBe('uiautomator2');
      expect(getLiveMirrorDriver({platformName: 'iOS'})).toBe('xcuitest');
      expect(getLiveMirrorDriver({platformName: 'Windows'})).toBeNull();
    });
  });

  describe('#withLiveMirrorCaps', function () {
    it('should add the default MJPEG port for local servers', function () {
      expect(withLiveMirrorCaps({platformName: 'Android'}, SERVER_TYPES.LOCAL)).toEqual({
        platformName: 'Android',
        'appium:mjpegServerPort': 7810,
      });
      expect(withLiveMirrorCaps({platformName: 'iOS'}, SERVER_TYPES.REMOTE)['appium:mjpegServerPort']).toBe(9100);
    });

    it('should not override user MJPEG settings', function () {
      const caps = {platformName: 'Android', 'appium:mjpegServerPort': 8000};
      expect(withLiveMirrorCaps(caps, SERVER_TYPES.LOCAL)).toBe(caps);
      const urlCaps = {platformName: 'iOS', mjpegScreenshotUrl: 'http://x'};
      expect(withLiveMirrorCaps(urlCaps, SERVER_TYPES.LOCAL)).toBe(urlCaps);
    });

    it('should not touch caps for cloud vendors or unsupported drivers', function () {
      const caps = {platformName: 'Android'};
      expect(withLiveMirrorCaps(caps, SERVER_TYPES.SAUCE)).toBe(caps);
      const winCaps = {platformName: 'Windows'};
      expect(withLiveMirrorCaps(winCaps, SERVER_TYPES.LOCAL)).toBe(winCaps);
    });
  });
});
