import { StyleSheet, Text, View } from 'react-native';

/**
 * This component exists only to be pulled into a separate Metro async chunk via
 * the dynamic `import('./Heavy')` in App.tsx. Loading that chunk in dev routes
 * through Expo's HMR client (loadBundle -> HMRClient.registerBundle ->
 * registerBundleEntryPoints), which is where the crash happens.
 */
export default function Heavy() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>Loaded async chunk ✅</Text>
      <Text style={styles.subtext}>
        If you see this, the chunk loaded while HMR was still connected.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#e6ffed',
    alignItems: 'center',
  },
  text: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtext: {
    marginTop: 8,
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
  },
});
