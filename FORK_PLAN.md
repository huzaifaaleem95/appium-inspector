# Fork plan: live-control inspector based on Appium Inspector

Base: `appium/appium-inspector` @ `90d894e` (v2026.9.2, 2026-11-06). Electron + React 19 + Redux Toolkit + antd. Apache-2.0.
All renderer code lives in `app/common/renderer/`; paths below are relative to it unless noted.

## Goal (UX contract)

One window with the device screen mirrored live, plus the existing source tree and tabs on the right (collapsible).

| Input on the device screen | Result |
|---|---|
| Hover | Highlights the element under the cursor (one rectangle, not all of them) |
| **Left-click** | Opens the **Interact** menu for the element under the cursor: Tap, Double tap, Long press, Swipe/Scroll (4 directions), Drag to…, Pinch in/out, Type text…, Clear, Tap at this exact point |
| **Left-button drag** | Swipes directly from the start point to the end point, with no menu |
| **Right-click** | Opens the **Inspect** menu: *Show locators & attributes…* (dialog), Copy best locator, Copy XPath, Reveal in source tree |
| Inspect dialog | Reuses the existing Selected Element pane, where clicking a cell already copies it |
| Phase 2 | Every action above is recorded, then exported as a runnable Python (pytest) script |

Make the button mapping a setting (`Swap left/right click`): most people expect the opposite, and it costs almost nothing to offer.

---

## What already exists (and where)

| Need | Existing code | Notes |
|---|---|---|
| Live screen | `components/SessionInspector/Screenshot/Screenshot.jsx`, `ScreenshotImgWithOverlays.jsx` (`screenSrc = serverDetails.mjpegScreenshotUrl`) | Turns on automatically when the session has `appium:mjpegServerPort` or `appium:mjpegScreenshotUrl` (`actions/SessionBuilder.js:394-426`) |
| Device-coordinate mapping | `scaleRatio` in `Screenshot.jsx` (`updateScreenshotScale`) | Converts screen pixels to device points, so reuse it as-is |
| Coordinate tap/swipe | `handleTapOnScreenshot` / `handleSwipeOnScreenshot` in `ScreenshotImgWithOverlays.jsx`, run in `lib/appium/inspector-driver.js` `executeMethod` (`TAP`/`SWIPE` → `performActions`) | |
| Element bounds | `utils/other.js` `parseCoordinates`, `Overlays/ElementOverlays.jsx` | Currently draws a rectangle for every element |
| Select + resolve element | `actions/SessionInspector.js`: `prepareElementSelection`, `resolveElementId`, `selectElement` (debounced), `tapElement` (immediate) | `resolveElementId` tries each suggested locator with `findElement` and caches the element (gets a variable name such as `el1`) in `InspectorDriver.elementCache` |
| Locator generation | `utils/locator-generation/*` → `getSuggestedLocators` | |
| Locators/attributes pane with click-to-copy | `components/SessionInspector/SourceTab/SelectedElement/*` (`SelectedElementTableCell.jsx` → `copyToClipboard`) | Props-driven, so it can be dropped into a Modal |
| Recorder | `applyClientMethod` (`actions/SessionInspector.js:224`) dispatches `RECORD_ACTION`; `lib/client-frameworks/common.js` `getCodeString` calls `codeFor_<action>`; `lib/client-frameworks/python.js` | It explicitly **skips `gesture`**: `// TODO: Implement recorder code for gestures` |
| Device buttons (Back/Home/etc.) | `components/SessionInspector/Header/DeviceControls/*` | Keep them |
| Electron right-click menu | `app/electron/main/windows.js` `webContents.on('context-menu')` shows "Inspect element" | Must be suppressed over the screen area |

**Key constraint:** the source tree only refreshes after an action sent from the Inspector, or when you press Refresh (`docs/session-inspector/source.md`). With a live screen, the app can change on its own (animations, async loads), so the element tree can go **stale**. Phase 1 handles this explicitly.

---

## Phase 0: Fork and run (½ day)

