import {parseCoordinates} from './other.js';

// Flattened element lists, cached per source tree object so that hit-testing
// on every mouse move does not re-walk and re-parse the whole tree
const flattenedCache = new WeakMap();

const HIDDEN_VALUES = ['false', '0'];

/**
 * Whether the element is explicitly marked as not visible by the driver.
 * Android uses `displayed`, iOS uses `visible`; missing attributes count as visible.
 */
function isHidden(attributes = {}) {
  return HIDDEN_VALUES.includes(attributes.displayed) || HIDDEN_VALUES.includes(attributes.visible);
}

/**
 * Walks the source tree once and returns every element that has a usable on-screen rectangle,
 * along with its depth. The root node (path '') is excluded since it cannot be selected.
 */
export function flattenElementsWithBounds(sourceJSON) {
  if (!sourceJSON || typeof sourceJSON !== 'object') {
    return [];
  }
  const cached = flattenedCache.get(sourceJSON);
  if (cached) {
    return cached;
  }

  const result = [];
  const stack = [{node: sourceJSON, depth: 0}];
  while (stack.length) {
    const {node, depth} = stack.pop();
    if (node.path && !isHidden(node.attributes)) {
      const {x1, y1, x2, y2} = parseCoordinates(node);
      const width = x2 - x1;
      const height = y2 - y1;
      if ([x1, y1, x2, y2].every(Number.isFinite) && width > 0 && height > 0) {
        result.push({path: node.path, node, depth, x1, y1, x2, y2, area: width * height});
      }
    }
    for (const child of node.children || []) {
      stack.push({node: child, depth: depth + 1});
    }
  }

  flattenedCache.set(sourceJSON, result);
  return result;
}

/**
 * Finds the element under a point given in device coordinates.
 *
 * Picks the smallest element whose bounds contain the point, breaking ties by tree depth
 * (deeper wins), so a button's label is preferred over the full-screen container behind it.
 *
 * @param {Object} sourceJSON app source in JSON format (see `xmlToJSON`)
 * @param {number} x device x coordinate
 * @param {number} y device y coordinate
 * @returns {{path: string, node: Object, x1: number, y1: number, x2: number, y2: number}|null}
 */
export function findElementAtPoint(sourceJSON, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  let best = null;
  for (const el of flattenElementsWithBounds(sourceJSON)) {
    if (x < el.x1 || x >= el.x2 || y < el.y1 || y >= el.y2) {
      continue;
    }
    if (!best || el.area < best.area || (el.area === best.area && el.depth > best.depth)) {
      best = el;
    }
  }
  return best;
}
