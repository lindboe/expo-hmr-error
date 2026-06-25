# Draft Expo SDK Bug Report

Draft for filing at https://github.com/expo/expo/issues/new?template=0-bug_report.yml. Fields below map 1:1 to the "SDK Bug Report" template.

---

## Title

`registerBundleEntryPoints` calls `window.location.reload()` on native, crashing dev builds when an async chunk loads after Metro HMR disconnects

---

## Minimal reproducible example

https://github.com/lindboe/expo-hmr-error

---

## Steps to reproduce

Platform: **iOS** (also applies to Android). Environment: **Expo Go** development (dev bundle, `__DEV__`). Package manager: **npm**.

1. `npm install`
2. `npx expo start` and open the app on an iOS simulator (reproduced on iPhone 17 Pro, Expo Go, SDK 56.0.0). Wait until it connects to Metro (Fast Refresh active). Do **not** tap the button yet.
3. Stop Metro (`Ctrl+C`), then start it again: `npx expo start`. The device now shows "Disconnected from Metro" and does **not** auto-reconnect.
4. Tap **Load async chunk**. This fires the first-ever `import('./Heavy')`.

**Expected:** the async chunk loads (or fails gracefully / triggers a normal reload), showing "Loaded async chunk".

**Actual:** a redbox render error appears:

```
Render Error
Cannot read property 'reload' of undefined
```

### Root cause

A dynamic `import()` becomes a Metro async chunk (Expo enables lazy bundling by default — the device bundle URL shows `&lazy=true`). In development, fetching that chunk routes through Expo's HMR client:

```
import('./Heavy')
  -> metro-runtime asyncRequire -> global.__loadBundleAsync
  -> expo/src/async-require/loadBundle.ts  (loadBundleAsync, dev branch)
  -> expo/src/async-require/hmr.ts         (HMRClient.registerBundle)
  -> registerBundleEntryPoints()
```

`registerBundleEntryPoints()` in `expo/src/async-require/hmr.ts` takes a reload branch when the HMR socket is unavailable, and that branch is not native-safe:

```ts
// node_modules/expo/src/async-require/hmr.ts:317
function registerBundleEntryPoints(client: MetroHMRClient | null) {
  if (hmrUnavailableReason != null) {
    // "Bundle Splitting – Metro disconnected"
    window.location.reload(); // line 320 — crashes on native
    return;
  }
  ...
}
```

On React Native, `setUpGlobals` sets `global.window = global` but never defines `window.location`. So `window.location.reload()` reads `.reload` off `undefined` and throws "Cannot read property 'reload' of undefined". Upstream React Native guards the equivalent branch with `DevSettings.reload('Bundle Splitting – Metro disconnected')` (see `react-native/Libraries/Utilities/HMRClient.js`).

`hmrUnavailableReason` is set by the WebSocket `close` / `connection-error` handlers in `hmr.ts`, and Metro's `HMRClient` has no auto-reconnect. So once the socket drops while Metro's HTTP server stays up (e.g. a Metro restart, or the socket going idle during a long flow before the lazy screen first mounts), the next first-time async-chunk load takes the reload branch and crashes. In a real app this commonly presents as a **first-launch-only** crash: a lazily-imported screen that only mounts after a long onboarding flow loads its chunk after the HMR socket has gone idle.

### Note: SDK 56 added the fix but did not wire it in

SDK 56 introduced `expo/src/async-require/hmrUtils.native.ts` with a native-safe helper:

```ts
// node_modules/expo/src/async-require/hmrUtils.native.ts:28
export function reload() {
  // "Bundle Splitting – Metro disconnected"
  DevSettings.reload('Bundle Splitting – Metro disconnected');
}
```

But `hmr.ts` never imports or calls that helper — `registerBundleEntryPoints` still calls `window.location.reload()` inline, and there is no `hmr.native.ts` override. So the helper is effectively dead code for this path and the crash is still live.

### Suggested fix

Route the disconnect branch in `hmr.ts` `registerBundleEntryPoints` through the platform-aware `reload()` helper that SDK 56 already added in `hmrUtils.native.ts` (i.e. `DevSettings.reload(...)` on native, `window.location.reload()` only on web) instead of calling `window.location.reload()` inline.

---

## Environment

```text
  expo-env-info 1.2.x environment info:
    System:
      OS: macOS 26.3
      Shell: 5.9 - /bin/zsh
    Binaries:
      Node: 20.19.2
      Yarn: 1.22.22
      npm: 10.8.2
      Watchman: 2025.05.26.00
    Managers:
      CocoaPods: 1.16.2
    SDKs:
      iOS SDK:
        Platforms: DriverKit 25.5, iOS 26.5, macOS 26.5, tvOS 26.5, visionOS 26.5, watchOS 26.5
      Android SDK:
        API Levels: 31, 34, 35, 36
        Build Tools: 34.0.0, 35.0.0, 35.0.1, 36.0.0
    IDEs:
      Android Studio: 2025.3
      Xcode: 26.5/17F42
    npmPackages:
      expo: ~56.0.12 => 56.0.12
      react: 19.2.3 => 19.2.3
      react-native: 0.85.3 => 0.85.3
    Expo Workflow: managed
```

---

## Expo Doctor Diagnostics

```text
Running 21 checks on your project...
21/21 checks passed. No issues detected!
```