1. Fork on GitHub and clone the fork.
2. Rebrand: `electron-builder.json` (`productName`, `appId`, and remove the OpenJS `azureSignOptions`), `package.json` (`name`, `homepage`, `repository`).
3. Point `app/electron/main/updater.js` (`RELEASES_LINK` and the electron-updater feed) at your fork, or disable it.
4. `npm ci && npm run dev:electron`
5. Appium: `npm i -g appium && appium driver install uiautomator2 && appium driver install xcuitest`
6. Capabilities that enable live mode:
   - Android: `"appium:mjpegServerPort": 7810` (the driver adb-forwards it). Session settings: `mjpegScalingFactor`, `mjpegServerFramerate`.
   - iOS: `"appium:mjpegServerPort": 9100` (WDA; the driver forwards it on real devices). Settings: `mjpegServerFramerate` (up to 60), `mjpegScalingFactor` (~50), `mjpegServerScreenshotQuality`.
7. **Auto-inject:** in `actions/SessionBuilder.js` (session start), add a free `mjpegServerPort` when it's missing, behind a "Live mirror" checkbox that defaults to on. This removes the need to hand-edit capabilities.

## Phase 1: Unified live interaction mode (≈ 2–3 weeks)

### 1.1 New mode and hit-testing
- `constants/screenshot.js`: add `SCREENSHOT_INTERACTION_MODE.LIVE`; `reducers/SessionInspector.js:107` sets it as the default `screenshotInteractionMode`. Keep the old modes reachable from `ScreenshotControls.jsx`.
- **New** `utils/hit-test.js`:
  ```js
  // Returns {path, element} of the deepest visible element whose bounds contain (x,y) in device coords.
  export function findElementAtPoint(sourceJSON, x, y) { ... }
  ```
  - Use `parseCoordinates` for bounds and skip zero-size elements and `displayed/visible="false"`.
  - Pick the deepest match. On ties, pick the smallest area, then prefer `clickable="true"` (Android) or `enabled`/`accessible` (iOS).
  - Cache a flattened list for each `sourceJSON`, so mouse-move stays O(n) and allocation-free.
- **New** `test/unit/utils-hit-test.spec.js`: use the XML fixtures already in `test/unit/mocks`.

### 1.2 Screen surface (`ScreenshotImgWithOverlays.jsx`)
In `LIVE` mode:
- `onMouseMove`: compute device x/y (existing code) → `findElementAtPoint` → `hoveredPath` (local state) → render **new** `Overlays/HoverHighlight.jsx` (a single rectangle). Don't render `ElementOverlays` in this mode.
- `onMouseDown`: when `button === 2`, store the start point (for right-drag).
- `onMouseUp`: when `button === 2` and the cursor moved ≥ 5 px, call the existing `handleSwipeOnScreenshot`.
- `onContextMenu`: `e.preventDefault()`. If the cursor didn't move, open the **InteractMenu** at `{clientX, clientY}` for `hoveredPath` and the device point. `preventDefault` also suppresses Electron's "Inspect element" menu. Additionally, restrict that menu in `app/electron/main/windows.js` to `isDev`.
- `onClick` (left): open the **InspectMenu**.
- If "swap buttons" is set, exchange the two handlers.
- Keep the `Spin` disabled in MJPEG mode (already the case).

### 1.3 Menus (new components in `components/SessionInspector/Screenshot/Menus/`)
Render as an antd `Dropdown` with `open` controlled and an invisible 1×1 anchor `div` placed absolutely at the click point (`menu={{items, onClick}}`).

`InteractMenu.jsx`: first resolve the element (`resolveElementId`, **not** debounced; same pattern as `tapElement`), then dispatch:

| Item | Android (UiAutomator2) | iOS (XCUITest) |
|---|---|---|
| Tap | `elementClick` (existing) | same |
| Double tap | `mobile: doubleClickGesture {elementId}` | `mobile: doubleTap {elementId}` |
| Long press ▸ 1s/2s/custom | `mobile: longClickGesture {elementId, duration}` | `mobile: touchAndHold {elementId, duration}` |
| Swipe ▸ ↑↓←→ | `mobile: swipeGesture {elementId, direction, percent: 0.75}` | `mobile: swipe {elementId, direction}` |
| Scroll ▸ ↑↓ | `mobile: scrollGesture {elementId, direction, percent: 1.0}` | `mobile: scroll {elementId, direction}` |
| Drag to… | 2-step: next left-click picks the target → `mobile: dragGesture {elementId, endX, endY}` | `mobile: dragFromToForDuration {fromX, fromY, toX, toY, duration}` |
| Pinch ▸ in/out | `mobile: pinchCloseGesture` / `pinchOpenGesture {elementId, percent}` | `mobile: pinch {elementId, scale, velocity}` |
| Type text… | antd `Modal` with `Input` → `elementSendKeys` | same |
| Clear | `elementClear` | same |
| Tap at this point | existing coordinate `TAP` | same |

