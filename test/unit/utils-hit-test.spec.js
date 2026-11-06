import {describe, expect, it} from 'vitest';

import {findElementAtPoint, flattenElementsWithBounds} from '../../app/common/renderer/utils/hit-test.js';
import {xmlToJSON} from '../../app/common/renderer/utils/source-parsing.js';

const ANDROID_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy>
  <android.widget.FrameLayout bounds="[0,0][1080,2400]" displayed="true">
    <android.widget.LinearLayout bounds="[0,200][1080,800]" displayed="true">
      <android.widget.Button bounds="[100,300][500,400]" clickable="true" displayed="true" text="OK">
        <android.widget.TextView bounds="[150,320][450,380]" displayed="true" text="OK label"/>
      </android.widget.Button>
      <android.widget.Button bounds="[600,300][1000,400]" displayed="false" text="Hidden"/>
      <android.view.View bounds="[0,0][0,0]" displayed="true"/>
    </android.widget.LinearLayout>
  </android.widget.FrameLayout>
</hierarchy>`;

const IOS_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
  <XCUIElementTypeApplication x="0" y="0" width="390" height="844" visible="true">
    <XCUIElementTypeWindow x="0" y="0" width="390" height="844" visible="true">
      <XCUIElementTypeButton name="Login" x="20" y="100" width="100" height="44" visible="true"/>
      <XCUIElementTypeOther x="20" y="100" width="100" height="44" visible="true">
        <XCUIElementTypeStaticText name="Same size, deeper" x="20" y="100" width="100" height="44" visible="true"/>
      </XCUIElementTypeOther>
      <XCUIElementTypeButton name="Offscreen" x="0" y="900" width="100" height="44" visible="false"/>
    </XCUIElementTypeWindow>
  </XCUIElementTypeApplication>
</AppiumAUT>`;

describe('utils/hit-test.js', function () {
  const android = xmlToJSON(ANDROID_SOURCE);
  const ios = xmlToJSON(IOS_SOURCE);

  describe('#flattenElementsWithBounds', function () {
    it('should skip the root, hidden and zero-size elements', function () {
      const tags = flattenElementsWithBounds(android).map((el) => el.node.tagName);
      expect(tags).toEqual(
        expect.arrayContaining([
          'android.widget.FrameLayout',
          'android.widget.LinearLayout',
          'android.widget.TextView',
        ]),
      );
      expect(tags).toHaveLength(4);
      expect(tags).not.toContain('android.view.View');
      expect(flattenElementsWithBounds(android).some((el) => el.node.attributes.text === 'Hidden')).toBe(false);
    });

    it('should return the same cached array for the same tree', function () {
      expect(flattenElementsWithBounds(android)).toBe(flattenElementsWithBounds(android));
    });

    it('should handle empty input', function () {
      expect(flattenElementsWithBounds({})).toEqual([]);
      expect(flattenElementsWithBounds(null)).toEqual([]);
    });
  });

  describe('#findElementAtPoint', function () {
    it('should return the smallest element containing the point (Android bounds)', function () {
      expect(findElementAtPoint(android, 200, 350).node.attributes.text).toBe('OK label');
      expect(findElementAtPoint(android, 110, 310).node.attributes.text).toBe('OK');
      expect(findElementAtPoint(android, 50, 250).node.tagName).toBe('android.widget.LinearLayout');
      expect(findElementAtPoint(android, 50, 1000).node.tagName).toBe('android.widget.FrameLayout');
    });

    it('should ignore hidden elements', function () {
      expect(findElementAtPoint(android, 700, 350).node.tagName).toBe('android.widget.LinearLayout');
    });

    it('should prefer the deeper element when sizes are equal (iOS x/y/width/height)', function () {
      expect(findElementAtPoint(ios, 50, 120).node.attributes.name).toBe('Same size, deeper');
    });

    it('should treat the right/bottom edge as exclusive', function () {
      expect(findElementAtPoint(ios, 120, 120).node.tagName).toBe('XCUIElementTypeWindow');
    });

    it('should return null outside every element or for invalid points', function () {
      expect(findElementAtPoint(ios, 500, 500)).toBeNull();
      expect(findElementAtPoint(ios, undefined, 10)).toBeNull();
    });
  });
});
