import React, { Suspense, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

/**
 * `React.lazy` + dynamic `import()` makes Metro split `./Heavy` into a separate
 * async chunk. In dev, fetching that chunk goes through Expo's HMR client. If the
 * HMR WebSocket has disconnected (so `hmrUnavailableReason != null` inside
 * `expo/src/async-require/hmr.ts`), `registerBundleEntryPoints()` calls
 * `window.location.reload()` — which is undefined on native and throws
 * "Cannot read property 'reload' of undefined".
 *
 * The import is gated behind a button so the chunk is only requested on demand
 * (not prefetched at startup), letting us control *when* it loads relative to
 * the HMR socket state.
 */
const Heavy = React.lazy(() => import('./Heavy'));

export default function App() {
  const [show, setShow] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Expo HMR reload crash repro</Text>
      <Text style={styles.body}>
        Follow the steps in README.md. In short: connect to Metro, then restart
        Metro (Ctrl+C and `npx expo start` again), then tap the button below to
        fire the first dynamic import after the HMR socket has dropped.
      </Text>

      <Pressable
        style={styles.button}
        onPress={() => setShow(true)}
        testID="load-async-chunk"
      >
        <Text style={styles.buttonText}>Load async chunk</Text>
      </Pressable>

      {show && (
        <Suspense fallback={<Text style={styles.body}>Loading…</Text>}>
          <Heavy />
        </Suspense>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