- Put this table in **new** `lib/gestures/platform-gestures.js`: `getGestureCommand(automationName, gesture, opts) → {script, args}`. Read `automationName` from `state.inspector.featureCaps.automationName`, which is already used by `prepareElementSelection`.
- Disable items the driver doesn't support. Fall back to W3C `performActions` for unknown drivers (Espresso, Flutter, etc.).

`InspectMenu.jsx`:
- *Show locators & attributes…* → `selectElement(path)`, but call the non-debounced path. Export a `selectElementNow` from `actions/SessionInspector.js` that wraps `prepareElementSelection` and `resolveElementId`. Then open `ElementDetailsModal`.
- *Copy best locator*: `strategyMap[0]` → `copyToClipboard`, with toast "Copied `accessibility id`: …".
- *Copy XPath*: the `xpath` entry from `strategyMap`.
- *Reveal in source tree*: select it and switch to the Source tab (`selectInspectorTab`).

**New** `ElementDetailsModal.jsx`: antd `Modal` (draggable, non-blocking, `mask={false}`) wrapping the existing `<SelectedElement {...props} />` unchanged. Click-to-copy is already in `SelectedElementTableCell.jsx`.

### 1.4 The new action path (shared with the recorder)
Add one pseudo-method so element gestures carry the *element variable* rather than a raw session-specific elementId.

- `lib/appium/inspector-driver.js` `executeMethod`: add a branch for `methodName === 'elementGesture'` with `elementId`:
  ```js
  const [script, opts] = args;
  res = await this.driver.executeScript(script, [{...opts, elementId}]);
  ```
  (Return `cachedEl` as the element branch does, so `variableName` reaches the recorder.)
- `InteractMenu` calls `applyClientMethod({methodName: 'elementGesture', elementId, args: [script, opts]})`.

### 1.5 Keeping the tree fresh
- Reducer: add `sourceFetchedAt` (set on `SET_SOURCE_AND_SCREENSHOT`).
- Before opening either menu: if `Date.now() - sourceFetchedAt > STALE_MS` (setting, default 2000), run `applyClientMethod({methodName: 'getPageSource', skipScreenshot: true})` first, then hit-test again at the same point. Show a small "refreshing…" spinner on the anchor.
- Optional idle polling toggle (every N s while the window is focused and no call is in flight), off by default because iOS source can take 1–5 s on deep trees.
- Recommend these settings in a docs note: `snapshotMaxDepth`, `pageSourceExcludedAttributes` (iOS), `ignoreUnimportantViews`/`compressedLayout` (Android).
- Show a "tree may be stale" badge when the last refresh is older than `STALE_MS`.

### 1.6 Layout
- `SessionInspector.jsx`: make the right `Splitter.Panel` `collapsible`, and add a toolbar toggle "Device only" so the mirror can fill the window like Vysor.
- Optional keyboard passthrough: while the screen has focus, typing sends text to the focused element (`driver.getActiveElement()` → `sendKeys`). Backspace/Enter map to `mobile: pressKey` (Android) or `\b`/`\n` (iOS).

### 1.7 (Optional) Low-latency Android mirroring, ≈ 1–2 weeks
MJPEG gives ~10–30 fps with visible lag. For a Vysor-like feel on Android, run the **scrcpy server** from the Electron main process (`@yume-chan/adb` + `@yume-chan/adb-scrcpy`, i.e. the Tango stack). Stream H.264 to the renderer over IPC and decode with WebCodecs onto a `<canvas>` that replaces the `<img>`. **Keep all input going through Appium** so the recorder and locators stay consistent. iOS stays on WDA MJPEG, since there's no scrcpy equivalent.

