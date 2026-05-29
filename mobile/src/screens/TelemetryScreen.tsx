import React, { useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Share, Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import { BleStatus, BLE_LOG_FILE } from '../services/BleService';
import { useBleContext } from '../context/BleContext';
import { useTheme, InstrumentColors } from '../theme/ThemeContext';

function StatusDot({ status, C }: { status: BleStatus; C: InstrumentColors }) {
  const color = status === 'connected' ? C.sage
    : status === 'connecting' || status === 'scanning' ? C.amber
    : status === 'error' ? C.danger : C.muted;
  return (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
  );
}

function ByteGrid({ hex, label, C }: { hex: string; label: string; C: InstrumentColors }) {
  if (!hex) return null;
  const bytes = hex.match(/.{1,2}/g) ?? [];
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 10,
      borderWidth: 0.5, borderColor: C.border, padding: 14 }}>
      <Text style={{ fontSize: 11, color: C.muted, letterSpacing: 0.6,
        textTransform: 'uppercase', marginBottom: 10 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {bytes.map((b, i) => (
          <View key={i} style={{ backgroundColor: C.bg, borderRadius: 4, borderWidth: 0.5,
            borderColor: C.border, padding: 6, alignItems: 'center', minWidth: 44 }}>
            <Text style={{ fontSize: 8, color: C.muted }}>{i}</Text>
            <Text style={{ fontSize: 13, fontWeight: '500', color: C.sage }}>{b}</Text>
            <Text style={{ fontSize: 10, color: C.muted }}>{parseInt(b, 16)}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{hex}</Text>
    </View>
  );
}

export function TelemetryScreen() {
  const { instrC: C } = useTheme();
  const { status, statusMsg, telemetry, log, connect, disconnect, gpsSpeedMph, liveDrawRate } = useBleContext();

  const s = useMemo(() => StyleSheet.create({
    root:    { flex: 1, backgroundColor: C.bg },
    header:  { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 28,
      paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: C.border },
    title:   { fontSize: 22, fontWeight: '500', color: C.text, letterSpacing: 0.3 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    statusText: { fontSize: 12, color: C.muted },
    scroll:  { flex: 1 },
    scrollContent: { padding: 16, gap: 12 },
    connectBtn: { backgroundColor: C.sage, borderRadius: 8,
      paddingVertical: 14, alignItems: 'center' },
    connectBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
    logBtn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center',
      borderWidth: 0.5, borderColor: C.border },
    logBtnText: { color: C.muted, fontSize: 13 },
    section: { backgroundColor: C.surface, borderRadius: 10,
      borderWidth: 0.5, borderColor: C.border, padding: 14, gap: 8 },
    sectionTitle: { fontSize: 11, color: C.muted, letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 4 },
    metricRow: { flexDirection: 'row', justifyContent: 'space-between',
      paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
    metricLabel: { fontSize: 14, color: C.muted },
    metricValue: { fontSize: 14, fontWeight: '500', color: C.text },
    byteGridHeader: { flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2 },
    checksumRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    checksumDot: { width: 7, height: 7, borderRadius: 3.5 },
    checksumLabel: { fontSize: 10, color: C.muted },
    logCard:   { backgroundColor: C.surface, borderRadius: 10,
      borderWidth: 0.5, borderColor: C.border, padding: 14, gap: 4 },
    logLine:   { fontSize: 11, color: C.muted, fontFamily: 'monospace', lineHeight: 18 },
  }), [C]);

  const handleConnect = useCallback(async () => {
    if (status === 'connected') {
      await disconnect();
    } else {
      await connect();
    }
  }, [status, connect, disconnect]);

  const handleShareLog = useCallback(async () => {
    try {
      const exists = await RNFS.exists(BLE_LOG_FILE);
      if (!exists) {
        Alert.alert('No log yet', 'No diagnostic log found. Start a ride session to generate one.');
        return;
      }
      const content = await RNFS.readFile(BLE_LOG_FILE, 'utf8');
      await Share.share({ title: 'BLE Diagnostic Log', message: content });
    } catch (err: any) {
      Alert.alert('Share failed', err.message);
    }
  }, []);

  const btnLabel = status === 'connected' ? 'Disconnect'
    : status === 'scanning' ? 'Scanning...'
    : status === 'connecting' ? 'Connecting...'
    : 'Connect to V70';

  const btnDisabled = status === 'scanning' || status === 'connecting';

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>V70 Telemetry</Text>
        <View style={s.statusRow}>
          <StatusDot status={status} C={C} />
          <Text style={s.statusText}>{status}{statusMsg ? ` — ${statusMsg}` : ''}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

        <Pressable
          onPress={handleConnect}
          disabled={btnDisabled}
          style={[s.connectBtn,
            status === 'connected' && { backgroundColor: C.danger },
            btnDisabled && { opacity: 0.5 }
          ]}>
          <Text style={s.connectBtnText}>{btnLabel}</Text>
        </Pressable>

        <Pressable onPress={handleShareLog} style={s.logBtn}>
          <Text style={s.logBtnText}>Share Diagnostic Log</Text>
        </Pressable>

        {telemetry && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Live telemetry</Text>

            <View style={s.metricRow}>
              <Text style={s.metricLabel}>Speed</Text>
              <Text style={[s.metricValue, gpsSpeedMph == null && { color: C.muted }]}>
                {gpsSpeedMph != null ? `${gpsSpeedMph.toFixed(1)} mph` : '— GPS'}
              </Text>
            </View>

            <View style={s.metricRow}>
              <Text style={s.metricLabel}>Battery</Text>
              <Text style={[s.metricValue, telemetry.battery_v == null && { color: C.muted }]}>
                {telemetry.battery_v != null
                  ? `${telemetry.battery_v} V  (${telemetry.battery_pct ?? '—'}%)`
                  : '—'}
              </Text>
            </View>

            <View style={s.metricRow}>
              <Text style={s.metricLabel}>Assist (PAS)</Text>
              <Text style={[s.metricValue, telemetry.assist_level == null && { color: C.muted }]}>
                {telemetry.assist_level != null ? `PAS ${telemetry.assist_level}` : '—'}
              </Text>
            </View>

            <View style={s.metricRow}>
              <Text style={s.metricLabel}>Motor power</Text>
              <Text style={[s.metricValue, telemetry.motor_w == null && { color: C.muted }]}>
                {telemetry.motor_w != null ? `${telemetry.motor_w} W` : '—'}
              </Text>
            </View>

            {(() => {
              const km  = telemetry.trip_raw != null ? +(telemetry.trip_raw * 0.1).toFixed(1) : null;
              const mi  = km != null ? +(km * 0.621371).toFixed(2) : null;
              return (
                <View style={s.metricRow}>
                  <Text style={s.metricLabel}>Trip distance</Text>
                  <Text style={[s.metricValue, km == null && { color: C.muted }]}>
                    {km != null ? `${km} km  (${mi} mi)` : '—'}
                  </Text>
                </View>
              );
            })()}

            <View style={s.metricRow}>
              <Text style={s.metricLabel}>Draw rate</Text>
              <Text style={[s.metricValue, liveDrawRate == null && { color: C.muted }]}>
                {liveDrawRate != null ? `${liveDrawRate.toFixed(2)} %/mi` : '—'}
              </Text>
            </View>

            {(() => {
              const km  = telemetry.odometer_raw != null ? +(telemetry.odometer_raw * 0.1).toFixed(1) : null;
              const mi  = km != null ? +(km * 0.621371).toFixed(1) : null;
              return (
                <View style={s.metricRow}>
                  <Text style={s.metricLabel}>Odometer</Text>
                  <Text style={[s.metricValue, km == null && { color: C.muted }]}>
                    {km != null ? `${km} km  (${mi} mi)` : '—'}
                  </Text>
                </View>
              );
            })()}
          </View>
        )}

        {telemetry?.raw_notify_2 && (
          <View>
            <View style={s.byteGridHeader}>
              <Text style={[s.sectionTitle, { marginBottom: 0 }]}>Notify 2 (12FF69A4)</Text>
              {telemetry.checksum_ok != null && (
                <View style={s.checksumRow}>
                  <View style={[
                    s.checksumDot,
                    { backgroundColor: telemetry.checksum_ok ? C.sage : C.danger },
                  ]} />
                  <Text style={s.checksumLabel}>
                    {telemetry.checksum_ok ? 'XOR OK' : 'XOR FAIL'}
                  </Text>
                </View>
              )}
            </View>
            <ByteGrid hex={telemetry.raw_notify_2} label="" C={C} />
          </View>
        )}

        {log.length > 0 && (
          <View style={s.logCard}>
            <Text style={s.sectionTitle}>Log</Text>
            {log.map((line, i) => (
              <Text key={i} style={s.logLine}>{line}</Text>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}
