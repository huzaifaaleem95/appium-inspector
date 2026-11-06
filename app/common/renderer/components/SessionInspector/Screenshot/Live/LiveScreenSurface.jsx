import {Dropdown, Input, Modal} from 'antd';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';

import {LIVE_DRAG_THRESHOLD_PX} from '../../../../constants/screenshot.js';
import {INSPECTOR_TABS, NATIVE_APP} from '../../../../constants/session-inspector.js';
import {ELEMENT_GESTURES} from '../../../../lib/gestures/platform-gestures.js';
import {findElementAtPoint, flattenElementsWithBounds} from '../../../../utils/hit-test.js';
import {getSuggestedLocators} from '../../../../utils/locator-generation/common.js';
import {notification} from '../../../../utils/notification.js';
import {copyToClipboard} from '../../../../utils/other.js';
import {findJSONElementByPath} from '../../../../utils/source-parsing.js';
import {handleSwipeOnScreenshot, handleTapOnScreenshot} from '../pointer-actions.js';
import ElementDetailsModal from './ElementDetailsModal.jsx';
import {buildInspectMenuItems, buildInteractMenuItems} from './live-menus.js';

import styles from './Live.module.css';

const MENU = {INTERACT: 'interact', INSPECT: 'inspect'};
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent);

// Which logical button was pressed: 'primary' (left) or 'secondary' (right, or Ctrl+click on macOS)
const getPhysicalButton = (e) => {
  if (e.button === 2 || (e.button === 0 && IS_MAC && e.ctrlKey)) {
    return 'secondary';
  }
  return e.button === 0 ? 'primary' : null;
};

/**
 * Live mode device screen: a single surface that both controls the device and inspects elements.
 * - hover highlights the element under the cursor
 * - the "interact" button (left by default) opens the Interact menu; dragging with it swipes
 * - the "inspect" button (right by default) opens the Inspect menu (locators, copy, reveal)
 * - while a "Drag to…" is pending, a click with either button picks the drop point
 */