## Phase 2: Recording to Python (≈ 1–2 weeks)

1. `actions/SessionInspector.js` `applyClientMethod`:
   - Remove the `'gesture'` exclusion only for the new `elementGesture`.
   - The existing `findAndAssign` emission already records `el = driver.find_element(...)` with the *first* suggested locator, which prefers accessibility id/id.
2. `lib/client-frameworks/python.js`: add
   ```js
   codeFor_elementGesture(varName, varIndex, script, opts) {
     const el = this.getVarName(varName, varIndex);
     return `driver.execute_script(${this.quote(script)}, {**${this.getPythonVal(opts)}, "elementId": ${el}.id})`;
   }
   ```
   Other frameworks automatically emit the "not currently supported" comment via `getCodeString`, so add them later.
3. **New** `lib/client-frameworks/python-pytest.js` (`extends PythonFramework`), registered in `constants/session-inspector.js` `CLIENT_FRAMEWORKS` and `lib/client-frameworks/map.js`:
   - A `driver` fixture (`scope="function"`, `yield`, `quit`) holding the caps.
   - Use `WebDriverWait(driver, 10).until(EC.element_to_be_clickable((AppiumBy.X, "...")))` instead of bare `find_element`.
   - One `def test_recorded_flow(driver):` body.
4. Recorder tab (`RecorderTab/RecorderTabCard.jsx`): add a **Save as .py** button using `utils/file-handling.js` `downloadFile` with a `data:text/x-python` URL, plus "Start recording" next to the screen.
5. Coordinate taps and right-drag swipes are already recorded (`codeFor_tap` / `codeFor_swipe`). Add a recorder comment such as `# coordinate-based: fragile` to them.
6. Tests: extend `test/unit/client-frameworks.spec.js` with `elementGesture` and the pytest boilerplate.

## Phase 3: Packaging (½–1 day + signing)
- `npm run build && npx electron-builder --mac --win` (build each OS on its own OS or in CI; the repo's GitHub workflows can be adapted).
- macOS: unsigned builds are fine for yourself (right-click → Open). Distributing to others needs an Apple Developer ID plus notarization.
- Windows: unsigned triggers SmartScreen. For a team, use a code-signing cert or Azure Trusted Signing.

## Files touched (summary)

| File | Change |
|---|---|
| `constants/screenshot.js` | `LIVE` mode |
| `reducers/SessionInspector.js` | default mode, `sourceFetchedAt`, settings (swap buttons, stale ms, polling) |
| `actions/SessionInspector.js` | `selectElementNow`, refresh-before-menu, record `elementGesture` |
| `actions/SessionBuilder.js` | auto-inject `mjpegServerPort` |
| `lib/appium/inspector-driver.js` | `elementGesture` branch |
| `components/SessionInspector/Screenshot/ScreenshotImgWithOverlays.jsx` | LIVE handlers |
| `components/SessionInspector/SessionInspector.jsx` | collapsible panel / "Device only" |
| `components/SessionInspector/RecorderTab/RecorderTabCard.jsx` | Save .py |
| `lib/client-frameworks/python.js`, `map.js`, `constants/session-inspector.js` | gesture code, pytest framework |
| `app/electron/main/windows.js`, `updater.js`, `electron-builder.json`, `package.json` | context menu, branding, updates |
| **New** | `utils/hit-test.js`, `Overlays/HoverHighlight.jsx`, `Menus/InteractMenu.jsx`, `Menus/InspectMenu.jsx`, `Menus/ElementDetailsModal.jsx`, `lib/gestures/platform-gestures.js`, `lib/client-frameworks/python-pytest.js`, tests |

## Risks / open questions
- **Stale tree vs live screen.** This is the main UX risk. 1.5 mitigates it, but menus will occasionally take 0.5–3 s to open on iOS.
- **WebViews / Flutter / games.** Hit-testing only works where the native tree has bounds. Fall back to coordinate actions.
- **Upstream drift.** Keep changes additive (new mode, new files) so you can rebase on upstream releases. The LIVE mode is a reasonable candidate for an upstream PR.
- **Licensing.** Apache-2.0 lets you fork and redistribute. Keep `LICENSE`, note your modifications, and use your own product name and icon rather than the Appium branding.
