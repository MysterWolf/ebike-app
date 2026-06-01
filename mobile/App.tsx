import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StatusBar, SafeAreaView, StyleSheet,
  View, Text, ActivityIndicator, Pressable,
} from 'react-native';
import { MissionControlScreen } from './src/screens/MissionControlScreen';
import { TelemetryScreen } from './src/screens/TelemetryScreen';
import { BleProvider } from './src/context/BleContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { initDb } from './src/db/database';
import { migrateJsonToSqlite } from './src/db/migrate_json';
import { MWSSplash } from './src/components/shared/MWSSplash';
import { activateKeepAwake, deactivateKeepAwake } from './src/utils/ScreenModule';

function AppContent(): React.JSX.Element {
  const { C, resolvedMode } = useTheme();
  const [ready,  setReady]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [migMsg, setMigMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'mission' | 'telemetry'>('mission');

  const dismissMigMsg = useCallback(() => setMigMsg(null), []);

  useEffect(() => {
    activateKeepAwake();
    return () => deactivateKeepAwake();
  }, []);

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

  const styles = useMemo(() => StyleSheet.create({
    container:   { flex: 1, backgroundColor: C.surface },
    center:      { alignItems: 'center', justifyContent: 'center', gap: 12 },
    tabBar:      { flexDirection: 'row', backgroundColor: C.surface,
                   borderBottomWidth: 0.5, borderBottomColor: C.border },
    tab:         { flex: 1, paddingVertical: 10, alignItems: 'center' },
    tabActive:   { borderBottomWidth: 2, borderBottomColor: C.accent },
    tabText:     { fontSize: 13, color: C.muted },
    tabTextActive: { color: C.accent, fontWeight: '500' },
    screen:      { flex: 1 },
    hidden:      { display: 'none' },
    errorText:   { fontSize: 17, color: C.danger, textAlign: 'center', lineHeight: 26 },
    errorDetail: { fontSize: 12, color: C.muted, textAlign: 'center', paddingHorizontal: 32 },
    loadingText: { fontSize: 14, color: C.muted, marginTop: 8 },
  }), [C]);

  const barStyle = resolvedMode === 'night' ? 'light-content' : 'dark-content';

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <StatusBar barStyle={barStyle} backgroundColor={C.surface} />
        <Text style={styles.errorText}>Failed to start.{'\n'}Please restart the app.</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!ready) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <StatusBar barStyle={barStyle} backgroundColor={C.surface} />
        <ActivityIndicator color={C.telemetry} size="large" />
        <Text style={styles.loadingText}>Starting up…</Text>
      </SafeAreaView>
    );
  }

  return (
    <BleProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={barStyle} backgroundColor={C.surface} />
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
  const { C } = useTheme();
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <View style={{ position: 'absolute', bottom: 24, left: 20, right: 20,
      backgroundColor: C.telemetry, borderRadius: 8, padding: 12, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{message}</Text>
    </View>
  );
}

export default function App(): React.JSX.Element {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <MWSSplash
        appName="Mission Control"
        tagline="Ride farther. Ride smarter."
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
