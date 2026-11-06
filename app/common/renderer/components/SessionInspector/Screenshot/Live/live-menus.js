import {DIRECTIONS} from '../../../../lib/gestures/platform-gestures.js';

// Menu item keys are '<action>' or '<action>:<argument>', parsed by LiveScreenSurface.

const DIRECTION_ARROWS = {up: '↑', down: '↓', left: '←', right: '→'};
const LONG_PRESS_DURATIONS_MS = [1000, 2000, 5000];
// Truncate long selectors (e.g. XPath) in menu labels; the full value is still copied
const MAX_SELECTOR_LABEL = 48;

const directionChildren = (t, action) =>
  DIRECTIONS.map((dir) => ({key: `${action}:${dir}`, label: `${DIRECTION_ARROWS[dir]} ${t(dir)}`}));

// Group title for the menu: element type and label, plus a note while the source is refreshing
const menuTitle = (t, target, refreshing) => {
  const title = elementTitle(target) ?? t('liveNoElement');
  return refreshing ? `${title} · ${t('liveRefreshing')}` : title;
};

const elementTitle = (target) => {
  if (!target) {
    return null;
  }
  const {tagName, attributes = {}} = target.node;
  const shortTag = tagName
    .split('.')
    .pop()
    .replace(/^XCUIElementType/, '');
  const label = attributes.text || attributes['content-desc'] || attributes.label || attributes.name || '';
  return label ? `${shortTag} “${label.slice(0, 30)}”` : shortTag;
};

/**
 * Items for the Interact menu (left-click by default).
 * Element actions are disabled when there is no element under the cursor;
 * "Tap at this point" always works since it only needs coordinates.
 */
export function buildInteractMenuItems({t, target, refreshing}) {
  const noElement = !target;
  return [
    {type: 'group', key: 'title', label: menuTitle(t, target, refreshing)},
    {key: 'tap', label: t('Tap')},
    {key: 'doubleTap', label: t('liveDoubleTap'), disabled: noElement},
    {
      key: 'longPress',
      label: t('liveLongPress'),
      disabled: noElement,
      children: LONG_PRESS_DURATIONS_MS.map((ms) => ({key: `longPress:${ms}`, label: `${ms / 1000}s`})),
    },
    {key: 'swipe', label: t('liveSwipe'), disabled: noElement, children: directionChildren(t, 'swipe')},
    {key: 'scroll', label: t('liveScroll'), disabled: noElement, children: directionChildren(t, 'scroll')},
    {
      key: 'pinch',
      label: t('livePinch'),
      disabled: noElement,
      children: [
        {key: 'pinchOpen', label: t('livePinchOpen')},
        {key: 'pinchClose', label: t('livePinchClose')},
      ],
    },
    {key: 'drag', label: t('liveDragTo'), disabled: noElement},
    {type: 'divider'},
    {key: 'type', label: t('liveTypeText'), disabled: noElement},
    {key: 'clear', label: t('Clear'), disabled: noElement},
    {type: 'divider'},
    {key: 'tapPoint', label: t('liveTapAtPoint')},
  ];
}

/**
 * Items for the Inspect menu (right-click by default).
 * Each suggested locator gets its own "copy" item, so the common case needs no dialog.
 */
export function buildInspectMenuItems({t, target, locators, refreshing}) {
  if (!target) {
    return [{type: 'group', key: 'title', label: menuTitle(t, target, refreshing)}];
  }
  const truncate = (s) => (s.length > MAX_SELECTOR_LABEL ? `${s.slice(0, MAX_SELECTOR_LABEL)}…` : s);
  return [
    {type: 'group', key: 'title', label: menuTitle(t, target, refreshing)},
    {key: 'details', label: t('liveShowLocators')},
    {type: 'divider'},
    ...locators.map(([strategy, selector], index) => ({
      key: `copyLocator:${index}`,
      label: `${t('liveCopy')} ${strategy}: ${truncate(selector)}`,
    })),
    ...(locators.length ? [{type: 'divider'}] : []),
    {key: 'reveal', label: t('liveRevealInSource')},
  ];
}