const LiveScreenSurface = (props) => {
  const {
    screenSrc,
    imageElRef,
    scaleRatio,
    windowSize,
    sourceJSON,
    sourceXML,
    currentContext,
    featureCaps,
    selectedElementPath,
    swapMouseButtons,
    applyClientMethod,
    tapElement,
    selectElement,
    selectElementNow,
    performElementGesture,
    interactWithElementAtPath,
    refreshSourceIfStale,
    selectInspectorTab,
    onRevealInSource,
  } = props;
  const {t} = useTranslation();

  const surfaceRef = useRef(null);
  const pressRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pendingDrag, setPendingDrag] = useState(null);
  const [typeTarget, setTypeTarget] = useState(null);
  const [typedText, setTypedText] = useState('');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const interactButton = swapMouseButtons ? 'secondary' : 'primary';

  // Screen pixel position (relative to the surface) -> device coordinates
  const toDevicePoint = useCallback(
    (e) => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect || !windowSize?.width) {
        return null;
      }
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const x = Math.round(screenX * scaleRatio);
      const y = Math.round(screenY * scaleRatio);
      if (x < 0 || y < 0 || x > windowSize.width || y > windowSize.height) {
        return null;
      }
      return {x, y, screenX, screenY};
    },
    [scaleRatio, windowSize],
  );

  const closeMenu = () => setMenu(null);

  // Escape cancels a pending "Drag to…" and closes menus
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPendingDrag(null);
        setMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // React bubbles events from portals (the dropdown menu, modals) through the component tree,
  // so ignore any event whose DOM target is not actually inside the device screen
  const isFromSurface = (e) => surfaceRef.current?.contains(e.target);

  const onMouseMove = (e) => {
    if (!isFromSurface(e)) {
      // the pointer is over a menu or dialog, not the device screen
      setHover(null);
      return;
    }
    const point = toDevicePoint(e);
    if (!point) {
      setHover(null);
      return;
    }
    const target = findElementAtPoint(sourceJSON, point.x, point.y);
    setHover((prev) => {
      if (prev?.target?.path === target?.path && prev?.point?.x === point.x && prev?.point?.y === point.y) {
        return prev;
      }
      return {point, target};
    });
  };

  const onMouseLeave = () => {
    setHover(null);
    pressRef.current = null;
  };

  const onMouseDown = (e) => {
    const button = getPhysicalButton(e);
    const point = toDevicePoint(e);
    if (!button || !point || !isFromSurface(e)) {
      return;
    }
    // stop text selection / native drag of the image
    e.preventDefault();
    pressRef.current = {button, point};
  };

  // Menus are opened on mouseup rather than on 'contextmenu', because macOS fires
  // 'contextmenu' on mousedown, which would make drag-to-swipe impossible with the right button
  // (when the buttons are swapped).
  const onMouseUp = async (e) => {
    const press = pressRef.current;
    pressRef.current = null;
    const button = getPhysicalButton(e);
    const point = toDevicePoint(e);
    if (!press || !point || button !== press.button || !isFromSurface(e)) {
      return;
    }
    const moved =
      Math.hypot(point.screenX - press.point.screenX, point.screenY - press.point.screenY) >= LIVE_DRAG_THRESHOLD_PX;

    // A pending "Drag to…" takes the next click (with either button) as the drop point
    if (pendingDrag && !moved) {
      const {target} = pendingDrag;
      setPendingDrag(null);
      await performElementGesture({
        path: target.path,
        bounds: target,
        gesture: ELEMENT_GESTURES.DRAG,
        opts: {endX: point.x, endY: point.y},
      });
      return;
    }

    if (button === interactButton) {
      if (moved) {
        await handleSwipeOnScreenshot(press.point, point, applyClientMethod);
      } else {
        await openMenu(MENU.INTERACT, point);
      }
      return;
    }

    // inspect button
    if (!moved) {
      await openMenu(MENU.INSPECT, point);
    }
  };

  const buildMenuState = (kind, point, source, extra) => {
    const target = findElementAtPoint(source.sourceJSON, point.x, point.y);
    const locators = kind === MENU.INSPECT && target ? getLocatorsFor(target.path, source) : [];
    return {kind, point, target, locators, ...extra};
  };

  // Open the menu right away from the last known source, then refresh the source in the
  // background (it can take several seconds on real devices) and update the menu if the
  // element under the click point changed. Acting before the refresh finishes uses the
  // element that was highlighted when the menu opened.
  const openMenu = async (kind, point) => {
    const token = Symbol('menu');
    setMenu(buildMenuState(kind, point, {sourceJSON, sourceXML}, {token, refreshing: true}));
    const fresh = await refreshSourceIfStale();
    setMenu((prev) => (prev?.token === token ? buildMenuState(kind, point, fresh, {token, refreshing: false}) : prev));
  };

  // Suggested locators for an element, computed locally from the source (no Appium calls)
  const getLocatorsFor = (path, source) => {
    try {
      const element = findJSONElementByPath(path, source.sourceJSON);
      const isNative = currentContext === NATIVE_APP;
      return getSuggestedLocators(element, source.sourceXML, isNative, featureCaps.automationName);
    } catch {
      return [];
    }
  };

  const copyWithToast = (label, value) => {
    copyToClipboard(value);
    notification.success({title: t('Copied!'), description: `${label}: ${value}`, duration: 2});
  };

  const handleInteract = async (key, {target, point}) => {
    const [action, arg] = key.split(':');
    const gestureBase = target ? {path: target.path, bounds: target} : null;
    switch (action) {
      case 'tap':
        return target ? await tapElement(target.path) : await handleTapOnScreenshot(point, applyClientMethod);
      case 'tapPoint':
        return await handleTapOnScreenshot(point, applyClientMethod);
      case 'doubleTap':
        return await performElementGesture({...gestureBase, gesture: ELEMENT_GESTURES.DOUBLE_TAP});
      case 'longPress':
        return await performElementGesture({
          ...gestureBase,
          gesture: ELEMENT_GESTURES.LONG_PRESS,
          opts: {durationMs: Number(arg)},
        });
      case 'swipe':
        return await performElementGesture({...gestureBase, gesture: ELEMENT_GESTURES.SWIPE, opts: {direction: arg}});
      case 'scroll':
        return await performElementGesture({...gestureBase, gesture: ELEMENT_GESTURES.SCROLL, opts: {direction: arg}});
      case 'pinchOpen':
        return await performElementGesture({...gestureBase, gesture: ELEMENT_GESTURES.PINCH_OPEN});
      case 'pinchClose':
        return await performElementGesture({...gestureBase, gesture: ELEMENT_GESTURES.PINCH_CLOSE});
      case 'drag':
        return setPendingDrag({target});
      case 'type':
        setTypedText('');
        return setTypeTarget(target);
      case 'clear':
        return await interactWithElementAtPath(target.path, 'elementClear');
      default:
        return null;
    }
  };

  const handleInspect = async (key, {target, locators}) => {
    const [action, ...rest] = key.split(':');
    switch (action) {
      case 'details':
        setIsDetailsOpen(true);
        return await selectElementNow(target.path);
      case 'copyLocator': {
        const [strategy, selector] = locators[Number(rest[0])] || [];
        return strategy && copyWithToast(strategy, selector);
      }
      case 'reveal':
        selectInspectorTab(INSPECTOR_TABS.SOURCE);
        onRevealInSource?.();
        return await selectElement(target.path);
      default:
        return null;
    }
  };

  const menuItems = useMemo(() => {
    if (!menu) {
      return [];
    }
    const {target, locators, refreshing} = menu;
    if (menu.kind === MENU.INTERACT) {
      return buildInteractMenuItems({t, target, refreshing});
    }
    return buildInspectMenuItems({t, target, locators, refreshing});
  }, [menu, t]);

  const onMenuClick = ({key}) => {
    const current = menu;
    closeMenu();
    if (!current) {
      return;
    }
    if (current.kind === MENU.INTERACT) {
      handleInteract(key, current);
    } else {
      handleInspect(key, current);
    }
  };

  const toScreenRect = (b) =>
    b && {
      left: b.x1 / scaleRatio,
      top: b.y1 / scaleRatio,
      width: (b.x2 - b.x1) / scaleRatio,
      height: (b.y2 - b.y1) / scaleRatio,
    };

  const selectedBounds = useMemo(
    () => flattenElementsWithBounds(sourceJSON).find((el) => el.path === selectedElementPath),
    [sourceJSON, selectedElementPath],
  );

  // While a menu is open, keep highlighting its target rather than whatever is under the cursor
  const highlighted = menu?.target ?? (menu ? null : hover?.target);

  return (
    <>
      <div
        ref={surfaceRef}
        className={`${styles.liveSurface} ${pendingDrag ? styles.dragPending : ''}`}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <img src={screenSrc} id="screenshot" ref={imageElRef} draggable={false} />
        {selectedBounds && selectedBounds.path !== highlighted?.path && (
          <div className={styles.selectedRect} style={toScreenRect(selectedBounds)} />
        )}
        {pendingDrag?.target && <div className={styles.dragSourceRect} style={toScreenRect(pendingDrag.target)} />}
        {highlighted && <div className={styles.hoverRect} style={toScreenRect(highlighted)} />}
        {hover?.point && !menu && (
          <div className={styles.hoverLabel}>
            {hover.target ? `${hover.target.node.tagName} · ` : ''}
            {hover.point.x}, {hover.point.y}
          </div>
        )}
        {pendingDrag && <div className={styles.banner}>{t('liveDragHint')}</div>}
        {menu && (
          <Dropdown
            open
            onOpenChange={(open) => !open && closeMenu()}
            menu={{items: menuItems, onClick: onMenuClick}}
            trigger={['click']}
            destroyOnHidden
          >
            <div
              className={styles.menuAnchor}
              style={{left: menu.point.screenX, top: menu.point.screenY}}
              onMouseDown={(e) => e.stopPropagation()}
              onMouseUp={(e) => e.stopPropagation()}
            />
          </Dropdown>
        )}
      </div>
      <Modal
        title={t('liveTypeText')}
        open={!!typeTarget}
        onCancel={() => setTypeTarget(null)}
        onOk={async () => {
          const target = typeTarget;
          setTypeTarget(null);
          await interactWithElementAtPath(target.path, 'elementSendKeys', [typedText]);
        }}
        okText={t('Send Keys')}
        destroyOnHidden
      >
        <Input
          autoFocus
          value={typedText}
          onChange={(e) => setTypedText(e.target.value)}
          onPressEnter={async () => {
            const target = typeTarget;
            setTypeTarget(null);
            await interactWithElementAtPath(target.path, 'elementSendKeys', [typedText]);
          }}
        />
      </Modal>
      <ElementDetailsModal {...props} open={isDetailsOpen} onClose={() => setIsDetailsOpen(false)} />
    </>
  );
};

export default LiveScreenSurface;
