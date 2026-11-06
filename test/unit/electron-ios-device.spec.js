import {describe, expect, it} from 'vitest';

import {isRealIosDeviceUdid} from '../../app/electron/main/ios-device.js';

describe('electron/main/ios-device.js #isRealIosDeviceUdid', function () {
  it('should accept real device UDIDs', function () {
    expect(isRealIosDeviceUdid('00008150-000223EA3441401C')).toBe(true);
    expect(isRealIosDeviceUdid('a'.repeat(40))).toBe(true);
  });

  it('should reject simulator UDIDs and anything else', function () {
    expect(isRealIosDeviceUdid('5461177C-FE5B-4A7B-B881-FF75E6FD1A5F')).toBe(false);
    expect(isRealIosDeviceUdid('00008150-000223EA3441401C; rm -rf /')).toBe(false);
    expect(isRealIosDeviceUdid(undefined)).toBe(false);
  });
});
