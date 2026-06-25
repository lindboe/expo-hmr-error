# Expo dev-only native crash: HMR `registerBundleEntryPoints` calls `window.location.reload()`

Minimal reproduction of a **development-mode-only native crash** triggered when a dynamic `import()` (async chunk) is loaded *after* the Metro HMR WebSocket has disconnected:

```
Render Error: Cannot read property 'reload' of undefined
```

## Versions

- `expo@56.0.x` (also reproduces on `expo@55.x`)
- `react-native@0.85.x`
- iOS simulator / Android emulator (native — does **not** affect web)

## Root cause

A dynamic `import()` becomes a Metro **async chunk** (Expo enables async/lazy bundling by default). In development, fetching that chunk routes through Expo's HMR client:

```
import('./Heavy')
  -> metro-runtime asyncRequire -> global.__loadBundleAsync
  -> expo/src/async-require/loadBundle.ts  (loadBundleAsync, dev branch)
  -> expo/src/async-require/hmr.ts         (HMRClient.registerBundle)
  -> registerBundleEntryPoints()
```

`registerBundleEntryPoints()` in [`expo/src/async-require/hmr.ts`](https://github.com/expo/expo/blob/main/packages/expo/src/async-require/hmr.ts) takes a reload branch when the HMR socket is unavailable, and that branch is **not native-safe**:

```ts
function registerBundleEntryPoints(client: MetroHMRClient | null) {
  if (hmrUnavailableReason != null) {
    // "Bundle Splitting – Metro disconnected"
    window.location.reload(); // <-- crashes on native
    return;
  }
  ...
}
```

On React Native, `setUpGlobals` sets `global.window = global` but never defines `window.location`. So `window.location.reload()` reads `.reload` off `undefined` and throws **"Cannot read property 'reload' of undefined"**.

Upstream React Native guards the equivalent branch with a native-safe call:

```ts
// react-native/Libraries/Utilities/HMRClient.js
function registerBundleEntryPoints(client) {
  if (hmrUnavailableReason != null) {
    DevSettings.reload('Bundle Splitting – Metro disconnected');
    return;
  }
  ...
}
```

### Note: SDK 56 added the fix but didn't wire it in

SDK 56 introduced `expo/src/async-require/hmrUtils.native.ts` with a native-safe helper:

```ts
// hmrUtils.native.ts
export function reload() {
  DevSettings.reload('Bundle Splitting – Metro disconnected');
}
```

But `hmr.ts` never imports or calls that helper — `registerBundleEntryPoints` still calls `window.location.reload()` inline. So the helper is effectively dead code for this path and the crash is still live.

### Why it presents as "first launch only" in real apps

`hmrUnavailableReason` is set by the WebSocket `close` / `connection-error` handlers, and Metro's `HMRClient` has **no auto-reconnect**. If a lazily-imported screen only mounts after a long flow (e.g. onboarding -> passcode -> permissions, 30s+), the HMR socket may have gone idle/disconnected by the time the chunk is first requested, taking the reload branch. On subsequent launches the screen mounts immediately while HMR is healthy, so the chunk fetches cleanly — making it look like a first-launch-only bug.

## Deterministic reproduction

The reliable way to force `hmrUnavailableReason != null` while Metro still serves the chunk over HTTP is to **restart Metro** after the device has connected:

1. `npm install`
2. `npx expo start` and open the app on an **iOS simulator or Android emulator** (Expo Go or a dev client). Wait until it connects to Metro (Fast Refresh active). Do **not** tap the button yet.
3. Stop Metro (`Ctrl+C`) and start it again: `npx expo start`. The device shows "Disconnected from Metro" and does not auto-reconnect — this sets `hmrUnavailableReason`.
4. Tap **Load async chunk**. This fires the first-ever `import('./Heavy')`.
5. Observe the redbox: **"Cannot read property 'reload' of undefined"**, originating in `expo/src/async-require/hmr.ts` -> `registerBundleEntryPoints` -> `window.location.reload()`.

If HMR is still connected when you tap the button, the chunk loads normally and you see "Loaded async chunk" — that's the non-crashing control path.

## Suggested fix

In `hmr.ts`, route the disconnect branch through a platform-aware reload (the helper SDK 56 already added in `hmrUtils.native.ts`) instead of calling `window.location.reload()` inline — i.e. `DevSettings.reload(...)` on native, `window.location.reload()` only on web.

## Files

- [`App.tsx`](./App.tsx) — button-gated `React.lazy(() => import('./Heavy'))` inside `<Suspense>`.
- [`Heavy.tsx`](./Heavy.tsx) — trivial component that exists only to become a separate async chunk.
