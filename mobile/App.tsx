import React, { useCallback, useEffect, useState } from 'react';
import {
  StatusBar, SafeAreaView, StyleSheet,
  View, Text, ActivityIndicator, Pressable,
} from 'react-native';
import { MissionControlScreen } from './src/screens/MissionControlScreen';
import { TelemetryScreen } from './src/screens/TelemetryScreen';
import { BleProvider } from './src/context/BleContext';
import { C } from './src/theme/colors';
import { initDb } from './src/db/database';
import { migrateJsonToSqlite } from './src/db/migrate_json';

function App(): React.JSX.Element {
  const [ready,  setReady]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [migMsg, setMigMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mission' | 'telemetry'>('mission');

  const dismissMigMsg = useCallback(() => setMigMsg(null), []);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const db = await initDb();
        const result = await migrateJsonToSqlite(db);
        if (cancelled) return;

        if (result.success && !result.alreadyDone && result.results) {
          const { rides = 0, messages = 0 } = result.results;
          if (rides > 0 || messages > 0) {
            setMigMsg(`Imported ${rides} ride${rides !== 1 ? 's' : ''} and ${messages} message${messages !== 1 ? 's' : ''}.`);
          }
        }
        if (!result.success) console.warn('[App] Migration failed:', result.error);

        setReady(true);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to initialise database');
      }
    }
    setup();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Failed to start.{'\n'}Please restart the app.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator color="#1D6B3E" size="large" />
        <Text style={styles.loadingText}>Starting up…</Text>
      </SafeAreaView>
    );
  }

  return (
    <BleProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={C.surface} />
        <View style={styles.tabBar}>
          <Pressable style={[styles.tab, activeTab === 'mission' && styles.tabActive]}
            onPress={() => setActiveTab('mission')}>
            <Text style={[styles.tabText, activeTab === 'mission' && styles.tabTextActive]}>Mission</Text>
          </Pressable>
          <Pressable style={[styles.tab, activeTab === 'telemetry' && styles.tabActive]}
            onPress={() => setActiveTab('telemetry')}>
            <Text style={[styles.tabText, activeTab === 'telemetry' && styles.tabTextActive]}>Telemetry</Text>
          </Pressable>
        </View>
        {/* Both screens stay mounted — display:none hides the inactive one
            without unmounting it, so BLE state and connection survive tab switches. */}
        <View style={[styles.screen, activeTab !== 'mission'   && styles.hidden]}>
          <MissionControlScreen />
        </View>
        <View style={[styles.screen, activeTab !== 'telemetry' && styles.hidden]}>
          <TelemetryScreen />
        </View>
        {migMsg && <MigrationToast message={migMsg} onDismiss={dismissMigMsg} />}
      </SafeAreaView>
    </BleProvider>
  );
}

function MigrationToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <View style={styles.toast}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: C.surface,
    borderBottomWidth: 0.5, borderBottomColor: '#333' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#1D6B3E' },
  tabText: { fontSize: 13, color: '#6B7A99' },
  tabTextActive: { color: '#1D6B3E', fontWeight: '500' },
  screen:      { flex: 1 },
  hidden:      { display: 'none' },
  container:   { flex: 1, backgroundColor: C.surface },
  center:      { alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText:   { fontSize: 17, color: '#B85450', textAlign: 'center', lineHeight: 26 },
  errorDetail: { fontSize: 12, color: '#8A7A6A', textAlign: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: 14, color: '#8A7A6A', marginTop: 8 },
  toast:       { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: '#1D6B3E', borderRadius: 8, padding: 12, alignItems: 'center' },
  toastText:   { color: '#fff', fontSize: 13, fontWeight: '500' },
});

export default App;
